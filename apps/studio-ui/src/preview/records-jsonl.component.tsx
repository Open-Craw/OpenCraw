import { Box, Text } from '@chakra-ui/react'
import type { PreviewRecord } from './records-table.component'
import { recordsToJsonl } from './records-export.mapper'

export interface RecordsJsonlProps {
  records: PreviewRecord[]
}

/**
 * The Records tab's JSONL view (issue #116): the same records `RecordsTable`
 * renders as columns, shown raw instead — one compact JSON object per line,
 * exactly what the export button's JSONL option downloads
 * (`records-export.mapper.ts`'s `recordsToJsonl`, the one place this text is
 * built).
 */
export function RecordsJsonl ({ records }: RecordsJsonlProps) {
  if (records.length === 0) {
    return (
      <Box p={4} color='fg.muted'>
        <Text>No records yet. Run a sample to see them here.</Text>
      </Box>
    )
  }

  return (
    <Box as='pre' p={2} h='full' overflow='auto' fontFamily='mono' fontSize='xs' whiteSpace='pre-wrap'>
      {recordsToJsonl(records)}
    </Box>
  )
}
