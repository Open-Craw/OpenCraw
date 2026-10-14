import { DropdownMenu } from './dropdown-menu.component'

export interface LoadMenuProps {
  /** A load is in progress: the button shows it and refuses a second one meanwhile. */
  loading:        boolean
  onLoadDocument: () => void
  onLoadUrl:      () => void
}

/**
 * "Load ▾": what the recipe reads. A document or a page is the sample the
 * recipe is built against; with a recipe of that kind open it takes the
 * recipe's start address, otherwise it starts a recipe of its own.
 */
export function LoadMenu ({ loading, onLoadDocument, onLoadUrl }: LoadMenuProps) {
  return (
    <DropdownMenu
      label='Load ▾'
      title='Bring in the document or page the recipe reads (a file can also be dropped anywhere)'
      disabled={loading}
      loading={loading}
      items={[
        { label: 'Document…', onSelect: onLoadDocument },
        { label: 'Web page (URL)…', onSelect: onLoadUrl },
      ]}
    />
  )
}
