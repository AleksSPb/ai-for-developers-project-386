# AGENTS.md

## Раскладка

- Одно приложение, весь код в `vite-project/`. **В корне нет `package.json`** — все npm-команды запускать из `vite-project/`.
- В корне только `README.md` (описание проекта), `docs/` (правила коммитов) и `.github/`.
- Стек: React 19 + TypeScript + Vite, UI на Mantine 9, тесты на Vitest + Testing Library. Интерфейс, документация и комментарии — на русском.

## Команды (все из `vite-project/`)

```bash
npm run dev         # dev-сервер Vite
npm run test        # vitest run (один прогон); npm run test:watch — режим наблюдения
npm run lint        # eslint .
npm run build       # tsc -b && vite build — это и есть проверка типов (отдельного скрипта typecheck нет)
npm run lint:commit # commitlint по коммитам origin/main..HEAD
```

Перед завершением: `npm run lint && npm run test && npm run build`.

Один тест: `npx vitest run src/App.test.tsx` (шаблон — `src/**/*.test.{ts,tsx}`).

## Ограничения

- **Нельзя редактировать или удалять `.github/workflows/hexlet-check.yml`** и переименовывать репозиторий: это автогенерируемый CI Хекслета (в файле стоит DO NOT EDIT), он гоняет тесты курса на каждый push.
- **Не коммитить без явного одобрения пользователя.** Правки держать в рабочем дереве и ждать команды на коммит; сообщение коммита — по правилам ниже.

## Подводные камни

- `npm install` в `vite-project/` запускает скрипт `prepare`, который пишет `.git/hooks/commit-msg` (генерирует `scripts/install-git-hooks.mjs`, файл не отслеживается). Если коммит отклоняется с «commitlint не найден» — выполните `npm install` в `vite-project/`.
- Два конфига разделены намеренно: `vite.config.ts` (Babel React Compiler + PostCSS/Mantine) и `vitest.config.ts` (обычный react-плагин, jsdom). Не объединять их.
- Setup-файл `src/test/setup.ts` подменяет `window.matchMedia` и `ResizeObserver` и вызывает `cleanup()` — в jsdom их нет, а Mantine без них падает. Тесты рендерят компоненты Mantine напрямую и должны оборачивать их в `MantineProvider` (см. `src/App.test.tsx`); провайдер из `main.tsx` в тестах не действует.
- `dist/` — артефакт сборки в `.gitignore`, не коммитить.

## Коммиты

- Conventional Commits, проверяет хук `commit-msg`. Полные правила: `docs/conventional-commits.md`; конфиг: `vite-project/commitlint.config.cjs`.
- Ограничения: 11 допустимых типов (`feat`, `fix`, `chore`, …), заголовок не длиннее 100 символов вместе с префиксом, описание с маленькой буквы, без точки в конце. Тип и scope — латиницей, **описание — по-русски, в отглагольной форме** («добавить», не «добавил»).
- Область: `vite-project` (например, `feat(vite-project): …`) — весь код лежит в этой папке.

## Состояние проекта

Учебный проект Хекслета: сервис бронирования календаря звонков (ссылка на спецификацию — в корневом `README.md`). `src/App.tsx` пока демо-шаблон Mantine, настоящие функции ещё не начаты.
