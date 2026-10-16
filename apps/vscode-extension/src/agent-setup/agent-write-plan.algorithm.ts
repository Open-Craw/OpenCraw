import { mergeSection } from '@opencraw/agent'
import type { AgentFile } from '@opencraw/agent'

/** What writing one agent file will do to the workspace. */
export interface AgentWrite {
  path:    string
  /** The content to write. */
  content: string
  /**
   * `create`: the file is new. `replace`: it exists and is ours to replace (the agent’s own file): the person is asked first, since they may have edited it.
   * `update-section`: it exists and only our section changes. `unchanged`: what is there already is what would be written.
   */
  action:  'create' | 'replace' | 'update-section' | 'unchanged'
}

/**
 * Decides what to write for each agent file, given what the workspace holds now.
 *
 * @param files - The files the agent is rendered to.
 * @param existing - The content of each of those paths in the workspace, `undefined` when the file is not there.
 * @returns One write per file.
 */
export function planAgentWrites (files: readonly AgentFile[], existing: ReadonlyMap<string, string | undefined>): AgentWrite[] {
  return files.map((file) => {
    const current = existing.get(file.path)
    const content = file.mode === 'section' ? mergeSection(current, file.content) : file.content
    if (current === undefined) return { path: file.path, content, action: 'create' }
    if (current === content) return { path: file.path, content, action: 'unchanged' }

    return { path: file.path, content, action: file.mode === 'section' ? 'update-section' : 'replace' }
  })
}
