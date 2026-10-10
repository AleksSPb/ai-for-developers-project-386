package com.hexlet.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.hexlet.calendar.jpa.Booking;
import com.hexlet.calendar.jpa.EventType;
import com.hexlet.calendar.jpa.Window;
import com.hexlet.calendar.repository.BookingRepository;
import com.hexlet.calendar.repository.EventTypeRepository;
import com.hexlet.calendar.repository.WindowRepository;

import jakarta.persistence.EntityManager;

// Boot 4 переехал на Jackson 3: маппер живёт в tools.jackson.databind,
// хотя аннотации сгенерированных моделей — по-прежнему com.fasterxml.jackson.annotation.
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Операции API через настоящий HTTP на настоящий Tomcat — без базы. Уровень 2
 * пирамиды (#102): Spring-контекст поднят, хранилище подменено моками
 * ({@code @MockitoBean} на репозиториях и {@code EntityManager}), автоконфигурация
 * DataSource, Hibernate, Liquibase и репозиториев выключена. Контейнера нет.
 *
 * <p>Что здесь проверяется: HTTP-граница — маршруты, {@code @Valid} и «бесплатные»
 * {@code fields[]} (D40), нормализация D43, коды и тела 404/409/422, форма ответа
 * {@code GET /windows} (D24/D25). Всё это не зависит от того, чем отвечает
 * Postgres, поэтому контейнер тут был бы платой без предмета.
 *
 * <p>Что осталось на уровне 3 и в {@code ApiOperationsIT}: гонка двух Гостей на
 * настоящем {@code EXCLUDE USING gist}, поведение явного {@code flush} на живом
 * соединении, имена настоящих ограничений, величины таймаутов. Это то, что
 * моком не воспроизводится: подделка ответила бы так, как её запрограммировали,
 * а не так, как устроена база.
 *
 * <p>Суффикс {@code Test} в имени файла — то же, что уровень 2: surefire гоняет
 * его вторым execution'ом, после дешёвого уровня 1 и до контейнера.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        // Хранилища нет — и не нужно: каждый тест подделывает ответы репозиториев.
        // Имена классов указаны полностью: в Boot 4 автоконфигурация нарезана по
        // модулям и больше не лежит в общем пакете.
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceTransactionManagerAutoConfiguration,"
                + "org.springframework.boot.jdbc.autoconfigure.JdbcTemplateAutoConfiguration,"
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceInitializationAutoConfiguration,"
                + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
                + "org.springframework.boot.data.jpa.autoconfigure.DataJpaRepositoriesAutoConfiguration,"
                + "org.springframework.boot.persistence.autoconfigure.PersistenceExceptionTranslationAutoConfiguration,"
                + "org.springframework.boot.liquibase.autoconfigure.LiquibaseAutoConfiguration",
})
class ApiOperationsTest {

    private static final ZoneId MOSCOW = ZoneId.of("Europe/Moscow");

    @MockitoBean
    @SuppressWarnings("unused")
    private BookingRepository bookings;

    @MockitoBean
    @SuppressWarnings("unused")
    private EventTypeRepository types;

    @MockitoBean
    @SuppressWarnings("unused")
    private WindowRepository windows;

    @MockitoBean
    @SuppressWarnings("unused")
    private EntityManager entityManager;

    @LocalServerPort
    private int port;

    @Autowired
    private ObjectMapper objectMapper;

    /** Слот в будущем: окна подделываются под него, сид базы здесь ни при чём. */
    private ZonedDateTime slotDay;

    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void stubStorage() {
        slotDay = LocalDate.now(MOSCOW).plusDays(3).atTime(10, 0).atZone(MOSCOW);

        when(types.findById("consult")).thenReturn(Optional.of(
                new EventType("consult", "Консультация", "тип для тестов", 60)));
        // Окно 09:00–18:00 того же дня: слот 10:00–11:00 лежит внутри него.
        when(windows.findByEndDtAfterOrderByStartDtAsc(any())).thenReturn(List.of(
                new Window(slotDay.withHour(9).toInstant(), slotDay.withHour(18).toInstant())));

        // Умолчания «ничего нет»: тест переопределяет их только там, где это и есть
        // его предмет, а не размазывает предпосылки по каждому тесту.
        when(bookings.findByEventTypeIdAndStartDtAndGuestEmail(any(), any(), any()))
                .thenReturn(Optional.empty());
        when(bookings.findOverlapping(any(), any(), any())).thenReturn(List.of());
    }

    // — операции —

    @Test
    @DisplayName("запись проходит всеми слоями и отдаёт 201 с моделью контракта")
    void bookingHappyPath() throws Exception {
        // Хвостовой пробел в почте был бы уловлен аннотацией @Email из модели ДО
        // нормализации сервисом: useEmail=false не отключает @Email — он приходит
        // из `format: email` контракта, и порядок «аннотация раньше нормализации»
        // надо учитывать.
        var result = post("/bookings", bookingBody("consult", slotDay, 60, "Иван", "Ivan@Example.com"));

        assertThat(result.status()).withFailMessage(() -> "body=" + result.body()).isEqualTo(201);

        JsonNode body = result.json(objectMapper);
        assertThat(UUID.fromString(body.get("id").asText())).isNotNull();
        // Нормализация D43 в слое правил: в ответе — trim и lowercase почты.
        assertThat(body.get("guestEmail").asText()).isEqualTo("ivan@example.com");
    }

    @Test
    @DisplayName("повтор по ключу (тип, начало, почта) — 201 со старой Бронью, имя не обновилось (D37)")
    void bookingIdempotentRepeat() throws Exception {
        Booking old = new Booking(UUID.fromString("11111111-1111-1111-1111-111111111111"),
                "consult", slotDay.toInstant(), slotDay.plusMinutes(60).toInstant(),
                "Иван", "ivan@example.com", Instant.now());
        when(bookings.findByEventTypeIdAndStartDtAndGuestEmail("consult", slotDay.toInstant(), "ivan@example.com"))
                .thenReturn(Optional.of(old));

        var second = post("/bookings", bookingBody("consult", slotDay, 60, "Пётр", "ivan@example.com"));

        assertThat(second.status()).isEqualTo(201);
        assertThat(second.json(objectMapper).get("id").asText())
                .isEqualTo("11111111-1111-1111-1111-111111111111");
        assertThat(second.json(objectMapper).get("guestName").asText()).isEqualTo("Иван");
        // Повтор не пишет: в ответе старое имя пришло из репозитория, а не из тела.
        verify(entityManager, never()).persist(any());
    }

    @Test
    @DisplayName("перекрытие со сдвинутым началом — 409 slot_taken предпроверкой (D46)")
    void overlapCaughtByCodePrecheck() throws Exception {
        when(bookings.findOverlapping("consult", slotDay.plusMinutes(15).toInstant(),
                slotDay.plusMinutes(75).toInstant()))
                .thenReturn(List.of(new Booking(UUID.randomUUID(), "consult",
                        slotDay.toInstant(), slotDay.plusMinutes(60).toInstant(),
                        "Иван", "ivan@example.com", Instant.now())));

        var taken = post("/bookings", bookingBody("consult", slotDay.plusMinutes(15), 60,
                "Пётр", "petr@example.com"));

        assertThat(taken.status()).isEqualTo(409);
        assertThat(taken.json(objectMapper).get("code").asText()).isEqualTo("slot_taken");
    }

    @Test
    @DisplayName("повтор Типа с расхождением — 409 event_type_exists (D28)")
    void eventTypeRepeatWithMismatch() throws Exception {
        var conflict = post("/event-types", """
                {"id": "consult", "name": "Другое",
                 "description": "тип для тестов", "durationMinutes": 60}
                """);

        assertThat(conflict.status()).isEqualTo(409);
        assertThat(conflict.json(objectMapper).get("code").asText()).isEqualTo("event_type_exists");
    }

    @Test
    @DisplayName("общий 404 различается кодом в теле: нет окна — не то же, что нет Типа")
    void twoKindsOfNotFound() throws Exception {
        // Нет окна: тип есть, но ни одно окно не содержит интервал.
        when(windows.findByEndDtAfterOrderByStartDtAsc(any())).thenReturn(List.of());
        var noWindow = post("/bookings", bookingBody("consult", slotDay.withHour(7), 60,
                "Иван", "ivan@example.com"));
        assertThat(noWindow.status()).isEqualTo(404);
        assertThat(noWindow.json(objectMapper).get("code").asText()).isEqualTo("slot_not_found");

        // Нет Типа: поиск типа падает раньше окна.
        when(types.findById("ghost")).thenReturn(Optional.empty());
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
        ZonedDateTime nowMoscow = ZonedDateTime.now(MOSCOW);
        // Окно, начавшееся в прошлом: его начало поднимается до ближайшего целого часа.
        Instant started = nowMoscow.minusMinutes(30).toInstant();
        // Окно целиком в будущем: начало не трогается и уже целый час.
        ZonedDateTime future = nowMoscow.plusDays(1).truncatedTo(ChronoUnit.HOURS).plusHours(3);
        when(windows.findByEndDtAfterOrderByStartDtAsc(any())).thenReturn(List.of(
                new Window(started, nowMoscow.plusHours(8).toInstant()),
                new Window(future.toInstant(), future.plusHours(1).toInstant())));

        var result = get("/windows");
        assertThat(result.status()).isEqualTo(200);

        JsonNode list = result.json(objectMapper).get("windows");
        assertThat(list).hasSize(2);

        Instant now = Instant.now();
        for (JsonNode window : list) {
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
        JsonNode json(ObjectMapper mapper) {
            return mapper.readTree(body);
        }
    }
}