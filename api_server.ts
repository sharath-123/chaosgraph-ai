
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { FalkorDB } from 'falkordb';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { GoogleGenAI } from '@google/genai';
import Groq from 'groq-sdk';
import { execSync } from 'child_process';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 4000);
const GRAPH_NAME = 'ChaosGraph';
const MAX_TURNS = 10;

if (!process.env.GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY is not configured.');
}

if (!process.env.GROQ_API_KEY) {
  console.warn('GROQ_API_KEY is not configured.');
}

const ai = process.env.GEMINI_API_KEY
  ? new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
  : null;

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

let falkorDb: FalkorDB;
let mcpClient: Client;

type ToolCall = {
  name: string;
  args: Record<string, unknown>;
  id: string;
};

type TraceStep = {
  step: number;
  tool: string;
  args: Record<string, unknown>;
  cypher: string;
  result: unknown;
  durationMs: number;
};

const VALID_TYPES = new Set([
  'object',
  'array',
  'string',
  'number',
  'integer',
  'boolean',
  'null',
]);

/**
 * Convert MCP input schemas into a conservative JSON Schema subset.
 * Preserve supported types and argument constraints.
 */
function cleanSchema(schema: any, provider: 'gemini' | 'groq'): any {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { type: 'object', properties: {} };
  }

  // Flatten basic allOf wrappers while retaining merged constraints.
  const merged: any = { ...schema };
  delete merged.allOf;

  if (Array.isArray(schema.allOf)) {
    for (const part of schema.allOf) {
      if (part && typeof part === 'object') {
        Object.assign(merged, part);
        merged.properties = {
          ...(part.properties || {}),
          ...(schema.properties || {}),
        };
      }
    }
  }

  let type = merged.type;

  // MCP/Zod-generated schemas can contain malformed type metadata.
  if (
    typeof type !== 'string' ||
    !VALID_TYPES.has(type)
  ) {
    type = merged.properties ? 'object' : undefined;
  }

  // Groq function parameters must have an object at the root.
  if (provider === 'groq' && !merged.properties && !type) {
    type = 'object';
  }

  const result: any = {};

  if (type) result.type = type;

  if (typeof merged.description === 'string') {
    result.description = merged.description;
  }

  if (merged.enum !== undefined && Array.isArray(merged.enum)) {
    result.enum = merged.enum;
  }

  if (merged.const !== undefined) {
    result.enum = [merged.const];
  }

  if (merged.properties && typeof merged.properties === 'object') {
    result.properties = {};

    for (const [key, value] of Object.entries(merged.properties)) {
      result.properties[key] = cleanSchema(value, provider);
    }

    if (Array.isArray(merged.required)) {
      result.required = merged.required.filter(
        (key: unknown) =>
          typeof key === 'string' &&
          Object.prototype.hasOwnProperty.call(result.properties, key)
      );
    }

    if (provider === 'groq') {
      result.additionalProperties = false;
    } else if (typeof merged.additionalProperties === 'boolean') {
      result.additionalProperties = merged.additionalProperties;
    }
  }

  if (type === 'array') {
    result.items = cleanSchema(merged.items, provider);
  }

  // Retain commonly supported numeric/string constraints.
  for (const key of [
    'minimum',
    'maximum',
    'exclusiveMinimum',
    'exclusiveMaximum',
    'minLength',
    'maxLength',
    'minItems',
    'maxItems',
    'pattern',
  ]) {
    if (merged[key] !== undefined) {
      result[key] = merged[key];
    }
  }

  return result;
}

function parseToolResult(content: any): any {
  const text = Array.isArray(content)
    ? content
        .filter((item: any) => item?.type === 'text')
        .map((item: any) => item.text)
        .join('\n')
    : '';

  if (!text) return { data: content ?? [] };

  try {
    return JSON.parse(text);
  } catch {
    return { data: text };
  }
}

async function initConnections() {
  falkorDb = await FalkorDB.connect({
    socket: { host: 'localhost', port: 6379 },
  });

  const transport = new StdioClientTransport({
    command: 'node',
    args: ['--import', 'tsx', 'mcp-server.ts'],
  });

  mcpClient = new Client(
    {
      name: 'chaosgraph-agent-orchestrator',
      version: '1.1.0',
    },
    { capabilities: {} }
  );

  await mcpClient.connect(transport);

  console.log('Connected to FalkorDB and ChaosGraph MCP Server');
}

// Health endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    geminiConfigured: Boolean(ai),
    groqConfigured: Boolean(groq),
  });
});

// Graph topology for the frontend
app.get('/api/graph', async (_req, res) => {
  try {
    const graph = falkorDb.selectGraph(GRAPH_NAME);

    const [nodesRes, edgesRes] = await Promise.all([
      graph.query(`
        MATCH (n)
        RETURN id(n) AS id, labels(n)[0] AS label,
               properties(n) AS props
      `),
      graph.query(`
        MATCH (a)-[r]->(b)
        RETURN id(a) AS source, id(b) AS target,
               type(r) AS relationship, properties(r) AS props
      `),
    ]);

    res.json({
      nodes: nodesRes.data || [],
      edges: edgesRes.data || [],
    });
  } catch (err: any) {
    console.error('Graph query failed:', err.message);
    res.status(500).json({ error: 'Failed to fetch graph topology.' });
  }
});

// Reset the graph for repeatable demo runs
app.post('/api/reset', async (_req, res) => {
  try {
    execSync('node --import tsx seed.ts', {
      stdio: 'inherit',
      timeout: 120_000,
    });

    res.json({ status: 'Graph re-seeded successfully' });
  } catch (err: any) {
    console.error('Graph reset failed:', err.message);
    res.status(500).json({ error: 'Failed to reset graph.' });
  }
});

const systemInstruction = `
You are ChaosGraph, an incident response and security triage agent
powered by FalkorDB and MCP tools.

Investigate the user's incident using the available tools.

When applicable, follow this sequence:
1. Call calculate_service_criticality to rank affected services.
2. Call trace_blast_radius or find_root_cause_commits to investigate
   dependencies, root causes, commits, and CVE relationships.
3. Call locate_code_owner for the relevant root-cause service.
4. Call execute_remediation_action only when the requested action is
   authorized and its arguments are supported by the tool schema.

Do not invent graph nodes, relationships, commits, CVEs, owners, or results.
Base conclusions on actual tool responses.
Explain incomplete investigations honestly.
Do not repeat a remediation action that has already succeeded.
`;

// POST /api/investigate
app.post('/api/investigate', async (req, res) => {
  const incidentPrompt = req.body?.incidentPrompt;

  if (typeof incidentPrompt !== 'string' || !incidentPrompt.trim()) {
    res.status(400).json({
      error: 'incidentPrompt must be a non-empty string.',
    });
    return;
  }

  if (!mcpClient) {
    res.status(503).json({ error: 'MCP client is not ready.' });
    return;
  }

  const traceSteps: TraceStep[] = [];
  const executedTools = new Set<string>();

  // Gemini maintains its native conversation format.
  const geminiContents: any[] = [
    { role: 'user', parts: [{ text: incidentPrompt }] },
  ];

  // Groq maintains OpenAI-compatible tool-call history.
  let groqMessages: any[] = [
    { role: 'user', content: incidentPrompt },
  ];

  let activeProvider: 'gemini' | 'groq' = ai ? 'gemini' : 'groq';
  let finalAnswer = '';
  let stepCount = 0;

  try {
    const mcpToolsList = await mcpClient.listTools();

    const toolNames = new Set(mcpToolsList.tools.map((t) => t.name));

    const geminiTools = mcpToolsList.tools.map((t) => ({
      name: t.name,
      description: t.description || '',
      parameters: cleanSchema(t.inputSchema, 'gemini'),
    }));

    const groqTools = mcpToolsList.tools.map((t) => {
      const parameters = cleanSchema(t.inputSchema, 'groq');

      if (parameters.type !== 'object') {
        throw new Error(
          `Invalid root parameters schema for MCP tool "${t.name}".`
        );
      }

      return {
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description || '',
          parameters,
        },
      };
    });

    // Check schemas before the first provider request.
    for (const tool of groqTools) {
      if (
        !tool.function.parameters ||
        tool.function.parameters.type !== 'object'
      ) {
        throw new Error(
          `Invalid Groq schema: ${tool.function.name}`
        );
      }
    }

    console.log(
      `Investigation started. Provider: ${activeProvider}. Tools: ${toolNames.size}`
    );

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      let calls: ToolCall[] = [];
      let textResponse = '';

      if (activeProvider === 'gemini') {
        if (!ai) {
          activeProvider = 'groq';
          continue;
        }

        try {
          const response = await ai.models.generateContent({
            model: 'gemini-3.8-flash',
            contents: geminiContents,
            config: {
              systemInstruction,
              tools: [{ functionDeclarations: geminiTools }],
              temperature: 0.1,
            },
          });

          const candidate = response.candidates?.[0];
          const candidateContent = candidate?.content;

          if (candidateContent) {
            geminiContents.push(candidateContent);
          }

          textResponse = response.text || '';

          const functionCalls = response.functionCalls || [];

          calls = functionCalls.map((call: any, index: number) => ({
            name: call.name,
            args: (call.args || {}) as Record<string, unknown>,
            id: `gemini-${turn}-${index}`,
          }));

          if (calls.length > 0) {
            // Preserve Gemini tool calls in the Groq-compatible history.
            groqMessages.push({
              role: 'assistant',
              content: textResponse || null,
              tool_calls: calls.map((call) => ({
                id: call.id,
                type: 'function',
                function: {
                  name: call.name,
                  arguments: JSON.stringify(call.args),
                },
              })),
            });
          } else if (textResponse) {
            groqMessages.push({
              role: 'assistant',
              content: textResponse,
            });
          }
        } catch (err: any) {
          console.warn(
            'Gemini request failed; switching to Groq:',
            err.message
          );

          if (!groq) {
            throw new Error(
              'Gemini failed and GROQ_API_KEY is not configured.'
            );
          }

          activeProvider = 'groq';

          // If tools already ran, provide their results to Groq so it can
          // continue the investigation rather than blindly restarting.
          if (traceSteps.length > 0) {
            groqMessages = [
              {
                role: 'user',
                content: [
                  `Incident: ${incidentPrompt}`,
                  '',
                  'Tools already executed; do not repeat successful actions:',
                  JSON.stringify(traceSteps),
                  '',
                  'Continue the investigation using remaining tools.',
                ].join('\n'),
              },
            ];
          } else {
            groqMessages = [
              { role: 'user', content: incidentPrompt },
            ];
          }

          continue;
        }
      } else {
        if (!groq) {
          throw new Error(
            'Groq is not configured. Set GROQ_API_KEY in .env.'
          );
        }

        const completion = await groq.chat.completions.create({
          model: 'openai/gpt-oss-20b',
          messages: [
            { role: 'system', content: systemInstruction },
            ...groqMessages,
          ],
          tools: groqTools,
          temperature: 0.1,
        });

        const message = completion.choices[0]?.message;

        if (!message) {
          throw new Error('Groq returned an empty response.');
        }

        textResponse = message.content || '';

        if (message.tool_calls?.length) {
          groqMessages.push({
            role: 'assistant',
            content: message.content || null,
            tool_calls: message.tool_calls,
          });

          calls = message.tool_calls.map((tc: any) => {
            let args: Record<string, unknown> = {};

            try {
              args = JSON.parse(tc.function.arguments || '{}');
            } catch {
              throw new Error(
                `Groq returned invalid JSON arguments for ${tc.function.name}.`
              );
            }

            return {
              name: tc.function.name,
              args,
              id: tc.id,
            };
          });
        } else {
          groqMessages.push({
            role: 'assistant',
            content: textResponse,
          });
        }
      }

      if (calls.length === 0) {
        finalAnswer = textResponse;
        break;
      }

      const geminiFunctionResponses: any[] = [];

      for (const call of calls) {
        if (!toolNames.has(call.name)) {
          throw new Error(`Unknown MCP tool requested: ${call.name}`);
        }

        // Avoid replaying successful side-effecting actions on failover.
        if (
          call.name === 'execute_remediation_action' &&
          executedTools.has(call.name)
        ) {
          const skipped = {
            skipped: true,
            reason: 'A remediation action has already been executed.',
          };

          geminiFunctionResponses.push({
            functionResponse: {
              name: call.name,
              response: { result: skipped },
            },
          });

          if (activeProvider === 'groq') {
            groqMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify(skipped),
            });
          }

          continue;
        }

        stepCount++;
        const startedAt = Date.now();

        const mcpResult = await mcpClient.callTool({
          name: call.name,
          arguments: call.args,
        });

        const durationMs = Date.now() - startedAt;
        const parsed = parseToolResult(mcpResult.content);

        if (mcpResult.isError) {
          throw new Error(
            `MCP tool "${call.name}" failed: ${JSON.stringify(parsed)}`
          );
        }

        if (call.name === 'execute_remediation_action') {
          executedTools.add(call.name);
        }

        const resultData = parsed.data ?? parsed.result ?? parsed;

        traceSteps.push({
          step: stepCount,
          tool: call.name,
          args: call.args,
          cypher: parsed.cypher || '',
          result: resultData,
          durationMs,
        });

        const toolOutput = JSON.stringify({
          result: resultData,
          cypher: parsed.cypher || '',
        });

        geminiFunctionResponses.push({
          functionResponse: {
            name: call.name,
            response: { result: resultData },
          },
        });

        // Match every Groq tool result to its original call ID.
        if (activeProvider === 'groq') {
          groqMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: toolOutput,
          });
        } else {
          // Also keep Groq's history in sync when Gemini is active.
          const assistantEntry = groqMessages[
            groqMessages.length - 1
          ];

          if (assistantEntry?.role === 'assistant') {
            // Results are appended after the assistant tool-call message.
          }
        }
      }

      if (activeProvider === 'gemini') {
        geminiContents.push({
          role: 'user',
          parts: geminiFunctionResponses,
        });

        // Record tool outputs in Groq history for a later fallback.
        const lastAssistant = groqMessages[groqMessages.length - 1];

        if (lastAssistant?.tool_calls) {
          for (let i = 0; i < calls.length; i++) {
            const call = calls[i];

            const matchingTrace = [...traceSteps]
              .reverse()
              .find((step) => step.tool === call.name);

            groqMessages.push({
              role: 'tool',
              tool_call_id: call.id,
              content: JSON.stringify({
                result: matchingTrace?.result ?? [],
              }),
            });
          }
        }
      }
    }

    res.json({
      answer:
        finalAnswer ||
        'The investigation reached its turn limit. Review the trace for completed steps.',
      provider: activeProvider,
      traceSteps,
      completed: Boolean(finalAnswer),
    });
  } catch (err: any) {
    console.error('Investigation failed:', err.message);

    res.status(500).json({
      error: err.message || 'Investigation failed.',
      provider: activeProvider,
      traceSteps,
    });
  }
});

initConnections()
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        `ChaosGraph Orchestrator API running on http://localhost:${PORT}`
      );
    });
  })
  .catch((err) => {
    console.error('Failed to initialize ChaosGraph:', err.message);
    process.exitCode = 1;
  });
