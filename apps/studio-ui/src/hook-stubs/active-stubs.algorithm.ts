/** What the person typed for one hook's stub, and whether it is switched on. */
export interface HookStubEntry {
  enabled: boolean
  /** JSON: `{"amount": 9}`, `"abc"`, `42`, `null`. */
  text:    string
}

export type StubParse = { ok: true, value: unknown } | { ok: false }

/**
 * @param text - What was typed in a stub's field.
 * @returns The JSON value, or `ok: false` when the text is not JSON (an empty field is not a value).
 */
export function parseStubText (text: string): StubParse {
  if (text.trim() === '') return { ok: false }
  try {
    return { ok: true, value: JSON.parse(text) as unknown }
  } catch {
    return { ok: false }
  }
}

/**
 * The stubs a sample run is started with: every hook whose stub is on and holds valid JSON. A stub that
 * is on but not valid is left out, so the hook is called rather than answered with something half typed.
 *
 * @param entries - The stubs by hook name.
 * @returns The values by hook name, or `undefined` when none is active.
 */
export function activeStubs (entries: Readonly<Record<string, HookStubEntry>>): Record<string, unknown> | undefined {
  const active: Record<string, unknown> = {}
  for (const [name, entry] of Object.entries(entries)) {
    if (!entry.enabled) continue
    const parsed = parseStubText(entry.text)
    if (parsed.ok) active[name] = parsed.value
  }

  return Object.keys(active).length === 0 ? undefined : active
}
