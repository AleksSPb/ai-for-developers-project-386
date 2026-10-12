# Образ приложения для внешней проверки (Hexlet project check) — и для деплоя.
#
# Проверка собирает этот файл из корня репозитория, запускает ОДИН контейнер с
# `-e PORT=8080` и ждёт `200` на `GET /`. Ни базы, ни её адреса она не даёт,
# поэтому образ самодостаточен:
#   * клиент собирается здесь и отдаётся Spring'ом со своего же адреса (D73);
#   * PostgreSQL поднимает entrypoint — и только при локальном хосте базы (D74).
#
# `server/Dockerfile` остаётся для локального `docker compose` и Render: он
# собирает только сервер. Дублирование стадии сборки — осознанное решение (D76),
# а не забытая правка: у этих файлов разные задачи.
#
# Контекст сборки — корень репозитория: модели API генерируются при сборке из
# `vite-project/contract/openapi.yaml`. Что в контекст не попадает, решает
# `.dockerignore` в корне.

# --- Клиент ---
FROM node:24-slim AS client

WORKDIR /build/vite-project

# `scripts/` копируется раньше установки, потому что пакет содержит `prepare`,
# который ставит git-хук. В образе `.git` нет, и скрипт сообщит, что хук не
# установлен, но файл скрипта обязан быть на месте — иначе `npm ci` падает.
COPY vite-project/package.json vite-project/package-lock.json ./
COPY vite-project/scripts ./scripts
RUN npm ci

COPY vite-project/ ./

# Адрес `/` — «сервер по тому же адресу, что и страница»: клиент отдаёт этот же
# контейнер, а заглушки при заданном адресе не поднимаются (D75).
RUN VITE_API_BASE_URL=/ npm run build

# --- Сервер ---
FROM maven:3.9-eclipse-temurin-25 AS build

# Раскладка повторяет структуру репозитория: `contract.file` в pom указывает
# на `../vite-project/contract/openapi.yaml` относительно `basedir`.
WORKDIR /build/server

# Зависимости копируются раньше исходников: слой с ними переиспользуется, пока
# меняются только файлы приложения.
COPY server/pom.xml ./
RUN mvn -B -q dependency:go-offline

COPY server/src ./src
COPY vite-project/contract ../vite-project/contract

# Линтер живёт в `validate`, а `validate` раньше `package`, поэтому конфиги
# нужны уже на этой сборке. Без них `checkstyle:check` падает с «Could not find
# resource 'checkstyle.xml'».
COPY server/checkstyle.xml server/checkstyle-suppressions.xml ./

RUN mvn -B -q clean package -DskipTests

# --- Запуск ---
FROM eclipse-temurin:25-jre

# PostgreSQL живёт в этом же образе: проверка второго контейнера не поднимает, и
# взять базу ей неоткуда (D73). Пакет заводит кластер при сборке образа, а
# стартует его entrypoint — только когда база нужна локальная (D74).
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Непривилегированный пользователь: процесс в контейнере не должен быть root.
# Встроенной базе он не подходит — PostgreSQL отказывается работать под root,
# поэтому база стартует от пакетного `postgres`, а entrypoint переключается на
# этого пользователя перед запуском JVM.
RUN useradd --system --create-home --uid 10001 calendar

COPY --from=build /build/server/target/server-*.jar /app/server.jar
COPY --from=client /build/vite-project/dist /app/static
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod 0755 /usr/local/bin/docker-entrypoint.sh

# Клиент отдаёт сам сервер, с того же адреса, откуда приходят запросы к API.
# Роутинг в приложении хешевый (`/#/book`), поэтому SPA-fallback не нужен:
# странице достаточно `index.html` на `/` (D79).
ENV SPRING_WEB_RESOURCES_STATIC_LOCATIONS=file:/app/static/

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
