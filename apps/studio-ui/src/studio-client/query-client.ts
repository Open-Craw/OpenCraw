import { QueryClient } from '@tanstack/react-query'

/**
 * Builds the `QueryClient` the app (and every test that renders a hook or a
 * component using one) wraps in a `QueryClientProvider`. Retries default to
 * off: a failed `open-workspace`/`save-recipe`/etc. call should surface right
 * away as the toolbar's error banner, not retry silently against a studio
 * server the person may have just pointed at the wrong folder.
 *
 * @returns A fresh `QueryClient`.
 */
export function createStudioQueryClient (): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries:   { retry: false },
      mutations: { retry: false },
    },
  })
}
