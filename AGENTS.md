# AGENTS.md

## Раскладка

- Два модуля: клиент в `vite-project/`, сервер в `server/`. **В корне нет `package.json` и нет `pom.xml`** — npm-команды запускать из `vite-project/`, maven — из `server/`.
- В корне только `README.md` (описание проекта), `docs/` (правила коммитов) и `.github/`.
- Стек клиента: React 19 + TypeScript + Vite, UI на Mantine 9, тесты на Vitest + Testing Library. Стек сервера: Java 25 + Spring Boot 4.1.1 + Maven, база PostgreSQL, миграции Liquibase.
- Интерфейс, документация и комментарии — на русском.

## Команды клиента (из `vite-project/`)

```bash
npm run dev         # dev-сервер Vite
npm run test        # vitest run (один прогон); npm run test:watch — режим наблюдения
npm run lint        # eslint .
npm run build       # tsc -b && vite build — это и есть проверка типов (отдельного скрипта typecheck нет)
npm run lint:commit # commitlint по коммитам origin/main..HEAD
```

Перед завершением: `npm run lint && npm run test && npm run build`.

Один тест: `npx vitest run src/App.test.tsx` (шаблон — `src/**/*.test.{ts,tsx}`).

## Команды сервера (из `server/`)

```bash
mvn verify             # сборка и тесты
mvn spring-boot:run    # запуск против своей базы
mvn -Pmodels generate-sources   # сгенерировать модели API из контракта
docker compose up      # база и сервер; инструкция в server/README.md
```

Перед завершением: `mvn verify`.

## Ограничения

- **Нельзя редактировать или удалять `.github/workflows/hexlet-check.yml`** и переименовывать репозиторий: это автогенерируемый CI Хекслета (в файле стоит DO NOT EDIT), он гоняет тесты курса на каждый push.
- **Не коммитить без явного одобрения пользователя.** Правки держать в рабочем дереве и ждать команды на коммит; сообщение коммита — по правилам ниже.
- **Не удалять локальные ветки без явного одобрения** — ни через `git branch -d`, ни через `git push --delete`. Одобрение на удаление ветки не равно одобрению на удаление её локальной копии: спрашивать отдельно.
- **Не выполнять `push`, `merge`, `rebase`, `reset` и переключение веток без отдельной команды.** Согласие на один из этих шагов не распространяется на остальные.

## Подводные камни

- `npm install` в `vite-project/` запускает скрипт `prepare`, который пишет `.git/hooks/commit-msg` (генерирует `scripts/install-git-hooks.mjs`, файл не отслеживается). Если коммит отклоняется с «commitlint не найден» — выполните `npm install` в `vite-project/`.
- Два конфига разделены намеренно: `vite.config.ts` (Babel React Compiler + PostCSS/Mantine) и `vitest.config.ts` (обычный react-плагин, jsdom). Не объединять их.
- Setup-файл `src/test/setup.ts` подменяет `window.matchMedia` и `ResizeObserver` и вызывает `cleanup()` — в jsdom их нет, а Mantine без них падает. Тесты рендерят компоненты Mantine напрямую и должны оборачивать их в `MantineProvider` (см. `src/App.test.tsx`); провайдер из `main.tsx` в тестах не действует.
- `dist/` — артефакт сборки в `.gitignore`, не коммитить.
- **В Spring Boot 4 автоконфигурация Liquibase вынесена в отдельный модуль `spring-boot-liquibase`, и `starter-data-jpa` его не тянет.** Без этой зависимости `liquibase-core` лежит на classpath, но автоконфигурация в контекст не попадает: миграции молча не выполняются, схемы нет, а приложение стартует. Обнаружится это только на первой попытке обратиться к таблице.
- **Тесты сервера привязывают контейнер через `@ServiceConnection`.** Свой `@DynamicPropertySource` не подойдёт: он вызывается при сборке контекста, когда контейнер ещё не стартовал, и Spring падает с «Mapped port can only be obtained after the container is started».
- Локальный Maven может быть 3.6.x, а сервер требует 3.9.x. Сборка идёт через Docker-образ `maven:3.9-eclipse-temurin-25`, который зашит в `server/Dockerfile`; при расхождении версий проверяйте сборку в этом образе.
- **Миграции лежат в папке версии** (`server/src/main/resources/db/changelog/0.0.1/`). Папка названа версией `server/pom.xml`, в чей релиз попали её changeset'ы; правку в уже выпущенную папку не добавляют.

## Коммиты

- Conventional Commits, проверяет хук `commit-msg`. Полные правила: `docs/conventional-commits.md`; конфиг: `vite-project/commitlint.config.cjs`.
- Ограничения: 11 допустимых типов (`feat`, `fix`, `chore`, …), заголовок не длиннее 100 символов вместе с префиксом, описание с маленькой буквы, без точки в конце. Тип и scope — латиницей, **описание — по-русски, в отглагольной форме** («добавить», не «добавил»).
- Область: `vite-project` или `server` (например, `feat(vite-project): …`, `feat(server): …`) — по тому модулю, который меняется. Правки корневых файлов (`README.md`, `AGENTS.md`, `docs/`) идут без области.

## Ветки

Именование веток — по соглашению в `docs/branch-naming.md`: префикс (`feat`, `fix`, `docs`) и описание в `kebab-case` латиницей.

## Релизы

- Релизы ведёт release-please отдельным workflow (`.github/workflows/release-please.yml`), **запускается вручную**: Actions → release-please → Run workflow. Автотриггера на push в `main` нет.
- Один релиз — два прогона: первый создаёт release-PR, второй (после его мержа) ставит тег и GitHub Release.
- Версия клиента — `vite-project/package.json`, чанглог — `vite-project/CHANGELOG.md`, конфиги — `release-please-config.json` и `.release-please-manifest.json` в корне.
- **`server/` в release-please пока не заведён:** в `packages` лежит только `vite-project`, поэтому серверные релизы не выпускаются, а его версия живёт в `server/pom.xml` сама по себе. Когда пакет добавят, версии сервера и папки миграций должны совпадать.
- Теги и GitHub Releases ставит бот, руками их не создавать. Ключи `packages` в конфиге и в манифесте должны совпадать.
- Кнопка Run workflow появляется только когда файл workflow лежит в ветке по умолчанию — до мержа в `main` запустить нечего.

## Состояние проекта

Учебный проект Хекслета: сервис бронирования календаря звонков (ссылка на спецификацию — в корневом `README.md`).

Клиент написан целиком и работает на рукописных заглушках: календарь из окон
приёма, запись, отказы, раздел Владельца. `handlers.ts` остаётся заглушкой —
переключения на живой сервер ещё нет.

Сервер в `server/` — только каркас: поднимается, создаёт схему Liquibase, заводит
окна приёма. **Ни одной операции API, ни сущности, ни репозитория** — запросы
контракта возвращают `404`. Дальше по плану: операции `/windows`, `/event-types`,
`/bookings`, отказ по недоступности хранилища, CI и второй пакет release-please.

Открытые решения по серверу ведутся в трекере (`docs/agents/issue-tracker.md`); принятые перечислены в issue «Решения по серверу, принятые до карты (D1–D59)» и ссылаются по номерам (`D17`), а не пересказываются.

## Agent skills

### Трекер задач

Задачи и спецификации ведутся в GitHub Issues этого репозитория, все операции — через CLI `gh`. См. `docs/agents/issue-tracker.md`.

### Метки triage

Дефолтный словарь из пяти канонических ролей: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. См. `docs/agents/triage-labels.md`.

### Доменные доки

Раскладка single-context: `GLOSSARY.md` и `docs/adr/` в корне репозитория. См. `docs/agents/domain.md`.
