import { render, screen } from '@testing-library/react'
import { ChakraProvider, defaultSystem } from '@chakra-ui/react'
import { BlankSnapshotNotice } from './blank-snapshot-notice.component'

describe('BlankSnapshotNotice', () => {
  it('says the page builds its content with JavaScript and points at Inspect', () => {
    render(<ChakraProvider value={defaultSystem}><BlankSnapshotNotice /></ChakraProvider>)
    expect(screen.getByRole('status').textContent).toMatch(/JavaScript/)
    expect(screen.getByRole('status').textContent).toMatch(/Inspect/)
  })
})
