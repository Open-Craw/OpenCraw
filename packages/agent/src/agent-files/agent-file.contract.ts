/** The hosts the agent can be written for. */
export type AgentHost = 'copilot' | 'claude-code' | 'agents-md'

/** One file (or one section of a file) that puts the agent into a host. */
export interface AgentFile {
  host:    AgentHost
  /** Where it goes, relative to the workspace folder, with forward slashes. */
  path:    string
  /** `file`: the whole file is ours and is replaced. `section`: ours is the part between the markers; the rest of the file is the person’s and is kept. */
  mode:    'file' | 'section'
  /** The file’s content (for a section file, the section including its markers). */
  content: string
}

/** What the person sees when choosing where to put the agent. */
export interface AgentHostInfo {
  id:     AgentHost
  label:  string
  detail: string
}
