import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Клиент генерируется перед тестами, а не только скриптом `pretest`.
 *
 * Сгенерированный клиент не коммитится, поэтому свежий клон падал бы на
 * неразрешённом импорте. Хук `pretest` спасал только запуск через
 * `npm run test`, а любой другой — `npx vitest run`, проверка Хекслета —
 * обходился без него.
 *
 * Зависимость от способа запуска здесь была лишней: клиент нужен тестам по
 * существу, а не как побочный эффект npm-скрипта.
 */
const clientPath = fileURLToPath(new URL('./src/api/generated/calendar-api.ts', import.meta.url))

export const setup = () => {
  if (existsSync(clientPath)) {
    return
  }

  execFileSync('npx', ['orval'], { stdio: 'inherit' })
}