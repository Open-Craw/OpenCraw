/** How one field's value was made: the value its rule read, then its value after each transform. */
export interface FieldTrace {
  /** What `from` read (a list when the rule has several sources). */
  from:  unknown
  /** One entry per transform, in order: the transform's `op` and the value it returned. */
  steps: { op: string, value: unknown }[]
}

/**
 * The trace of every mapped field of one record, by target (`price`,
 * `seller.name`, `variants[1].size` for a rule inside `each`). Filled by
 * `mapRecord` when it is given one; the crawler attaches it to `record:emit`
 * under `CrawlOptions.debug`.
 */
export type MappingTrace = Record<string, FieldTrace>
