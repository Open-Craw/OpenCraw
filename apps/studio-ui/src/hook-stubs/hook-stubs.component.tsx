import { Checkbox, HStack, Input, Stack, Text } from '@chakra-ui/react'
import type { LoadedHooks } from '@opencraw/studio'
import { parseStubText } from './active-stubs.algorithm'
import { useHookStubsStore } from './hook-stubs.store'

type Remote = NonNullable<LoadedHooks['remote']>[number]

const KIND_LABEL: Record<Remote['kind'], string> = { hook: 'hook', captcha: 'captcha solver', access: 'access plugin' }

/**
 * What calls outside this machine, so a sample run is never a surprise: each remote hook, solver or
 * plugin with what it calls, and for a hook a stub: a JSON value the run answers with instead of calling
 * it (issue #201). Solvers and plugins are listed only: a stub would have no page to act on.
 */
export function HookStubs ({ remote }: { remote: readonly Remote[] }): React.JSX.Element | null {
  const entries = useHookStubsStore(state => state.entries)
  const setEnabled = useHookStubsStore(state => state.setEnabled)
  const setText = useHookStubsStore(state => state.setText)
  if (remote.length === 0) return null

  return (
    <Stack gap={1} mt={1} data-testid='hook-stubs'>
      <Text fontSize='xs'>These call outside this machine: a sample run waits for them, and they may cost.</Text>
      {remote.map((callout) => {
        const entry = entries[callout.name]
        const stubbable = callout.kind === 'hook'
        const typed = entry?.text ?? 'null'
        const enabled = entry?.enabled ?? false
        const valid = parseStubText(typed).ok

        return (
          <HStack key={`${callout.kind}:${callout.name}`} gap={2} wrap='wrap' data-testid={`remote-${callout.name}`}>
            <Text fontSize='xs'>{`${KIND_LABEL[callout.kind]} ${callout.name} → ${callout.label}`}</Text>
            {stubbable && (
              <>
                <Checkbox.Root size='xs' checked={enabled} onCheckedChange={(details) => { setEnabled(callout.name, details.checked === true) }}>
                  <Checkbox.HiddenInput />
                  <Checkbox.Control />
                  <Checkbox.Label>{`stub ${callout.name}`}</Checkbox.Label>
                </Checkbox.Root>
                <Input
                  size='xs'
                  width='220px'
                  fontFamily='mono'
                  aria-label={`stub value of ${callout.name}`}
                  aria-invalid={!valid}
                  value={typed}
                  onChange={(event) => { setText(callout.name, event.target.value) }}
                />
                {!valid && <Text fontSize='xs' color='red.fg'>not JSON: the hook is called</Text>}
              </>
            )}
          </HStack>
        )
      })}
    </Stack>
  )
}
