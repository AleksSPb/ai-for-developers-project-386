import { chmodSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Приложение лежит в vite-project/, а корень репозитория уровнем выше,
// поэтому ищем .git вверх по дереву.
function findGitDir(from) {
  let current = from

  while (current !== dirname(current)) {
    const candidate = join(current, '.git')

    if (existsSync(candidate) && statSync(candidate).isDirectory()) {
      return candidate
    }

    current = dirname(current)
  }

  return null
}

const gitDir = findGitDir(projectDir)

if (!gitDir) {
  console.error('install-git-hooks: каталог .git не найден, хук не установлен')
  process.exit(0)
}

const hooksDir = join(gitDir, 'hooks')
const commitLintBin = join(projectDir, 'node_modules', '.bin', 'commitlint')
const commitLintConfig = join(projectDir, 'commitlint.config.cjs')

mkdirSync(hooksDir, { recursive: true })

// git запускает хук из корня репозитория, а конфиг лежит в vite-project/,
// поэтому путь к конфигу передаём явно. Конфига может не быть — например
// при переписывании истории, когда рабочее дерево откачено на коммит
// до его появления. Тогда проверяем встроенным @commitlint/config-conventional.
const hook = `#!/bin/sh
# Сгенерировано scripts/install-git-hooks.mjs — не редактировать.
# Проверяет сообщение коммита по conventional commits,
# правила описаны в docs/conventional-commits.md.
COMMITLINT="${commitLintBin}"
CONFIG="${commitLintConfig}"

if [ ! -x "$COMMITLINT" ]; then
  echo "commitlint не найден, выполните npm install в vite-project" >&2
  exit 1
fi

if [ -f "$CONFIG" ]; then
  exec "$COMMITLINT" --config "$CONFIG" --edit "$1"
fi

exec "$COMMITLINT" --default-config --edit "$1"
`

writeFileSync(join(hooksDir, 'commit-msg'), hook)
chmodSync(join(hooksDir, 'commit-msg'), 0o755)

console.log('install-git-hooks: хук commit-msg установлен')