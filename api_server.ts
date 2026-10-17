import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { FalkorDB } from 'falkordb';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { GoogleGenAI } from '@google/genai';
import { execSync } from 'child_process';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

if (!process.env.GEMINI_API_KEY) {
  console.warn('⚠️ WARNING: GEMINI_API_KEY is not set in your .env file!');
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

let falkorDb: FalkorDB;
let mcpClient: Client;

// Helper to strip $schema / additionalProperties so Gemini function calling accepts MCP schemas cleanly
function cleanSchemaForGemini(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const { $schema, additionalProperties, ...rest } = schema;
  if (rest.properties) {
    const cleanedProps: Record<string, any> = {};
    for (const [key, val] of Object.entries(rest.properties)) {
      cleanedProps[key] = cleanSchemaForGemini(val);
    }
    rest.properties = cleanedProps;
  }
  return rest;
}

async function initConnections() {
  // 1. Connect directly to FalkorDB for the UI topology endpoint
  falkorDb = await FalkorDB.connect({
    socket: { host: 'localhost', port: 6379 },
  });

  // 2. Spawn and connect to your mcp-server.ts over stdio (Windows-safe)
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['--import', 'tsx', 'mcp-server.ts'],
  });

  mcpClient = new Client(
    { name: 'chaosgraph-agent-orchestrator', version: '1.0.0' },
    { capabilities: {} }
  );

  await mcpClient.connect(transport);
  console.log('✅ Connected to FalkorDB & ChaosGraph MCP Server');
}

// GET /api/graph — Returns all nodes and edges for the React Graph Visualizer
app.get('/api/graph', async (_req, res) => {
  try {
    const graph = falkorDb.selectGraph('ChaosGraph');

    const nodesRes = await graph.query(`
      MATCH (n)
      RETURN id(n) AS id, labels(n)[0] AS label, properties(n) AS props
    `);

    const edgesRes = await graph.query(`
      MATCH (a)-[r]->(b)
      RETURN id(a) AS source, id(b) AS target, type(r) AS relationship, properties(r) AS props
    `);

    res.json({
      nodes: nodesRes.data || [],
      edges: edgesRes.data || [],
    });
  } catch (err: any) {
    console.error('Error fetching graph:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/reset — Re-runs seed.ts to reset the graph state between demo runs
app.post('/api/reset', async (_req, res) => {
  try {
    execSync('node --import tsx seed.ts', { stdio: 'inherit' });
    res.json({ status: 'Graph re-seeded cleanly' });
  } catch (err: any) {
    console.error('Error resetting graph:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/investigate — Runs the multi-hop Gemini Agent Loop using MCP tools
app.post('/api/investigate', async (req, res) => {
  const { incidentPrompt } = req.body;
  const traceSteps: Array<{
    step: number;
    tool: string;
    args: any;
    cypher: string;
    result: any;
    durationMs: number;
  }> = [];

  try {
    // 1. Discover available tools dynamically from MCP Server
    const mcpToolsList = await mcpClient.listTools();

    const geminiFunctionDeclarations = mcpToolsList.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: cleanSchemaForGemini(t.inputSchema),
    }));

    const systemInstruction = `
      You are ChaosGraph, an autonomous incident response and security triage agent powered by FalkorDB.
      To investigate any incident, latency spike, or CVE, you MUST execute this multi-hop graph reasoning sequence using your MCP tools:
      1. Call calculate_service_criticality to rank bottleneck services in the graph.
      2. Call trace_blast_radius OR find_root_cause_commits to trace multi-hop dependencies and uncover the root cause commit, PR, or CVE cascade.
      3. Call locate_code_owner on the root-cause service (such as auth-token-service) to identify which engineer owns the breaking code.
      4. Call execute_remediation_action to autonomously mitigate the issue (e.g., ROLLBACK_PR, PATCH_CVE, or ISOLATE_SERVICE) and persist the AgentAction node in FalkorDB.
      After calling all 4 tools, write a clear, explainable summary referencing the exact multi-hop node path, PR/CVE IDs, and the engineer paged.
    `;

    const contents: any[] = [{ role: 'user', parts: [{ text: incidentPrompt }] }];
    let finalAnswer = '';
    let stepCount = 0;

    // 2. Multi-Turn Agent Tool-Calling Loop
    for (let turn = 0; turn < 6; turn++) {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: geminiFunctionDeclarations }],
          temperature: 0.1,
        },
      });

      const candidate = response.candidates?.[0];
      if (!candidate?.content) break;
      contents.push(candidate.content);

      const functionCalls = response.functionCalls;
      if (!functionCalls || functionCalls.length === 0) {
        finalAnswer = response.text || 'Investigation complete.';
        break;
      }

      const functionResponsesParts: any[] = [];

      for (const call of functionCalls) {
        stepCount++;
        const start = Date.now();

        // Execute the tool through your MCP Server
        const mcpResult = await mcpClient.callTool({
          name: call.name!,
          arguments: (call.args as Record<string, unknown>) || {},
        });

        const durationMs = Date.now() - start;
        const rawText = (mcpResult.content as any)?.[0]?.text || '{}';
        const parsed = JSON.parse(rawText);

        traceSteps.push({
          step: stepCount,
          tool: call.name!,
          args: call.args,
          cypher: parsed.cypher || '',
          result: parsed.data || [],
          durationMs,
        });

        functionResponsesParts.push({
          functionResponse: {
            name: call.name!,
            response: { result: parsed.data || [] },
          },
        });
      }

      contents.push({ role: 'user', parts: functionResponsesParts });
    }

    res.json({
      answer: finalAnswer,
      traceSteps,
    });
  } catch (err: any) {
    console.error('Investigation error:', err);
    res.status(500).json({ error: err.message });
  }
});

initConnections()
  .then(() => {
    app.listen(4000, () => {
      console.log('🚀 ChaosGraph Orchestrator API running on http://localhost:4000');
    });
  })
  .catch((err) => {
    console.error('Failed to initialize connections:', err);
  });