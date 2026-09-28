import { Box, Stack, Table, Text } from '@chakra-ui/react'
import type { RejectedRecord } from '../studio-store'

export interface RejectedListProps {
  rejected: RejectedRecord[]
  /** A row was clicked: its position in `rejected` (`explain-why`'s `rejected` target needs it). */
  onClick?: (rejectedIndex: number) => void
}

/** A compact list of the records a sample run rejected, alongside the Records tab: each row names the field and the engine's own reason, and is clickable for the Why? tab (issue #92). */
export function RejectedList ({ rejected, onClick }: RejectedListProps) {
  if (rejected.length === 0) return null

  return (
    <Stack borderTopWidth='1px' gap={0} flexShrink={0} maxH='30%' overflow='auto'>
      <Box px={3} py={1} fontSize='xs' fontWeight='semibold' color='fg.muted'>Rejected ({rejected.length})</Box>
      <Table.Root size='sm'>
        <Table.Body>
          {rejected.map((entry, index) => (
            <Table.Row
              key={`${entry.field}-${index}`}
              cursor={onClick === undefined ? undefined : 'pointer'}
              onClick={onClick === undefined ? undefined : () => { onClick(index) }}
            >
              <Table.Cell fontFamily='mono' fontWeight='medium'>{entry.field}</Table.Cell>
              <Table.Cell color='fg.error'><Text truncate>{entry.reason}</Text></Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Stack>
  )
}
