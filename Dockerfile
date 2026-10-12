# Dockerfile в корне репозитория — для внешнего харнесса (Hexlet project check),
# который ищет `Dockerfile` именно здесь: репозиторий копируется в `code/`, и
# сборка идёт командой `docker build -f code/Dockerfile code`.
#
# Он собирает тот же сервер, что и `server/Dockerfile`, — но лежит в корне,
# потому что контекст сборки и точка входа заданы снаружи. Долговечное решение —
# перенести `server/Dockerfile` сюда и ссылаться на него из `server/compose.yaml`,
# чтобы не держать два одинаковых файла; пока это проба.

# --- Сборка ---
FROM maven:3.9-eclipse-temurin-25 AS build

WORKDIR /build/server

# Зависимости копируются раньше исходников: слой с ними переиспользуется, пока
# меняются только файлы приложения.
COPY server/pom.xml ./
RUN mvn -B -q dependency:go-offline

# Модели API генерируются при сборке из `vite-project/contract/openapi.yaml`,
# поэтому в образ нужен весь корень, а не только `server/`.
COPY server/src ./src
COPY vite-project/contract ../vite-project/contract

# Линтер живёт в `validate`, а `validate` раньше `package`: без конфигов
# `checkstyle:check` падает с «Could not find resource 'checkstyle.xml'».
COPY server/checkstyle.xml server/checkstyle-suppressions.xml ./

RUN mvn -B -q clean package -DskipTests

# --- Запуск ---
FROM eclipse-temurin:25-jre

WORKDIR /app

# Непривилегированный пользователь: процесс в контейнере не должен быть root.
RUN useradd --system --create-home --uid 10001 calendar
USER calendar

COPY --from=build /build/server/target/server-*.jar /app/server.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/server.jar"]