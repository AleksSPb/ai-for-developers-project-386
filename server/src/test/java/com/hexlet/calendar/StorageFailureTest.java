package com.hexlet.calendar;

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

import org.junit.jupiter.api.Disabled;
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
 * ОТКЛЮЧЁН — задача на разбор тестовой пирамиды сервера.
 *
 * <p>Что здесь было: отказ хранилища — {@code 503}, а не нарушение целостности.
 * Контейнер глушится посреди живого приложения, и проверяется, что «база лежит»
 * не спуталось с «слот занят». Это единственный тест, который наблюдал, какой
 * именно класс исключения приходит от умирающего постмастера: в логе
 * {@code SQLSTATE 57P01} → {@code GenericJDBCException} →
 * {@code DataAccessResourceFailureException}, и попадание последнего в белый
 * список D38 было наблюдением, а не предположением.
 *
 * <p><b>Почему отключён.</b>
 *
 * <ul>
 *   <li><b>Долго и нестабильно.</b> Класс поднимает контейнер и контекст, а сами
 *       два теста занимают меньше двух секунд: остальное — обвязка. По
 *       замерам один прогон давал 5 с, другой — 78 с, разница вся в том, успел
 *       ли Docker прогреть образ. Платишь за чужой обвязкой.</li>
 *   <li><b>Польза неочевидна на фоне остального.</b> Тот же белый список теперь
 *       проверяется поведенчески для всех семи механизмов в
 *       {@code ApiOperationsTest} — без контейнера, за миллисекунды. Здесь
 *       оставалось только соответствие «умершая база → именно этот класс», а
 *       стоимость на него непропорциональна.</li>
 *   <li><b>Тест зависит от порядка.</b> Глушится база, и после этого контекст
 *       не переиспользуется: класс обязан быть последним и не идти параллельно с
 *       другими. Изоляция дороже проверки.</li>
 * </ul>
 *
 * <p>Что проверка даёт после отключения — теряется одно: наблюдение, что
 * умирающая база действительно приходит классом из белого списка. Всё
 * остальное (что advice отдаёт {@code 503} по каждому из семи механизмов и что
 * нарушения целостности в список не попадают) покрыто в
 * {@code ApiOperationsTest} и работает без контейнера.
 *
 * <p>Код оставлен целиком и не удалён: разбор пирамиды должен решить, что с ним
 * будет, а не выбросить наблюдение вместе с обвязкой.
 *
 * @see <a href="https://github.com/AleksSPb/ai-for-developers-project-386/issues/102">Тестовая пирамида сервера</a>
 */
@Disabled("Класс отключён: долгое выполнение и неочевидная польза. "
        + "Разбор — #102")
@SpringBootTest(
        webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        // Мёртвый контейнер: Hikari обязан признать это за секунду, иначе
        // поведение про 503 зависит от дефолтного таймаута пула (30 секунд).
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
                 "description": "тип для тестов", "durationMinutes": 60}
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
