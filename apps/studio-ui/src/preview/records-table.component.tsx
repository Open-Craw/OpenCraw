import { Box, Table, Text } from '@chakra-ui/react'
import type { FieldTraceView } from '@opencraw/studio'

/** One record of a sample run, as kept for the Records tab and the Record tab's transform-chain trace (issue #92): `scope`/`mapping` ride along on the `record` WebSocket event now that `run-sample` keeps them (studio plan §4.2/§4.4). */
export interface PreviewRecord {
  key:      string | null
  data:     Record<string, unknown>
  scope?:   Record<string, unknown>
  mapping?: Record<string, FieldTraceView>
}

export interface RecordsTableProps {
  records:           PreviewRecord[]
  /**
   * A cell whose value is `null` was clicked: `recordIndex` is its position
   * in `records` (what `explain-why`'s `missing` target needs), `field` its
   * column. Omit to render a plain table (no Why? tab wired up yet).
   */
  onCellClick?:      (recordIndex: number, field: string) => void
  /** The cross-panel highlight's current field (issue #111), already resolved from the shared step id by the caller — this table only compares column names, it never resolves a step itself. */
  highlightedField?: string
  /** Hovering a column: the field on enter, `undefined` on leave. Omitted (no hover wiring) when the caller has nothing to resolve a column to. */
  onHoverField?:     (field: string | undefined) => void
}

/** The Records tab: one column per output field (from the records seen so far), missing values marked and clickable (issue #92's Why? tab). */
export function RecordsTable ({ records, onCellClick, highlightedField, onHoverField }: RecordsTableProps) {
  if (records.length === 0) {
    return (
      <Box p={4} color='fg.muted'>
        <Text>No records yet. Run a sample to see them here.</Text>
      </Box>
    )
  }
  const fields = fieldsOf(records)
  const hoverProps = (field: string): { onMouseEnter?: () => void, onMouseLeave?: () => void } => (
    onHoverField === undefined ? {} : { onMouseEnter: () => { onHoverField(field) }, onMouseLeave: () => { onHoverField(undefined) } }
  )

  return (
    <Table.ScrollArea h='full'>
      <Table.Root size='sm' stickyHeader>
        <Table.Header>
          <Table.Row>
            {fields.map(field => (
              <Table.ColumnHeader
                key={field}
                bg={field === highlightedField ? 'orange.subtle' : undefined}
                data-highlighted={field === highlightedField}
                {...hoverProps(field)}
              >
                {field}
              </Table.ColumnHeader>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {records.map((record, index) => (
            <Table.Row key={record.key ?? `row-${index}`}>
              {fields.map(field => (
                <Cell
                  key={field}
                  value={record.data[field]}
                  highlighted={field === highlightedField}
                  onClick={onCellClick === undefined ? undefined : () => { onCellClick(index, field) }}
                  {...hoverProps(field)}
                />
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  )
}

function Cell ({ value, onClick, highlighted = false, onMouseEnter, onMouseLeave }: { value: unknown, onClick?: () => void, highlighted?: boolean, onMouseEnter?: () => void, onMouseLeave?: () => void }) {
  const bg = highlighted ? 'orange.subtle' : undefined
  if (value === undefined) return <Table.Cell color='fg.muted' fontStyle='italic' bg={bg} data-highlighted={highlighted} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>missing</Table.Cell>
  if (value === null) {
    if (onClick === undefined) return <Table.Cell color='fg.muted' fontStyle='italic' bg={bg} data-highlighted={highlighted} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>null</Table.Cell>

    return (
      <Table.Cell color='fg.muted' fontStyle='italic' cursor='pointer' textDecoration='underline' title='Why is this missing?' bg={bg} data-highlighted={highlighted} onClick={onClick} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        null
      </Table.Cell>
    )
  }

  return <Table.Cell bg={bg} data-highlighted={highlighted} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</Table.Cell>
}

/** Every field seen on any record, in first-seen order: a record's own missing fields still get a column. Exported for `records-export.mapper.ts`'s CSV export (issue #116), which needs the same column set and order the Table view renders. */
export function fieldsOf (records: PreviewRecord[]): string[] {
  const fields: string[] = []
  for (const record of records) {
    for (const field of Object.keys(record.data)) if (!fields.includes(field)) fields.push(field)
  }

  return fields
}
