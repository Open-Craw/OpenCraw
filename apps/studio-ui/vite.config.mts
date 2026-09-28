/// <reference types='vitest' />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(() => ({
  root:     import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/studio-ui',
  server:   {
    port: 4200,
    host: 'localhost',
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  plugins: [react()],
  // Uncomment this if you are using workers.
  // worker: {
  //  plugins: [],
  // },
  build:   {
    // The studio server serves the built UI from here (packages/studio/src/studio-server, #89).
    outDir:               '../../packages/studio/dist/ui',
    emptyOutDir:          true,
    reportCompressedSize: true,
    commonjsOptions:      {
      transformMixedEsModules: true,
    },
  },
}))
