package com.hexlet.calendar.prototype;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

// Boot 4 переехал на Jackson 3: маппер живёт в tools.jackson.databind,
// хотя аннотации сгенерированных моделей — по-прежнему com.fasterxml.jackson.annotation.
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import com.hexlet.calendar.prototype.jpa.Booking;
import com.hexlet.calendar.prototype.refusal.Refusal;
import com.hexlet.calendar.prototype.repository.BookingRepository;
import com.hexlet.calendar.prototype.service.Integrity;

/**
 * ПРОТОТИП (#83). Наблюдения №1 и №3 на живой связке Liquibase → Hibernate → база.
 *
 * <p>Запросы идут настоящим HTTP на настоящий Tomcat: в Boot 4 web-слайсы
 * тестов ({@code @AutoConfigureMockMvc}, {@code TestRestTemplate}) вырезаны из
 * графа {@code spring-boot-starter-test} — это само по себе факт раскладки,
 * а MockMvc к тому же не прогоняет непойманное через {@code /error}, а нам
 * нужен именно HTTP-ответ.
 *
 * <p>Что здесь проверяется и не видно по описанию слоёв:
 * <ul>
 *   <li>ограничение {@code bookings_no_overlap} ловится слоем правил по имени —
 *       но только при явном {@code flush}: тот же insert без flush вспыхивает
 *       на commit, за пределами правил, и гость получает 500 вместо 409
 *       ({@code raceWithoutFlush} — требование, переехавшее из #82 в #83);</li>
 *   <li>FK и exclusion — ОДИН класс исключения в Java, различаются только именем
 *       ограничения, и ни один не попадает в белый список 503 (D38);</li>
 *   <li>отказы различаются кодом в теле, даже когда статус общий: 404
 *       {@code slot_not_found} против 404 {@code event_type_not_found}.</li>
 * </ul>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LayerObservationsTest {

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

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private BookingRepository bookingRepository;

    /** Последний день сида: окна 09:00–18:00 Мск, слот берём 10:00–11:00. */
    private ZonedDateTime slotDay;

    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void cleanAndSetup() throws Exception {
        jdbc.update("DELETE FROM bookings");
        jdbc.update("DELETE FROM event_types");

        Instant lastWindowStart = jdbc.queryForObject("SELECT max(start_dt) FROM windows",
                Timestamp.class).toInstant();
        slotDay = lastWindowStart.atZone(MOSCOW).toLocalDate().atTime(10, 0).atZone(MOSCOW);

        // Тип событий заводится тем же HTTP-путём, которым пользуется Владелец.
        var created = post("/event-types", """
                {"id": "consult", "name": "Консультация",
                 "description": "прототип", "durationMinutes": 60}
                """);
        assertThat(created.status()).isEqualTo(201);
    }

    @Test
    @DisplayName("запись проходит всеми слоями и отдаёт 201 с моделью контракта")
    void happyPath() throws Exception {
        // Хвостовой пробел здесь был бы уловлен аннотацией @Email из модели ДО
        // нормализации сервисом (наблюдение #83: useEmail=false не отключает
        // @Email — он приходит из `format: email` контракта, как и говорилось в #85).
        var result = post("/bookings", bookingBody("consult", slotDay, 60, "Иван", "Ivan@Example.com"));

        assertThat(result.status()).withFailMessage(() -> "body=" + result.body()).isEqualTo(201);

        JsonNode body = result.json(objectMapper);
        assertThat(UUID.fromString(body.get("id").asText())).isNotNull();
        // Нормализация D43 в слое правил: в ответе — trim и lowercase почты.
        assertThat(body.get("guestEmail").asText()).isEqualTo("ivan@example.com");
    }

    @Test
    @DisplayName("повтор по ключу (тип, начало, почта) — 201 со старой Бронью, имя не обновилось (D37)")
    void idempotentRepeat() throws Exception {
        var first = post("/bookings", bookingBody("consult", slotDay, 60, "Иван", "ivan@example.com"));
        assertThat(first.status()).isEqualTo(201);

        var second = post("/bookings", bookingBody("consult", slotDay, 60, "Пётр", "ivan@example.com"));

        assertThat(second.status()).isEqualTo(201);
        assertThat(second.json(objectMapper).get("id").asText())
                .isEqualTo(first.json(objectMapper).get("id").asText());
        assertThat(second.json(objectMapper).get("guestName").asText()).isEqualTo("Иван");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM bookings", Long.class)).isEqualTo(1L);
    }

    @Test
    @DisplayName("занятый слот со сдвигом начала — 409 slot_taken предпроверкой (D46)")
    void overlapCaughtByCodePrecheck() throws Exception {
        post("/bookings", bookingBody("consult", slotDay, 60, "Иван", "ivan@example.com"));

        var taken = post("/bookings", bookingBody("consult", slotDay.plusMinutes(15), 60,
                "Пётр", "petr@example.com"));

        assertThat(taken.status()).isEqualTo(409);
        assertThat(taken.json(objectMapper).get("code").asText()).isEqualTo("slot_taken");
    }

    @Test
    @DisplayName("гонка без предпроверки: flush — и имя ограничения читает слой правил (409)")
    void raceWithFlush() throws Exception {
        insertBookingDirectly(slotDay, "petr@example.com");

        var raced = post("/bookings?race=true", bookingBody("consult", slotDay, 60,
                "Иван", "ivan@example.com"));

        assertThat(raced.status()).isEqualTo(409);
        assertThat(raced.json(objectMapper).get("code").asText()).isEqualTo("slot_taken");
    }

    @Test
    @DisplayName("тот же insert БЕЗ flush: нарушение вспыхивает после правил — 500, не 409")
    void raceWithoutFlush() throws Exception {
        insertBookingDirectly(slotDay, "petr@example.com");

        // Ключевое наблюдение #83: без явного flush INSERT уходит на commit,
        // исключение вспыхивает за пределами try слоя правил — имя ограничения
        // уже некому читать, advice его не ловит (оно и не должно), и непойманное
        // доходит до /error с подменённым телом. Гость с занятым слотом получил
        // бы 500. Отсюда требование явного flush, переехавшее из #82.
        var noFlush = post("/bookings?race=true&flush=false", bookingBody("consult", slotDay, 60,
                "Иван", "ivan@example.com"));

        assertThat(noFlush.status()).isEqualTo(500);
        assertThat(noFlush.json(objectMapper).get("code").asText()).isEqualTo("internal_error");
    }

    @Test
    @DisplayName("FK и exclusion — один класс исключения; разбираются только именем (D17, D38)")
    void integrityViolationsAreOneClassTwoNames() {
        // Гонка: тип исчез между проверкой и вставкой — база дописывает то,
        // чего не увидел код. Класс тот же, что у пересечения.
        Instant start = slotDay.toInstant();

        assertThatThrownBy(() -> bookingRepository.saveAndFlush(new Booking(
                UUID.randomUUID(), "ghost", start, start.plus(Duration.ofHours(1)),
                "Иван", "ivan@example.com", Instant.now())))
                .isInstanceOf(DataIntegrityViolationException.class)
                // В белый список 503 не входит: целостность — не недоступность.
                .isNotInstanceOf(org.springframework.dao.DataAccessResourceFailureException.class)
                .satisfies(thrown -> {
                    Refusal refusal = Integrity.refusalOf(thrown);
                    assertThat(refusal).isNotNull();
                    assertThat(refusal.kind()).isEqualTo(Refusal.Kind.EVENT_TYPE_NOT_FOUND);
                });
    }

    @Test
    @DisplayName("PK-гонка двух Владельцев: event_types_pkey читает слой правил — 409 (D28)")
    void eventTypePrimaryKeyRaceThroughSameDiscriminator() throws Exception {
        // Тот же слаг, другие поля, предпроверка пропущена: база отбивает
        // вставку по event_types_pkey, а имя ограничения разбирает тот же
        // Integrity, что и пересечение Броней.
        var raced = post("/event-types?race=true", """
                {"id": "consult", "name": "Другое",
                 "description": "описание", "durationMinutes": 60}
                """);

        assertThat(raced.status()).isEqualTo(409);
        assertThat(raced.json(objectMapper).get("code").asText()).isEqualTo("event_type_exists");
    }

    @Test
    @DisplayName("общий 404 различается кодом в теле: нет окна — не то же, что нет Типа")
    void twoKindsOfNotFound() throws Exception {
        var noWindow = post("/bookings", bookingBody("consult", slotDay.withHour(7), 60,
                "Иван", "ivan@example.com"));
        assertThat(noWindow.status()).isEqualTo(404);
        assertThat(noWindow.json(objectMapper).get("code").asText()).isEqualTo("slot_not_found");

        var noType = post("/bookings", bookingBody("ghost", slotDay, 60, "Иван", "ivan@example.com"));
        assertThat(noType.status()).isEqualTo(404);
        assertThat(noType.json(objectMapper).get("code").asText()).isEqualTo("event_type_not_found");
    }

    @Test
    @DisplayName("форма из аннотаций модели: fields[] приходит бесплатно, все поля сразу (D40)")
    void annotationValidationFillsFields() throws Exception {
        var result = post("/bookings", "{}");

        assertThat(result.status()).isEqualTo(422);
        JsonNode body = result.json(objectMapper);
        assertThat(body.get("code").asText()).isEqualTo("validation_failed");
        assertThat(body.get("fields").toString())
                .contains("guestName").contains("guestEmail").contains("eventTypeId");
    }

    @Test
    @DisplayName("GET /windows: прошлого нет, starts — целые часы Мск (D24/D25)")
    void windowsAreRoundedAndLive() throws Exception {
        var result = get("/windows");
        assertThat(result.status()).isEqualTo(200);

        JsonNode windows = result.json(objectMapper).get("windows");
        assertThat(windows).isNotEmpty();
        Instant now = Instant.now();

        for (JsonNode window : windows) {
            Instant start = OffsetDateTime.parse(window.get("start").asText()).toInstant();
            Instant end = OffsetDateTime.parse(window.get("end").asText()).toInstant();

            assertThat(start).isAfterOrEqualTo(now.minusSeconds(5));

            ZonedDateTime moscow = start.atZone(MOSCOW);
            assertThat(moscow.getMinute()).isZero();
            assertThat(moscow.getSecond()).isZero();
            assertThat(end).isAfter(start);
        }
    }

    // — helpers —

    private void insertBookingDirectly(ZonedDateTime start, String email) {
        jdbc.update("""
                INSERT INTO bookings VALUES (gen_random_uuid(), 'consult', ?, ?, 'Прямая вставка', ?, now())
                """,
                Timestamp.from(start.toInstant()),
                Timestamp.from(start.plusMinutes(60).toInstant()),
                email);
    }

    private String bookingBody(String typeId, ZonedDateTime start, long minutes,
                               String name, String email) throws Exception {

        return objectMapper.writeValueAsString(Map.of(
                "eventTypeId", typeId,
                "timeRange", Map.of(
                        "start", start.toOffsetDateTime().toString(),
                        "end", start.plusMinutes(minutes).toOffsetDateTime().toString()),
                "guestName", name,
                "guestEmail", email));
    }

    private HttpResult post(String path, String body) throws Exception {
        return send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body)));
    }

    private HttpResult get(String path) throws Exception {
        return send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).GET());
    }

    private HttpResult send(HttpRequest.Builder builder) throws Exception {
        var response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        return new HttpResult(response.statusCode(), response.body());
    }

    private record HttpResult(int status, String body) {
        JsonNode json(ObjectMapper mapper) throws Exception {
            return mapper.readTree(body);
        }
    }
}
