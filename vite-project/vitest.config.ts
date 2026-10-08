import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Зона тестов закреплена заранее.
 *
 * Интерфейс показывает время в зоне браузера, а браузер в тестах — это машина,
 * на которой их запускают. Без закрепления зоны один и тот же тест проходил бы
 * у разработчика в Москве и падал бы в CI, где машина в UTC: время в интерфейсе
 * сдвинулось бы на три часа, а ожидания ждали московские.
 *
 * Меняется `process.env.TZ` до того, как что-либо коснётся `Intl`: Node читает
 * зону один раз и кэширует её.
 */
process.env.TZ = 'Europe/Moscow'

// Отдельный конфиг от vite.config.ts: Vitest берёт его вместо вите-конфига,
// поэтому раннер не зависит от reactCompilerPreset и PostCSS, нужных сборке.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // Клиент генерируется до тестов: он не коммитится, и свежий клон иначе
    // падал бы на неразрешённом импорте — см. testGlobalSetup.ts.
    globalSetup: ['./testGlobalSetup.ts'],
  },
})