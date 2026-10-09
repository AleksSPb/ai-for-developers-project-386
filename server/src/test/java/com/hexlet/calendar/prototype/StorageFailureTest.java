package com.hexlet.calendar.prototype;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

// Boot 4 переехал на Jackson 3: маппер живёт в tools.jackson.databind.
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * ПРОТОТИП (#83). Наблюдение №3 (вторая половина): 503 против нарушений целостности.
 *
 * <p>Контейнер глушится посреди живого приложения — это ровно тот случай,
 * который #82 отдал белому списку D38: нет соединения → {@code 503
 * service_unavailable}, а {@code 409}/{@code 404} из слоя правил в этот список
 * не попадают. Без наблюдения нельзя отличить «база лежит» от «слот занят»,
 * если оба идут одним {@code DataAccessException}-супертипом — тогда гонку
 * за слот раздуло бы в 503, дефект, исправленный в #82.
 *
 * <p>Приложение стартует с сидом (как боевой {@code compose.yaml}): шаг 4
 * читает окна, и живой календарь нужен, чтобы сначала показать успех, потом —
 * отказ хранилища на том же пути. База глушится последним тестом, контекст
 * после этого не переиспользуется.
 */
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        // Мёртвый контейнер: Hikari обязан признать это за секунду, иначе
        // наблюдение про 503 зависит от дефолтного таймаута пула (30 секунд).
        properties = {
                "spring.datasource.hikari.connection-timeout=1500",
                "spring.datasource.hikari.validation-timeout=1000",
        })
@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class StorageFailureTest {

    private static final ZoneId MOSCOW = ZoneId.of("Europe/Moscow");

    @Container
    @ServiceConnection
    @SuppressWarnings("resource")
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:18-alpine")
            .withDatabaseName("calendar")
            .withUsername("calendar")
            .withPassword("calendar");

    @LocalServerPort
    private int port;

    @Autowired
    private ObjectMapper objectMapper;

    private final HttpClient http = HttpClient.newHttpClient();

    @Test
    @Order(1)
    @DisplayName("до глушения запись работает: 201 из тех же слоёв")
    void bookingWorksWhileDbAlive() throws Exception {
        assertThat(post("/event-types", """
                {"id": "consult", "name": "Консультация",
                 "description": "прототип", "durationMinutes": 60}
                """).status()).isEqualTo(201);

        Instant lastWindowStart = jdbcMaxStart();
        ZonedDateTime slotDay = lastWindowStart.atZone(MOSCOW)
                .toLocalDate().atTime(11, 0).atZone(MOSCOW);

        var result = post("/bookings", objectMapper.writeValueAsString(Map.of(
                "eventTypeId", "consult",
                "timeRange", Map.of(
                        "start", slotDay.toOffsetDateTime().toString(),
                        "end", slotDay.plusHours(1).toOffsetDateTime().toString()),
                "guestName", "Иван",
                "guestEmail", "ivan@example.com")));

        assertThat(result.status()).isEqualTo(201);
    }

    @Test
    @Order(2)
    @DisplayName("база легла: отказ хранилища — 503 service_unavailable (D38)")
    void deadDbIs503ByWhitelist() throws Exception {
        POSTGRES.stop();

        Instant someDay = Instant.now().plus(Duration.ofDays(1));
        ZonedDateTime slotDay = someDay.atZone(MOSCOW).toLocalDate().atTime(11, 0).atZone(MOSCOW);

        var result = post("/bookings", objectMapper.writeValueAsString(Map.of(
                "eventTypeId", "consult",
                "timeRange", Map.of(
                        "start", slotDay.toOffsetDateTime().toString(),
                        "end", slotDay.plusHours(1).toOffsetDateTime().toString()),
                "guestName", "Иван",
                "guestEmail", "ivan@example.com")));

        // Неважно, каким из списка механизмов умерла база (соединение, транзакция,
        // таймаут) —Advice сводит всё перечисленное к одному телу.
        assertThat(result.status()).isEqualTo(503);

        JsonNode body = objectMapper.readTree(result.body());
        assertThat(body.get("code").asText()).isEqualTo("service_unavailable");
    }

    /** Момента читается до глушения тем же HTTP: GET /windows как источник дат сида. */
    private Instant jdbcMaxStart() throws Exception {
        var response = get("/windows");
        assertThat(response.status()).isEqualTo(200);
        JsonNode windows = objectMapper.readTree(response.body()).get("windows");
        return OffsetDateTime.parse(
                windows.get(windows.size() - 1).get("start").asText()).toInstant();
    }

    private HttpResult post(String path, String body) throws Exception {
        return send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json")
                .timeout(Duration.ofSeconds(20))
                .POST(HttpRequest.BodyPublishers.ofString(body)));
    }

    private HttpResult get(String path) throws Exception {
        return send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .timeout(Duration.ofSeconds(20)));
    }

    private HttpResult send(HttpRequest.Builder builder) throws Exception {
        var response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        return new HttpResult(response.statusCode(), response.body());
    }

    private record HttpResult(int status, String body) {
    }
}
