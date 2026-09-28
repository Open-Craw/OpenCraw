import { Box, Table, Text } from '@chakra-ui/react'

export interface PreviewRecord {
  key:  string | null
  data: Record<string, unknown>
}

export interface RecordsTableProps {
  records: PreviewRecord[]
}

/** The Records tab: one column per output field (from the records seen so far), missing values marked. */
export function RecordsTable ({ records }: RecordsTableProps) {
  if (records.length === 0) {
    return (
      <Box p={4} color='fg.muted'>
        <Text>No records yet. Run a sample to see them here.</Text>
      </Box>
    )
  }
  const fields = fieldsOf(records)

  return (
    <Table.ScrollArea h='full'>
      <Table.Root size='sm' stickyHeader>
        <Table.Header>
          <Table.Row>
            {fields.map(field => <Table.ColumnHeader key={field}>{field}</Table.ColumnHeader>)}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {records.map((record, index) => (
            <Table.Row key={record.key ?? `row-${index}`}>
              {fields.map(field => <Cell key={field} value={record.data[field]} />)}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  )
}

function Cell ({ value }: { value: unknown }) {
  if (value === undefined) return <Table.Cell color='fg.muted' fontStyle='italic'>missing</Table.Cell>
  if (value === null) return <Table.Cell color='fg.muted' fontStyle='italic'>null</Table.Cell>

  return <Table.Cell>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</Table.Cell>
}

/** Every field seen on any record, in first-seen order: a record's own missing fields still get a column. */
function fieldsOf (records: PreviewRecord[]): string[] {
  const fields: string[] = []
  for (const record of records) {
    for (const field of Object.keys(record.data)) if (!fields.includes(field)) fields.push(field)
  }

  return fields
}
