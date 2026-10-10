# Сборка и запуск сервера.
#
# Два этапа: Maven собирает jar, рантайм его запускает. В финальный образ
# Maven не попадает — он нужен только на этапе сборки.
#
# Контекст сборки — корень репозитория, а не `server/`: модели API генерируются
# на лету из `vite-project/contract/openapi.yaml`, и без этого файла в образе
# `mvn package` не идёт. Что именно попадает в контекст, решает
# `server/Dockerfile.dockerignore`.

# --- Сборка ---
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
RUN mvn -B -q clean package -DskipTests

# --- Запуск ---
FROM eclipse-temurin:25-jre

WORKDIR /app

# Непривилегированный пользователь: процесс в контейнере не должен быть root,
# иначе всё, что попадёт внутрь, выполнится с правами суперпользователя.
RUN useradd --system --create-home --uid 10001 calendar
USER calendar

COPY --from=build /build/server/target/server-*.jar /app/server.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/server.jar"]