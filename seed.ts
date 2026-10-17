import { FalkorDB } from 'falkordb';

async function seedChaosGraph() {
  const db = await FalkorDB.connect({
    socket: { host: 'localhost', port: 6379 }
  });

  const graph = db.selectGraph('ChaosGraph');

  try {
    await graph.delete();
  } catch (_e) {
    // Graph did not exist yet
  }

  console.log('Seeding ChaosGraph into FalkorDB...');

  const cypherSeed = `
    CREATE
      (web:Service {name: 'storefront-web', tier: 'Tier-0', status: 'DEGRADED', sla_ms: 150}),
      (api:Service {name: 'api-gateway', tier: 'Tier-0', status: 'HEALTHY', sla_ms: 80}),
      (checkout:Service {name: 'checkout-service', tier: 'Tier-1', status: 'FAILING', sla_ms: 200}),
      (payment:Service {name: 'payment-processor', tier: 'Tier-1', status: 'HEALTHY', sla_ms: 300}),
      (auth:Service {name: 'auth-token-service', tier: 'Tier-0', status: 'DEGRADED', sla_ms: 50}),
      (inventory:Service {name: 'inventory-worker', tier: 'Tier-2', status: 'HEALTHY', sla_ms: 400}),
      (ledger:Service {name: 'fraud-ledger-db', tier: 'Tier-1', status: 'HEALTHY', sla_ms: 100}),
      (jwtPkg:Package {name: 'fast-jwt-verify', version: '2.4.1'}),
      (xmlPkg:Package {name: 'libxml-stream', version: '1.0.8'}),
      (cve:CVE {id: 'CVE-2026-8841', severity: 'CRITICAL', cvss_score: 9.8, description: 'Remote memory corruption in token parsing'}),
      (arjun:Engineer {name: 'Arjun Mehta', github_handle: 'arjun-infra', slack_id: 'U01ARJUN', on_call: true}),
      (priya:Engineer {name: 'Priya Nair', github_handle: 'priya-sec', slack_id: 'U02PRIYA', on_call: false}),
      (rohan:Engineer {name: 'Rohan Desai', github_handle: 'rohan-core', slack_id: 'U03ROHAN', on_call: true}),
      (c1:Commit {hash: '8f92a1b', pr_number: 402, message: 'Refactor token claims payload structure', timestamp: 1760510000}),
      (c2:Commit {hash: '3c11e9d', pr_number: 398, message: 'Bump fast-jwt-verify to 2.4.1', timestamp: 1760495000}),
      (c3:Commit {hash: '7a44b0c', pr_number: 385, message: 'Optimize checkout retry backoff', timestamp: 1760400000}),
      (c4:Commit {hash: '9d22f1e', pr_number: 405, message: 'Add ledger idempotency key', timestamp: 1760505000}),
      (web)-[:CALLS {avg_latency_ms: 42}]->(api),
      (api)-[:CALLS {avg_latency_ms: 95}]->(checkout),
      (api)-[:CALLS {avg_latency_ms: 18}]->(auth),
      (checkout)-[:CALLS {avg_latency_ms: 180}]->(payment),
      (checkout)-[:CALLS {avg_latency_ms: 65}]->(inventory),
      (payment)-[:CALLS {avg_latency_ms: 310}]->(auth),
      (payment)-[:CALLS {avg_latency_ms: 55}]->(ledger),
      (auth)-[:DEPENDS_ON]->(jwtPkg),
      (payment)-[:DEPENDS_ON]->(jwtPkg),
      (inventory)-[:DEPENDS_ON]->(xmlPkg),
      (cve)-[:AFFECTS]->(jwtPkg),
      (arjun)-[:AUTHORED]->(c1)-[:MODIFIED]->(auth),
      (arjun)-[:AUTHORED]->(c2)-[:MODIFIED]->(auth),
      (rohan)-[:AUTHORED]->(c3)-[:MODIFIED]->(checkout),
      (priya)-[:AUTHORED]->(c4)-[:MODIFIED]->(payment)
  `;

  await graph.query(cypherSeed);

  const checkNodes = await graph.query('MATCH (n) RETURN count(n) AS totalNodes');
  const checkEdges = await graph.query('MATCH ()-[r]->() RETURN count(r) AS totalEdges');

  console.log('✅ Nodes in ChaosGraph:', checkNodes.data);
  console.log('✅ Edges in ChaosGraph:', checkEdges.data);

  await db.close();
}

seedChaosGraph().catch(console.error);