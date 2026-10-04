# Трекер задач: GitHub

Задачи и спецификации этого репозитория живут как issues в GitHub. Все операции — через CLI `gh`.

## Соглашения

- **Создать задачу**: `gh issue create --title "..." --body "..."`. Для многострочного тела используйте heredoc.
- **Прочитать задачу**: `gh issue view <number> --comments`, комментарии фильтровать через `jq`, метки забирать отдельно.
- **Список задач**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` с подходящими фильтрами `--label` и `--state`.
- **Комментарий**: `gh issue comment <number> --body "..."`
- **Добавить / снять метку**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Закрыть**: `gh issue close <number> --comment "..."`

Репозиторий определяется из `git remote -v`; внутри клона `gh` делает это сам.

## PR как поверхность для запросов

**PR как поверхность для запросов: нет.** _(Поставьте `yes`, если репозиторий считает внешние PR обращениями на фичи; флаг читает `/triage`.)_

Когда стоит `yes`, PR проходят через те же метки и состояния, что и issues, с помощью соответствующих команд `gh pr`:

- **Прочитать PR**: `gh pr view <number> --comments` и `gh pr diff <number>` для диффа.
- **Список внешних PR для triage**: `gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`, затем оставить только `authorAssociation` со значением `CONTRIBUTOR`, `FIRST_TIME_CONTRIBUTOR` или `NONE` (отбросить `OWNER`/`MEMBER`/`COLLABORATOR`).
- **Комментарий / метки / закрытие**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

У GitHub единое пространство номеров для issues и PR, поэтому голый `#42` может означать и то и другое: разрешайте через `gh pr view 42` с откатом на `gh issue view 42`.

## Когда скил говорит «publish to the issue tracker»

Создать GitHub issue.

## Когда скил говорит «fetch the relevant ticket»

Выполнить `gh issue view <number> --comments`.

## Операции wayfinding

Используются скилом `/wayfinder`. **Карта** — это один issue с **дочерними** issues в роли тикетов.

- **Карта**: один issue с меткой `wayfinder:map` и телом Notes / Decisions-so-far / Fog. `gh issue create --label wayfinder:map`.
- **Дочерний тикет**: issue, связанный с картой как GitHub sub-issue (`gh api` по эндпоинту sub-issues). Если sub-issues недоступны, добавлять тикет в task list в теле карты и писать `Part of #<map>` в начало тела тикета. Метки: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). После захвата тикет назначается на ведущего разработчика.
- **Блокировки**: нативные issue dependencies в GitHub — каноничное, видимое в UI представление. Ребро добавляется через `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`, где `<blocker-db-id>` — числовой **database id** блокера (`gh api repos/<owner>/<repo>/issues/<n> --jq .id`, _не_ `#number` и не `node_id`). GitHub сообщает `issue_dependencies_summary.blocked_by` (только открытые блокеры, живой гейт). Если зависимости недоступны, использовать строку `Blocked by: #<n>, #<n>` в начале тела тикета. Тикет разблокирован, когда закрыты все блокеры.
- **Запрос фронтира**: собрать открытые дочерние тикеты карты (`gh issue list --state open`, ограничив под-issues карты или task list), отбросить те, у которых есть открытый блокер (`issue_dependencies_summary.blocked_by > 0` либо открытый issue в строке `Blocked by`) или назначенный исполнитель; побеждает первый в порядке карты.
- **Захват**: `gh issue edit <n> --add-assignee @me` — первая запись сессии.
- **Закрытие**: `gh issue comment <n> --body "<ответ>"`, затем `gh issue close <n>`, затем добавить указатель на контекст (gist + ссылка) в Decisions-so-far карты.