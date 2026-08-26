import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => {
  // The repo-root .env is the single source of truth for ports, shared with
  // docker-compose and the API. '' as the prefix loads unprefixed vars too.
  const env = loadEnv(mode, '..', '')
  const webPort = Number(env.WEB_PORT ?? 17310)
  const apiPort = Number(env.API_PORT ?? 17311)

  return {
    plugins: [react(), tailwindcss()],
    envDir: '..',
    server: {
      port: webPort,
      // Without strictPort, Vite silently moves to the next free port when 17310
      // is busy — and then the API proxy and CORS origin both point at nothing.
      // Failing loudly is the whole point of reserving a port block.
      strictPort: true,
      proxy: {
        '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: './src/test-setup.ts',
    },
  }
})
