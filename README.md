# ⚡ ChaosGraph AI
### Autonomous Blast-Radius & Incident Response Agent

**Graph Hacks Submission — Track 01: Agents That Act on Connected Data**

ChaosGraph AI is an autonomous, explainable DevOps co-pilot designed to investigate cloud infrastructure incidents and potential vulnerabilities. Built around **FalkorDB**, it uses a connected property graph and Model Context Protocol (MCP) tools to trace dependencies, identify potential root causes, locate code owners, and record remediation actions.

---

## 🏗️ Architecture & Stack

```text
+-------------------------------------------------------------+
|                     React 3-Pane UI                         |
|     (Topology Canvas | Live MCP/Cypher Trace | Audit Log)   |
+------------------------------+------------------------------+
                               | HTTP / REST
+------------------------------v------------------------------+
|                Express AI Orchestrator                      |
|                  (Gemini Agent)                             |
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
```

### Key Components

1. **FalkorDB Graph Layer:** Represents connected infrastructure dependencies using graph entities such as `Service`, `Package`, `CVE`, `Commit`, `Engineer`, and `AgentAction`.
2. **Model Context Protocol (MCP):** Exposes structured graph operations to the AI agent through specialized tools.
3. **Gemini Agent Orchestrator:** Coordinates multi-step reasoning and tool calls to investigate incidents and perform supported graph operations.
4. **Interactive 3-Pane Dashboard:** Provides a topology view, MCP/Cypher execution traces, and an audit log to make agent activity easier to inspect.

---

## 🚀 Quick Start Guide

### Prerequisites

- Node.js v18+
- Docker
- Gemini API key from [Google AI Studio](https://aistudio.google.com/)

### 1. Start FalkorDB

Run the following command in your terminal:

```powershell
docker run -p 6379:6379 -p 3000:3000 -it --rm falkordb/falkordb:latest
```

### 2. Install Dependencies

From the project root, install the backend dependencies:

```bash
npm install express cors dotenv falkordb @modelcontextprotocol/sdk @google/genai
npm install -D typescript tsx @types/express @types/cors
```

### 3. Seed the Graph Database

Run the graph seeding script to populate the initial infrastructure topology:

```bash
npx tsx seed.ts
```

### 4. Configure Environment Variables

Create a `.env` file in the project root:

```ini
GEMINI_API_KEY=your_gemini_api_key_here
```

Replace the placeholder with your Gemini API key. Keep `.env` out of version control and never commit API keys.

### 5. Start the Backend

```bash
npx tsx api_server.ts
```

### 6. Launch the React Dashboard

Open a separate terminal:

```bash
cd ui
npm install
npm run dev
```

Open **http://localhost:5173** in your browser. Select an available incident scenario, such as **Zero-Day CVE-2026-8841 Alert**, to explore the agent's graph traversal, tool execution, and remediation workflow.

---

## 🛠️ MCP Tools

ChaosGraph AI includes five specialized graph tools:

- **`calculate_service_criticality`** — Analyzes service dependencies to identify critical infrastructure components and bottlenecks.
- **`trace_blast_radius`** — Traverses graph relationships to investigate how vulnerabilities may affect downstream packages and services.
- **`find_root_cause_commits`** — Searches connected commit and pull-request information to investigate possible regression sources.
- **`locate_code_owner`** — Uses graph relationships to identify engineers associated with affected infrastructure.
- **`execute_remediation_action`** — Records remediation actions in the graph using `AgentAction` nodes, including `ROLLBACK_PR`, `PATCH_CVE`, and `ISOLATE_SERVICE`.

---

## 🧰 Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React |
| Backend | Node.js, Express |
| AI Orchestration | Gemini API |
| Agent Tooling | Model Context Protocol (MCP) |
| Graph Database | FalkorDB |
| Graph Queries | Cypher |
| Development Tools | TypeScript, TSX, Docker |

---

## 🔍 Project Goals

- Explore graph-based infrastructure dependency analysis.
- Investigate incident blast radius through multi-hop graph traversal.
- Connect AI reasoning with structured, inspectable tools.
- Track remediation actions through graph-based audit records.
- Build a dashboard for visualizing infrastructure relationships and agent activity.

---

## 🚧 Project Status

ChaosGraph AI is being developed as part of **Graph Hacks 2026**. Features and workflows should be considered experimental until implemented and validated in the project codebase.

---

## 📄 License

This project is released under the **MIT License**. See the `LICENSE` file for details.


Built by Sharath Akkaldevi
