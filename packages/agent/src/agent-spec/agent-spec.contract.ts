/** One MCP tool the agent relies on, and what it is for, so a host that lists tools can say why the agent wants them. */
export interface AgentTool {
  /** The tool's name on the OpenCraw MCP server. */
  name: string
  /** What the agent uses it for, in one line. */
  use:  string
}

/** The OpenCraw agent, host-neutral: who it is, what it knows, how it works and which tools it uses. A host-specific file is rendered from it. */
export interface AgentSpec {
  /** A short id: the name of the agent in the host (`opencraw`). */
  id:           string
  /** The agent's display name. */
  name:         string
  /** One sentence for a host's agent picker: when to pick this agent. */
  description:  string
  /** The name the MCP server is registered under in the host: the agent's tools are `<server>/<tool>` or `mcp__<server>__<tool>` there. */
  mcpServer:    string
  /** The OpenCraw MCP tools the agent uses. */
  tools:        readonly AgentTool[]
  /** The tools of a running Studio, when a host connects them (the Studio chatbot does): the agent uses them if present and describes the clicks if not. */
  studioTools:  readonly AgentTool[]
  /** The agent's instructions: Markdown, written to the agent in the second person. */
  instructions: string
}
