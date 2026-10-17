⚡ ChaosGraph AI
Autonomous Blast-Radius & Incident Response Agent
Graph Hacks Submission — Track 01: Agents That Act on Connected Data
ChaosGraph AI is an autonomous, explainable DevOps co-pilot designed to resolve critical cloud infrastructure outages and zero-day vulnerabilities in real time. Built natively on FalkorDB, it replaces fragile relational joins and inaccurate flat vector RAG with a deterministic property graph and structured Model Context Protocol (MCP) tooling.
🏗️ Architecture & Stack
+-------------------------------------------------------------+
|                     React 3-Pane UI                         |
|     (Topology Canvas | Live MCP/Cypher Trace | Audit Log)   |
+------------------------------+------------------------------+
                               | HTTP / REST
+------------------------------v------------------------------+
|                Express AI Orchestrator                      |
|                  (Gemini 3.8-flash Agent)                   |
+------------------------------+------------------------------+
                               | MCP Protocol (Stdio)
+------------------------------v------------------------------+
|               ChaosGraph MCP Server                         |
|         (5 Specialized Graph Traversal Tools)               |
+------------------------------+------------------------------+
                               | Cypher Queries
+------------------------------v------------------------------+
|                     FalkorDB Database                       |
|       (17 Nodes / 19 Edges: Services, Packages, CVEs,       |
|                 Commits, Engineers, Actions)                |
+-------------------------------------------------------------+
Key Components
1. FalkorDB Graph Layer: Stores the connected dependency model (Service, Package, CVE, Commit, Engineer, AgentAction), allowing sub-millisecond multi-hop path traversals.
2. Model Context Protocol (MCP): Exposes strict, verified graph execution tools to the LLM, reducing hallucinations during database interactions.
3. Gemini 3.8-flash Orchestrator: Powers the multi-turn agent reasoning loop, analyzing critical alerts, chaining tool calls, and executing mutations.
4. Interactive 3-Pane Dashboard: Renders the live system topology, highlights failure paths, streams live MCP traces with execution timings (⚡ ms), and provides instant Cypher copy options for auditing.
🚀 Quick Start Guide
Prerequisites
- Node.js (v18+)
- Docker (for FalkorDB)
- Gemini API key (Google AI Studio)
1. Start FalkorDB
docker run -p 6379:6379 -p 3000:3000 -it --rm falkordb/falkordb:latest
2. Install Dependencies & Seed the Graph
# Install root/backend packages
npm install express cors dotenv falkordb @modelcontextprotocol/sdk @google/genai
npm install -D typescript tsx @types/express @types/cors

# Seed the 17-node topology into FalkorDB
npx tsx seed.ts
3. Configure Environment Variables
Create a .env file in the root folder:
GEMINI_API_KEY=your_gemini_api_key_here
4. Run the Orchestrator API Backend
npx tsx api_server.ts
5. Launch the React Dashboard
cd ui
npm install
npm run dev
Open http://localhost:5173 in your browser, click an incident scenario (for example, Zero-Day CVE-2026-8841 Alert), and watch the agent trace the incident, apply graph mutations, and record remediation actions.
🛠️ MCP Tools Implemented
- calculate_service_criticality: Computes bottleneck services and PageRank across dependent infrastructure tiers.
- trace_blast_radius: Uses multi-hop traversal to map how CVEs cascade through downstream packages and APIs.
- find_root_cause_commits: Identifies Git commits and pull requests potentially responsible for regressions.
- locate_code_owner: Maps affected infrastructure to responsible on-call engineers.
- execute_remediation_action: Mutates graph state by creating :AgentAction nodes (ROLLBACK_PR, PATCH_CVE, ISOLATE_SERVICE) and logging audit trails.
📄 License
MIT License — Built for Graph Hacks 2026.
