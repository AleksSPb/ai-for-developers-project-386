# Сборка и запуск сервера.
#
# Два этапа: Maven собирает jar, рантайм его запускает. В финальный образ
# Maven не попадает — он нужен только на этапе сборки.

# --- Сборка ---
FROM maven:3.9-eclipse-temurin-25 AS build

WORKDIR /build

# Зависимости копируются раньше исходников: слой с ними переиспользуется, пока
# меняются только файлы приложения.
COPY pom.xml ./
RUN mvn -B -q dependency:go-offline

COPY src ./src
RUN mvn -B -q clean package -DskipTests

# --- Запуск ---
FROM eclipse-temurin:25-jre

WORKDIR /app

# Непривилегированный пользователь: процесс в контейнере не должен быть root,
# иначе всё, что попадёт внутрь, выполнится с правами суперпользователя.
RUN useradd --system --create-home --uid 10001 calendar
USER calendar

COPY --from=build /build/target/server-*.jar /app/server.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/server.jar"]
