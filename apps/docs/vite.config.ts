import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 4340 },
  build: {
    rollupOptions: {
      /* THREE PAGES, all of them built. The default single-input build
         shipped only index.html; components and primitives existed on
         the dev server alone, and the old /* -> /index catch-all
         redirect masked their absence in production by serving the
         Konfabulator for every URL. Caught by the deploy smoke test. */
      input: {
        index: new URL('./index.html', import.meta.url).pathname,
        components: new URL('./components.html', import.meta.url).pathname,
        primitives: new URL('./primitives.html', import.meta.url).pathname,
      },
    },
  },
})
