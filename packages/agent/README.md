<p align="center">
  <img src="https://raw.githubusercontent.com/Open-Craw/OpenCraw/main/docs/assets/opencraw-logo.svg" alt="OpenCraw" width="360">
</p>

# @opencraw/agent

The OpenCraw agent: one specification of a specialist developer who builds OpenCraw recipes with you, and the files that put it into the agent you use.

The agent:

- reads every kind of source the engine parses (web pages, APIs, PDFs, spreadsheets, decks, Word, JSON, YAML, XML, Markdown) and understands input
  recipes, output recipes and how they connect, including hooks (the callbacks a recipe can call);
- starts from a prompt that says what the input is and what the output should be, a file included, and works out what has to be read and transformed;
- knows Studio and can explain it (and drive it, when the host connects Studio's tools);
- is casual, respectful and funny, and honest about what it does not know;
- gets everything it needs from the [`@opencraw/mcp`](../mcp) server: `probe`, `list_recipes`, `docs`, `validate`, `run`, `diff`.

```ts
import { OPENCRAW_AGENT, renderAgentFiles, mergeSection } from '@opencraw/agent'

OPENCRAW_AGENT.instructions                       // the Markdown instructions
renderAgentFiles(OPENCRAW_AGENT, ['copilot', 'claude-code', 'agents-md'])
// → [{ host, path, mode, content }]: where each file goes, relative to the workspace folder
```

| Host | File |
|---|---|
| GitHub Copilot (VS Code) | `.github/agents/opencraw.agent.md` |
| Claude Code | `.claude/agents/opencraw.md` |
| Any coding agent | a section of `AGENTS.md`, between `<!-- opencraw-agent:begin -->` and `<!-- opencraw-agent:end -->`; `mergeSection` updates it and keeps the rest of the file |

The VS Code extension writes these with **OpenCraw: Add the OpenCraw agent to this workspace**. The Studio's chatbot (#293) uses the same specification,
so the agent in the editor and the agent in Studio are one.

The instructions do not repeat facts the agent could get wrong from memory: they send it to the `docs` tool for the exact syntax of a step, a selector or
a transform.
