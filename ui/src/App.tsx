import React, { useEffect, useState } from 'react';

interface GraphNode {
  id: number;
  label: string;
  props: Record<string, any>;
}

interface GraphEdge {
  source: number;
  target: number;
  relationship: string;
  props: Record<string, any>;
}

interface TraceStep {
  step: number;
  tool: string;
  args: Record<string, any>;
  cypher: string;
  result: any[];
  durationMs: number;
}

const SCENARIOS = [
  {
    id: 'cve',
    title: 'Zero-Day CVE-2026-8841 Alert',
    badge: 'CRITICAL CVE',
    prompt:
      'Urgent Security Alert: CVE-2026-8841 was just disclosed affecting fast-jwt-verify. Trace the multi-hop blast radius across all services, check service criticality, find the code owner of the root service, and execute a PATCH_CVE remediation action.',
    highlightNames: ['CVE-2026-8841', 'fast-jwt-verify', 'auth-token-service', 'payment-processor', 'checkout-service', 'api-gateway', 'storefront-web', 'Arjun Mehta'],
  },
  {
    id: 'checkout',
    title: 'Checkout-Service 500 Latency Spike',
    badge: 'INCIDENT P0',
    prompt:
      'Production Incident: storefront-web and checkout-service are failing with token verification errors. Calculate service criticality, trace downstream root cause commits, locate the responsible engineer, and execute a ROLLBACK_PR action.',
    highlightNames: ['storefront-web', 'api-gateway', 'checkout-service', 'payment-processor', 'auth-token-service', '8f92a1b', 'Arjun Mehta'],
  },
  {
    id: 'auth',
    title: 'Auth-Token Bottleneck Audit',
    badge: 'BLAST RADIUS',
    prompt:
      'Pre-deployment check: We are planning maintenance on auth-token-service. Calculate criticality scores, trace its full upstream blast radius, identify the primary code owner, and log an ISOLATE_SERVICE preparedness action.',
    highlightNames: ['auth-token-service', 'payment-processor', 'checkout-service', 'api-gateway', 'storefront-web', 'Arjun Mehta'],
  },
];

export default function App() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [traceSteps, setTraceSteps] = useState<TraceStep[]>([]);
  const [agentAnswer, setAgentAnswer] = useState<string>('');
  const [activeHighlights, setActiveHighlights] = useState<string[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [copiedStep, setCopiedStep] = useState<number | null>(null);

  const fetchGraph = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/graph');
      const data = await res.json();
      setNodes(data.nodes || []);
      setEdges(data.edges || []);
    } catch (e) {
      console.error('Failed to fetch graph:', e);
    }
  };

  useEffect(() => {
    fetchGraph();
  }, []);

  const runScenario = async (scenario: typeof SCENARIOS[0]) => {
    setLoading(true);
    setTraceSteps([]);
    setAgentAnswer('');
    setActiveHighlights(scenario.highlightNames);

    try {
      const res = await fetch('http://localhost:4000/api/investigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incidentPrompt: scenario.prompt }),
      });
      const data = await res.json();
      setTraceSteps(data.traceSteps || []);
      setAgentAnswer(data.answer || '');
      await fetchGraph();
    } catch (e: any) {
      setAgentAnswer('Error connecting to api_server.ts on port 4000: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const resetGraph = async () => {
    await fetch('http://localhost:4000/api/reset', { method: 'POST' });
    setTraceSteps([]);
    setAgentAnswer('');
    setActiveHighlights([]);
    await fetchGraph();
  };

  const getNodeCoords = (node: GraphNode) => {
    const label = node.label;
    const sameLabelNodes = nodes.filter((n) => n.label === label);
    const idxInLayer = sameLabelNodes.findIndex((n) => n.id === node.id);
    const ySpacing = 600 / (sameLabelNodes.length + 1);
    const y = (idxInLayer + 1) * ySpacing + 50;

    const layerX: Record<string, number> = {
      CVE: 120,
      Package: 300,
      Service: 550,
      Commit: 850,
      Engineer: 1050,
      AgentAction: 550,
    };

    let x = layerX[label] || 600;
    if (label === 'Service') {
      x = idxInLayer % 2 === 0 ? 500 : 620;
    }
    if (label === 'AgentAction') {
      return { x: 380, y: 620 };
    }
    return { x, y };
  };

  const nodeColor = (label: string) => {
    switch (label) {
      case 'Service': return '#3b82f6';
      case 'CVE': return '#ef4444';
      case 'Package': return '#f59e0b';
      case 'Commit': return '#a855f7';
      case 'Engineer': return '#10b981';
      case 'AgentAction': return '#ec4899';
      default: return '#64748b';
    }
  };

  const getNodeTitle = (n: GraphNode) =>
    n.props.name || n.props.id || n.props.hash || n.props.action_type || `${n.label}#${n.id}`;

  const copyToClipboard = (text: string, step: number) => {
    navigator.clipboard.writeText(text);
    setCopiedStep(step);
    setTimeout(() => setCopiedStep(null), 2000);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', background: '#070a13', color: '#f1f5f9', fontFamily: 'Inter, system-ui, sans-serif', overflow: 'hidden' }}>
      
      {/* LEFT PANE: Scenarios & Inspector */}
      <div style={{ width: '340px', minWidth: '340px', borderRight: '1px solid #1e293b', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', background: '#0b0f19', overflowY: 'auto' }}>
        <div>
          <div style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 700, letterSpacing: '1.2px' }}>FALKORDB + MCP TRACK 01</div>
          <h2 style={{ margin: '6px 0 2px 0', fontSize: '24px' }}>⚡ ChaosGraph AI</h2>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>
            Autonomous Blast-Radius & Incident Agent
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', letterSpacing: '0.5px' }}>INJECT INCIDENT SCENARIO</div>
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              onClick={() => runScenario(s)}
              disabled={loading}
              style={{
                textAlign: 'left',
                padding: '14px',
                borderRadius: '10px',
                border: '1px solid #334155',
                background: '#111827',
                color: '#f8fafc',
                cursor: loading ? 'wait' : 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <span style={{ fontSize: '10px', background: '#dc2626', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                {s.badge}
              </span>
              <div style={{ fontWeight: 600, marginTop: '8px', fontSize: '14px' }}>{s.title}</div>
            </button>
          ))}

          <button
            onClick={resetGraph}
            style={{
              padding: '10px',
              borderRadius: '8px',
              border: '1px solid #334155',
              background: 'transparent',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            🔄 Reset FalkorDB Graph State
          </button>
        </div>

        {selectedNode && (
          <div style={{ marginTop: 'auto', background: '#121826', border: '1px solid #334155', padding: '14px', borderRadius: '10px', fontSize: '12px' }}>
            <div style={{ fontWeight: 700, color: nodeColor(selectedNode.label), marginBottom: '6px' }}>
              :{selectedNode.label} Node Properties
            </div>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', color: '#cbd5e1', fontSize: '11px' }}>
              {JSON.stringify(selectedNode.props, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* CENTER PANE: Expanded Live Graph Canvas */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#05070c', position: 'relative' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0b0f19' }}>
          <span style={{ fontSize: '14px', fontWeight: 600, color: '#e2e8f0' }}>
            Live FalkorDB Property Graph <span style={{ color: '#38bdf8' }}>({nodes.length} Nodes, {edges.length} Edges)</span>
          </span>
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
            {['CVE', 'Package', 'Service', 'Commit', 'Engineer', 'AgentAction'].map((l) => (
              <span key={l} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: nodeColor(l) }} />
                {l}
              </span>
            ))}
          </div>
        </div>

        <svg viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
          {edges.map((e, i) => {
            const srcNode = nodes.find((n) => n.id === e.source);
            const tgtNode = nodes.find((n) => n.id === e.target);
            if (!srcNode || !tgtNode) return null;
            const p1 = getNodeCoords(srcNode);
            const p2 = getNodeCoords(tgtNode);
            const isHighlighted =
              activeHighlights.includes(getNodeTitle(srcNode)) &&
              activeHighlights.includes(getNodeTitle(tgtNode));

            return (
              <g key={i}>
                <line
                  x1={p1.x}
                  y1={p1.y}
                  x2={p2.x}
                  y2={p2.y}
                  stroke={isHighlighted ? '#f43f5e' : '#1e293b'}
                  strokeWidth={isHighlighted ? 3 : 2}
                />
                <text
                  x={(p1.x + p2.x) / 2}
                  y={(p1.y + p2.y) / 2 - 6}
                  fill={isHighlighted ? '#fda4af' : '#475569'}
                  fontSize="10"
                  fontWeight="600"
                  textAnchor="middle"
                >
                  {e.relationship}
                </text>
              </g>
            );
          })}

          {nodes.map((n) => {
            const { x, y } = getNodeCoords(n);
            const title = getNodeTitle(n);
            const isHighlighted = activeHighlights.includes(title) || n.label === 'AgentAction';

            return (
              <g
                key={n.id}
                transform={`translate(${x},${y})`}
                onClick={() => setSelectedNode(n)}
                style={{ cursor: 'pointer' }}
              >
                <circle
                  r={isHighlighted ? 24 : 18}
                  fill={nodeColor(n.label)}
                  stroke={isHighlighted ? '#ffffff' : '#0f172a'}
                  strokeWidth={isHighlighted ? 3 : 2}
                />
                <text y={36} fill="#f1f5f9" fontSize="12" fontWeight={isHighlighted ? 700 : 500} textAnchor="middle">
                  {title}
                </text>
              </g>
            );
          })}
        </svg>

        {agentAnswer && (
          <div style={{ padding: '16px 24px', borderTop: '1px solid #1e293b', background: '#0b0f19', maxHeight: '200px', overflowY: 'auto' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#10b981', marginBottom: '4px', letterSpacing: '0.5px' }}>
              ✅ AUTONOMOUS GRAPH DECISION & EXPLAINABLE PATH
            </div>
            <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#cbd5e1', whiteSpace: 'pre-wrap' }}>{agentAnswer}</div>
          </div>
        )}
      </div>

      {/* RIGHT PANE: Upgraded Live MCP Trace */}
      <div style={{ width: '440px', minWidth: '440px', borderLeft: '1px solid #1e293b', padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', background: '#0b0f19' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b', paddingBottom: '10px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🔍</span> MCP & Cypher Trace
          </div>
          <span style={{ fontSize: '11px', background: '#1e293b', color: '#38bdf8', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
            Model Context Protocol
          </span>
        </div>

        {loading && (
          <div style={{ padding: '16px', background: '#121826', border: '1px solid #334155', borderRadius: '10px', color: '#38bdf8', fontSize: '13px', textAlign: 'center' }}>
            ⚡ Agent is traversing multi-hop FalkorDB paths...
          </div>
        )}

        {!loading && traceSteps.length === 0 && (
          <div style={{ padding: '30px 20px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
            Select an incident scenario on the left to watch the agent execute deterministic graph algorithms and Cypher queries.
          </div>
        )}

        {traceSteps.map((t) => (
          <div key={t.step} style={{ background: '#111827', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px', fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            
            {/* Tool Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} />
                {t.tool}()
              </span>
              <span style={{ fontSize: '11px', background: '#064e3b', color: '#34d399', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                ⚡ {t.durationMs}ms
              </span>
            </div>

            {/* Arguments passed by Agent */}
            <div style={{ fontSize: '11px', color: '#94a3b8', background: '#080c14', padding: '6px 10px', borderRadius: '6px' }}>
              <span style={{ color: '#64748b', fontWeight: 600 }}>Arguments: </span>
              {JSON.stringify(t.args)}
            </div>

            {/* Cypher Query Box with Copy Button */}
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', letterSpacing: '0.5px' }}>EXECUTED CYPHER</span>
                <button
                  onClick={() => copyToClipboard(t.cypher.trim(), t.step)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: copiedStep === t.step ? '#34d399' : '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '10px',
                    fontWeight: 600,
                  }}
                >
                  {copiedStep === t.step ? '✓ Copied!' : '📋 Copy Query'}
                </button>
              </div>
              <pre style={{ background: '#05070c', padding: '10px', borderRadius: '6px', color: '#a5b4fc', overflowX: 'auto', fontSize: '11px', margin: 0, border: '1px solid #1e293b', maxHeight: '110px' }}>
                {t.cypher.trim()}
              </pre>
            </div>

            {/* Result Stats */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', borderTop: '1px solid #1e293b', paddingTop: '8px' }}>
              <span style={{ color: '#10b981', fontWeight: 600 }}>
                ✓ Returned {Array.isArray(t.result) ? t.result.length : 1} graph records
              </span>
              <span style={{ color: '#64748b', fontSize: '10px' }}>Step {t.step} of {traceSteps.length}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}