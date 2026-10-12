# Соглашения по клиенту

Правила этого модуля. Общие для всего репозитория — в корневом `AGENTS.md`.

## Команды

Выполняются из `vite-project/`:

```bash
npm run dev         # dev-сервер Vite
npm run test        # vitest run (один прогон); npm run test:watch — режим наблюдения
npm run lint        # eslint .
npm run build       # tsc -b && vite build — это и есть проверка типов (отдельного скрипта typecheck нет)
npm run lint:commit # commitlint по коммитам origin/main..HEAD
```

Перед завершением: `npm run lint && npm run test && npm run build`.

Один тест: `npx vitest run src/App.test.tsx` (шаблон — `src/**/*.test.{ts,tsx}`).

## Сгенерированное из спецификации

- **Клиент API лежит в `src/api/generated/` и не коммитится** (в `.gitignore`).
  Его пересобирают `pretest`, `predev` и `prebuild` сами, так что руками
  запускать не нужно.
- **Спецификация `contract/openapi.yaml` коммитится**, в отличие от клиента.
  Правка `main.tsp` без пересобранной спецификации оставляет репозиторий в
  состоянии, где источник и артефакт расходятся: `npm run contract`, потом
  `npm run client`.
- Тест `src/test/contract.test.ts` сверяет рукописные заглушки (`src/test/handlers.ts`)
  со спецификацией и падает, если у операции не разобран хотя бы один код ответа.

## Подводные камни

- `npm install` запускает скрипт `prepare`, который пишет `.git/hooks/commit-msg`
  (генерирует `scripts/install-git-hooks.mjs`, файл не отслеживается). Если
  коммит отклоняется с «commitlint не найден» — выполните `npm install`.
- Два конфига разделены намеренно: `vite.config.ts` (Babel React Compiler +
  PostCSS/Mantine) и `vitest.config.ts` (обычный react-плагин, jsdom). Не
  объединять их.
- Setup-файл `src/test/setup.ts` подменяет `window.matchMedia` и `ResizeObserver`
  и вызывает `cleanup()` — в jsdom их нет, а Mantine без них падает. Тесты
  рендерят компоненты Mantine напрямую и должны оборачивать их в
  `MantineProvider` (см. `src/App.test.tsx`); провайдер из `main.tsx` в тестах
  не действует.
- `dist/` — артефакт сборки в `.gitignore`, не коммитить.
- **`.env.test` в репозитории — не лишний файл.** Он гасит адрес сервера
  (`VITE_API_BASE_URL=`) для тестов, потому что Vitest читает `.env` так же, как
  Vite: без него `.env.local` увёл бы 145 тестов в сеть на машину, где сервера
  нет, и заглушки (объявленные относительными путями) перестали бы отвечать.
  Пустое значение — это «адреса нет», а не адрес; `usesStubs` в `src/api/config.ts`
  различает их именно так. Тест адреса (`src/api/config.test.ts`) подставляет
  переменную через `vi.stubEnv` и не зависит от машины.
- `.env.local` переопределяет режим: заглушки поднимаются только когда адрес не
  задан. Пустая строка тоже считается отсутствием адреса.