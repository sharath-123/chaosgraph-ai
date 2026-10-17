import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { FalkorDB } from 'falkordb';
import { z } from 'zod';

async function startServer() {
  const db = await FalkorDB.connect({
    socket: { host: 'localhost', port: 6379 },
  });
  const graph = db.selectGraph('ChaosGraph');

  const server = new McpServer({
    name: 'chaosgraph-falkordb-mcp',
    version: '1.0.0',
  });

  // Tool 1: Service Criticality & Bottleneck Centrality
  server.tool(
    'calculate_service_criticality',
    'Calculates multi-hop centrality and bottleneck criticality scores across the service dependency graph.',
    {},
    async () => {
      const cypher = `
        MATCH (s:Service)
        OPTIONAL MATCH path = (upstream:Service)-[:CALLS*1..5]->(s)
        WITH s, count(DISTINCT upstream) AS transitive_dependents, count(path) AS total_dependency_paths
        RETURN s.name AS service,
               s.tier AS tier,
               s.status AS status,
               transitive_dependents,
               (transitive_dependents * 2.5 + total_dependency_paths * 1.2) AS criticality_score
        ORDER BY criticality_score DESC
      `;
      const result = await graph.query(cypher);
      return {
        content: [{ type: 'text', text: JSON.stringify({ cypher, data: result.data }, null, 2) }],
      };
    }
  );

  // Tool 2: Multi-Hop (1..5) Blast Radius Traversal
  server.tool(
    'trace_blast_radius',
    'Performs a multi-hop (1..5 hops) upstream traversal to find every service impacted if targetName fails or has a CVE.',
    {
      targetName: z.string().describe('Name of Service, Package, or CVE ID (e.g., auth-token-service or CVE-2026-8841)'),
    },
    async ({ targetName }) => {
      const cypher = `
        MATCH path = (upstream:Service)-[:CALLS|DEPENDS_ON|AFFECTS*1..5]-(target)
        WHERE (target.name = $target OR target.id = $target) AND upstream <> target
        RETURN DISTINCT upstream.name AS impacted_service,
               upstream.tier AS tier,
               length(path) AS hops,
               [n IN nodes(path) | coalesce(n.name, n.id)] AS cascade_path
        ORDER BY hops ASC
      `;
      const result = await graph.query(cypher, { params: { target: targetName } });
      return {
        content: [{ type: 'text', text: JSON.stringify({ cypher, data: result.data }, null, 2) }],
      };
    }
  );

  // Tool 3: Root Cause Commit & PR Finder
  server.tool(
    'find_root_cause_commits',
    'Traverses downstream from a failing service (up to 4 hops) to find recent commits and PRs that modified dependencies.',
    {
      failingService: z.string().describe('Name of failing service (e.g., storefront-web or checkout-service)'),
    },
    async ({ failingService }) => {
      const cypher = `
        MATCH path = (symptom:Service {name: $failingService})-[:CALLS*0..4]->(dep:Service)<-[:MODIFIED]-(c:Commit)<-[:AUTHORED]-(e:Engineer)
        RETURN dep.name AS dependency_modified,
               c.hash AS commit_hash,
               c.pr_number AS pr_number,
               c.message AS commit_message,
               e.name AS author,
               [n IN nodes(path) | coalesce(n.name, n.hash)] AS traversal_path
        ORDER BY c.timestamp DESC
      `;
      const result = await graph.query(cypher, { params: { failingService } });
      return {
        content: [{ type: 'text', text: JSON.stringify({ cypher, data: result.data }, null, 2) }],
      };
    }
  );

  // Tool 4: Code Owner Centrality Lookup
  server.tool(
    'locate_code_owner',
    'Finds the engineer with the highest commit centrality on the target service to page or assign a rollback PR.',
    {
      serviceName: z.string().describe('Target service name (e.g., auth-token-service)'),
    },
    async ({ serviceName }) => {
      const cypher = `
        MATCH (e:Engineer)-[:AUTHORED]->(c:Commit)-[:MODIFIED]->(s:Service {name: $serviceName})
        RETURN e.name AS engineer, e.github_handle AS github, e.slack_id AS slack, e.on_call AS on_call, count(c) AS commit_count
        ORDER BY commit_count DESC
      `;
      const result = await graph.query(cypher, { params: { serviceName } });
      return {
        content: [{ type: 'text', text: JSON.stringify({ cypher, data: result.data }, null, 2) }],
      };
    }
  );

  // Tool 5: Autonomous Graph Action & Audit Logger
  server.tool(
    'execute_remediation_action',
    'Executes an autonomous remediation action and persists the decision node in FalkorDB.',
    {
      actionType: z.enum(['ROLLBACK_PR', 'ISOLATE_SERVICE', 'PATCH_CVE']),
      targetService: z.string(),
      prNumber: z.number().optional(),
      assignedEngineer: z.string(),
      reasoningPath: z.string(),
    },
    async ({ actionType, targetService, prNumber, assignedEngineer, reasoningPath }) => {
      const cypher = `
        MATCH (s:Service {name: $targetService}), (e:Engineer {name: $assignedEngineer})
        CREATE (a:AgentAction {
          action_type: $actionType,
          pr_number: $prNumber,
          reasoning_path: $reasoningPath,
          timestamp: timestamp()
        })
        CREATE (a)-[:MITIGATES]->(s)
        CREATE (a)-[:ASSIGNED_TO]->(e)
        SET s.status = 'REMEDIATING'
        RETURN a.action_type AS action, s.name AS target, e.slack_id AS paged_slack
      `;
      const result = await graph.query(cypher, {
        params: {
          actionType,
          targetService,
          prNumber: prNumber ?? 0,
          assignedEngineer,
          reasoningPath,
        },
      });
      return {
        content: [{ type: 'text', text: JSON.stringify({ cypher, data: result.data }, null, 2) }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('ChaosGraph MCP Server connected to FalkorDB and listening on stdio...');
}

startServer().catch(console.error);