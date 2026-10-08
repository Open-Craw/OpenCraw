import { Box, CloseButton, Dialog, Portal, Text } from '@chakra-ui/react'
import type { PreviewRecord } from './records-table.component'

export interface RecordDetailDialogProps {
  /** The selected record, or `undefined` while nothing is selected (the dialog is closed). */
  record:  PreviewRecord | undefined
  /** Its position in the run's records, shown in the title. */
  index:   number | undefined
  onClose: () => void
}

/**
 * One selected entry of the Records tab, opened from a Table row or a JSONL
 * line (issue #107): the record's `data` pretty-printed, so long or nested
 * values are readable without widening a column.
 */
export function RecordDetailDialog ({ record, index, onClose }: RecordDetailDialogProps) {
  return (
    <Dialog.Root open={record !== undefined} onOpenChange={(details) => { if (!details.open) onClose() }} size='lg' placement='center' scrollBehavior='inside'>
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header display='flex' flexDirection='row' alignItems='center' justifyContent='space-between'>
              <Box minW={0}>
                <Dialog.Title>Record {index === undefined ? '' : index + 1}</Dialog.Title>
                {record?.key != null && <Text fontSize='xs' color='fg.muted' truncate title={record.key}>{record.key}</Text>}
              </Box>
              <Dialog.CloseTrigger asChild>
                <CloseButton size='sm' aria-label='Close record' />
              </Dialog.CloseTrigger>
            </Dialog.Header>
            <Dialog.Body pb={4}>
              <Box as='pre' fontFamily='mono' fontSize='xs' whiteSpace='pre-wrap' wordBreak='break-word'>
                {record === undefined ? '' : JSON.stringify(record.data, null, 2)}
              </Box>
            </Dialog.Body>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  )
}
