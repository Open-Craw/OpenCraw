import { Tabs } from '@chakra-ui/react'
import type { PreviewRecord } from './records-table.component'
import { RecordsTable } from './records-table.component'
import { TracePanel } from './trace-panel.component'

export interface PreviewStripProps {
  records:    PreviewRecord[]
  traceLines: string[]
}

/**
 * The preview strip along the bottom of the window: Records and Trace.
 * Why? (a click on a missing cell explaining why) is phase 3 (#92).
 */
export function PreviewStrip ({ records, traceLines }: PreviewStripProps) {
  return (
    <Tabs.Root defaultValue='records' h='full' display='flex' flexDirection='column'>
      <Tabs.List>
        <Tabs.Trigger value='records'>Records ({records.length})</Tabs.Trigger>
        <Tabs.Trigger value='trace'>Trace</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value='records' flex='1' minH='0' overflow='auto' p={0}>
        <RecordsTable records={records} />
      </Tabs.Content>
      <Tabs.Content value='trace' flex='1' minH='0' overflow='auto' p={0}>
        <TracePanel lines={traceLines} />
      </Tabs.Content>
    </Tabs.Root>
  )
}
