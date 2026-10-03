import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// Отдельный конфиг от vite.config.ts: Vitest берёт его вместо vite-конфига,
// поэтому раннер не зависит от reactCompilerPreset и PostCSS, нужных сборке.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
  },
})