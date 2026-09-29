import { Tabs } from '@chakra-ui/react'
import type { WhyView } from '@opencraw/studio'
import type { RejectedRecord } from '../studio-store'
import type { PreviewRecord } from './records-table.component'
import { RecordsPanel } from './records-panel.component'
import { RejectedList } from './rejected-list.component'
import { TracePanel } from './trace-panel.component'
import { WhyPanel } from './why-panel.component'

export interface PreviewStripProps {
  records:            PreviewRecord[]
  traceLines:         string[]
  /** Records the last sample run rejected (issue #92); omit for the plain Records/Trace strip phases 0–2 shipped. */
  rejected?:          RejectedRecord[]
  /** A missing (`null`) cell was clicked in the Records tab. */
  onExplainMissing?:  (recordIndex: number, field: string) => void
  /** A row of the rejected list was clicked. */
  onExplainRejected?: (rejectedIndex: number) => void
  whyLoading?:        boolean
  whyView?:           WhyView
  whyError?:          string
  /** See `RecordsTableProps.highlightedField`/`onHoverField` (issue #111). */
  highlightedField?:  string
  onHoverField?:      (field: string | undefined) => void
}

/**
 * The preview strip along the bottom of the window: Records, Trace, and
 * Why? (issue #92) — a sentence explaining whichever missing or rejected
 * value was last clicked in Records or the rejected list.
 */
export function PreviewStrip ({ records, traceLines, rejected = [], onExplainMissing, onExplainRejected, whyLoading, whyView, whyError, highlightedField, onHoverField }: PreviewStripProps) {
  return (
    <Tabs.Root defaultValue='records' h='full' display='flex' flexDirection='column'>
      <Tabs.List>
        <Tabs.Trigger value='records'>Records ({records.length})</Tabs.Trigger>
        <Tabs.Trigger value='trace'>Trace</Tabs.Trigger>
        <Tabs.Trigger value='why'>Why?</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value='records' flex='1' minH='0' p={0} display='flex' flexDirection='column'>
        <RecordsPanel records={records} onCellClick={onExplainMissing} highlightedField={highlightedField} onHoverField={onHoverField} />
        <RejectedList rejected={rejected} onClick={onExplainRejected} />
      </Tabs.Content>
      <Tabs.Content value='trace' flex='1' minH='0' overflow='auto' p={0}>
        <TracePanel lines={traceLines} />
      </Tabs.Content>
      <Tabs.Content value='why' flex='1' minH='0' overflow='auto' p={0}>
        <WhyPanel loading={whyLoading} view={whyView} error={whyError} />
      </Tabs.Content>
    </Tabs.Root>
  )
}
