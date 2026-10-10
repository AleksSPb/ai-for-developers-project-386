package com.hexlet.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.lang.reflect.Constructor;
import java.lang.reflect.Modifier;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.CleanupFailureDataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.InvalidDataAccessResourceUsageException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.dao.TransientDataAccessResourceException;
import org.springframework.dao.UncategorizedDataAccessException;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import com.hexlet.calendar.api.model.ServiceUnavailableError;
import com.hexlet.calendar.jpa.Booking;
import com.hexlet.calendar.jpa.EventType;
import com.hexlet.calendar.refusal.Refusal;
import com.hexlet.calendar.service.Integrity;
import com.hexlet.calendar.web.ApiAdvice;

import jakarta.persistence.EntityManager;

// Boot 4 переехал на Jackson 3: маппер живёт в tools.jackson.databind,
// хотя аннотации сгенерированных моделей — по-прежнему com.fasterxml.jackson.annotation.
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Три операции на живой связке Liquibase → Hibernate → база, и то, что по описанию
 * слоёв не видно: где именно ловится ограничение базы и чем отличается отказ
 * хранилища от отказа гостю.
 *
 * <p>Запросы идут настоящим HTTP на настоящий Tomcat: в Boot 4 web-слайсы
 * тестов ({@code @AutoConfigureMockMvc}, {@code TestRestTemplate}) вырезаны из
 * графа {@code spring-boot-starter-test}, а MockMvc к тому же не прогоняет
 * непойманное через {@code /error}, а нам нужен именно HTTP-ответ.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Testcontainers
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ApiOperationsTest {

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
    private EntityManager entityManager;

    @Autowired
    private PlatformTransactionManager transactions;

    @Autowired
    private ApiAdvice advice;

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
                 "description": "тип для тестов", "durationMinutes": 60}
                """);
        assertThat(created.status()).isEqualTo(201);
    }

    // — операции —

    @Test
    @DisplayName("запись проходит всеми слоями и отдаёт 201 с моделью контракта")
    void bookingHappyPath() throws Exception {
        // Хвостовой пробел здесь был бы уловлен аннотацией @Email из модели ДО
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
    @DisplayName("перекрытие со сдвинутым началом — 409 slot_taken предпроверкой (D46)")
    void overlapCaughtByCodePrecheck() throws Exception {
        post("/bookings", bookingBody("consult", slotDay, 60, "Иван", "ivan@example.com"));

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

    // — граница слоёв —

    @Test
    @DisplayName("гонка двух Гостей за один слот: ровно один 201 и ровно один 409, не 503 (D45)")
    void raceOfTwoGuestsGivesOneCreatedAndOneConflict() throws Exception {
        // Настоящая гонка вместо ручки: оба запроса стартуют одновременно, и кто
        // проиграет — предпроверка или ограничение базы — не важно. Важно, что
        // проигравший получает 409, а не 503: `lock_timeout` меньше
        // `statement_timeout` именно для этого (см. application.yml).
        CyclicBarrier startLine = new CyclicBarrier(2);

        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> postAfterBarrier(startLine, "/bookings",
                    bookingBody("consult", slotDay, 60, "Иван", "ivan@example.com")));
            var second = pool.submit(() -> postAfterBarrier(startLine, "/bookings",
                    bookingBody("consult", slotDay, 60, "Пётр", "petr@example.com")));

            List<Integer> statuses = List.of(first.get().status(), second.get().status()).stream()
                    .sorted()
                    .toList();

            assertThat(statuses).containsExactly(201, 409);
        }

        assertThat(jdbc.queryForObject("SELECT count(*) FROM bookings", Long.class)).isEqualTo(1L);
    }

    @Test
    @DisplayName("явный flush обязателен: без него нарушение приходит на коммите, мимо правил")
    void withoutFlushTheConstraintEscapesTheRulesLayer() {
        // Наблюдение, а не ручка: способ вызова выбирает тест, а не контракт.
        // Тот же конфликт, что и в гонке, но вставка идёт мимо слоя правил — так
        // видно, где именно заканчивается его try и начинается commit.
        insertBookingDirectly(slotDay, "petr@example.com");

        // С flush нарушение прилетает внутри транзакции — там, где слой правил
        // читает имя ограничения и превращает его в 409.
        Throwable withFlush = catchThrowable(() -> inTransaction(() -> {
            entityManager.persist(booking(slotDay, "ivan@example.com"));
            entityManager.flush();
        }));

        assertThat(Integrity.refusalOf(withFlush))
                .isNotNull()
                .extracting(Refusal::kind)
                .isEqualTo(Refusal.Kind.SLOT_TAKEN);

        // Без flush INSERT уходит на commit, исключение вспыхивает уже ПОСЛЕ
        // выхода из правил: имя ограничения уже никому не нужно, advice его не
        // ловит (и не должен — целостность не входит в белый список D38), и
        // непойманное доходит до /error как 500 internal_error.
        Throwable withoutFlush = catchThrowable(() -> inTransaction(() ->
                entityManager.persist(booking(slotDay, "ivan@example.com"))));

        assertThat(withoutFlush).isNotNull();
        assertThat(withoutFlush).isNotInstanceOf(Refusal.class);
        assertThat(unavailableMechanisms()).noneMatch(type -> type.isInstance(withoutFlush));
    }

    @Test
    @DisplayName("FK, пересечение и PK — один класс исключения; различимы только именем (D17, D38)")
    void integrityViolationsDifferByConstraintNameOnly() {
        Instant start = slotDay.toInstant();
        insertBookingDirectly(slotDay, "petr@example.com");

        // Пересечение: bookings_no_overlap → 409 slot_taken.
        assertThat(refusalOf(() -> entityManager.persist(
                booking(slotDay, "ivan@example.com")))).isEqualTo(Refusal.Kind.SLOT_TAKEN);

        // Внешний ключ: тип исчез между проверкой и вставкой — база дописывает то,
        // чего не увидел код. Класс тот же, что у пересечения.
        assertThat(refusalOf(() -> entityManager.persist(new Booking(
                UUID.randomUUID(), "ghost", start, start.plus(Duration.ofHours(1)),
                "Иван", "ivan@example.com", Instant.now()))))
                .isEqualTo(Refusal.Kind.EVENT_TYPE_NOT_FOUND);

        // PK двух Владельцев с одним слагом: тот же Integrity, что и у пересечения.
        assertThat(refusalOf(() -> entityManager.persist(
                new EventType("consult", "Другое", "тип для тестов", 60))))
                .isEqualTo(Refusal.Kind.EVENT_TYPE_EXISTS);

        // Ни одно из них не в белом списке 503: целостность — не недоступность.
        assertThat(unavailableMechanisms()).noneMatch(type -> type
                .isAssignableFrom(org.springframework.dao.DataIntegrityViolationException.class));
    }

    // — величины таймаутов —

    @Test
    @DisplayName("statement_timeout и lock_timeout заданы соединению, и lock_timeout меньше")
    void timeoutsAreSetOnEveryConnection() {
        // SET, а не SET LOCAL: SET LOCAL сбросился бы на конце транзакции, и
        // величины действовали бы только внутри неё — величина из `SHOW` была бы
        // дефолтом базы (statement_timeout = 0, то есть бесконечность).
        assertThat(jdbc.queryForObject("SHOW statement_timeout", String.class)).isEqualTo("10s");
        assertThat(jdbc.queryForObject("SHOW lock_timeout", String.class)).isEqualTo("2s");
    }

    @Test
    @DisplayName("запрос, ушедший за statement_timeout, даёт 503, а не 500")
    void queryOverStatementTimeoutIsTheWhitelistedMechanism() {
        // pg_sleep спит дольше statement_timeout: драйвер отдаёт SQLSTATE 57014,
        // Hibernate транслирует его в QueryTimeoutException, Spring — в свой.
        // Второй механизм белого списка, который без statement_timeout был
        // недостижим: оставалось только отсутствие соединения.
        Throwable thrown = catchThrowable(() ->
                jdbc.queryForObject("SELECT pg_sleep(11)", Object.class));

        assertThat(thrown).isInstanceOf(QueryTimeoutException.class);
    }

    @Test
    @DisplayName("список проверяемых механизмов совпадает с перечнем в advice")
    void testedWhitelistIsTheWholeWhitelist() {
        // Без этого параметризованный тест проверял бы только тех, кого перечислил
        // тест: механизм, добавленный в advice, остался бы непроверенным, и тест
        // промолчал бы. Здесь он падает на расхождении.
        assertThat(unavailableMechanisms())
                .containsExactlyInAnyOrderElementsOf(whitelist().toList());
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("whitelist")
    @DisplayName("каждый механизм белого списка D38 даёт 503 service_unavailable")
    void everyWhitelistMechanismIs503(Class<? extends Exception> mechanism) {
        // Здесь мок уместен: механизм ЗАДАН белым списком, и вопрос в том, сводит ли
        // advice каждый из них к одному телу. Соответствие «умершая база приходит
        // именно этим классом» — не вопрос предположения, а наблюдение, и оно
        // остаётся за контейнером в StorageFailureTest.
        var response = advice.unavailable(exceptionOf(mechanism));

        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(((ServiceUnavailableError) response.getBody()).getCode())
                .isEqualTo(ServiceUnavailableError.CodeEnum.SERVICE_UNAVAILABLE);
        assertThat(((ServiceUnavailableError) response.getBody()).getMessage()).isNotBlank();
    }

    /**
     * Перечень D38 в тесте, а не только в advice.
     *
     * <p>Список задан здесь намеренно отдельно от аннотации {@code @ExceptionHandler}:
     * если белый список расширится в advice, тест упадёт на «механизм без проверки»,
     * а не промолчит. Обе стороны списка — источник правды, и разойтись они не
     * должны молча.
     */
    private static Stream<Class<? extends Exception>> whitelist() {
        return Stream.of(
                DataAccessResourceFailureException.class,
                CannotGetJdbcConnectionException.class,
                TransientDataAccessResourceException.class,
                CannotCreateTransactionException.class,
                QueryTimeoutException.class,
                // Абстрактный: в белом списке стоит сам класс, а создать его нельзя.
                // Advice ловит по типу, поэтому для проверки подходит любой подкласс,
                // и ниже это отдельно оговорено.
                UncategorizedDataAccessException.class,
                CleanupFailureDataAccessException.class);
    }

    // — helpers —

    /** Имена ограничений разбирает слой правил; нарушение ловится на явном flush. */
    private Refusal.Kind refusalOf(Runnable insert) {
        Throwable thrown = catchThrowable(() -> inTransaction(() -> {
            insert.run();
            entityManager.flush();
        }));

        assertThat(thrown).isNotNull();
        return Integrity.refusalOf(thrown) == null
                ? null
                : Integrity.refusalOf(thrown).kind();
    }

    /**
     * Исключение данного класса для проверки белого списка.
     *
     * <p>Пустого конструктора нет ни у одного из семи механизмов — проверено
     * рефлексией, а не предположено. Берётся конструктор с наименьшим числом
     * аргументов, недостающие заполняются заглушками: `String` — осмысленным
     * текстом, остальное — `null`. Тесту важно, что advice отдаёт 503 для КЛАССА,
     * а не то, что он умеет создавать этот класс.
     */
    private static Exception exceptionOf(Class<? extends Exception> declared) {
        // `UncategorizedDataAccessException` абстрактен: создать его нельзя, а
        // advice ловит по типу, поэтому проверяется конкретный подкласс. Отдельно
        // оговорено, чтобы «проверен весь список» не читалось как «проверен каждый
        // класс буквально» — экземпляр всё равно подставляет подкласс.
        Class<?> instantiable = Modifier.isAbstract(declared.getModifiers())
                ? InvalidDataAccessResourceUsageException.class
                : declared;

        var constructor = Arrays.stream(instantiable.getDeclaredConstructors())
                .min(Comparator.comparingInt(Constructor::getParameterCount))
                .orElseThrow(() -> new AssertionError(
                        "Нет ни одного конструктора у " + instantiable.getSimpleName()));

        Object[] arguments = Arrays.stream(constructor.getParameterTypes())
                .map(type -> type == String.class ? "проверка белого списка D38" : null)
                .toArray();

        try {
            constructor.setAccessible(true);
            return (Exception) constructor.newInstance(arguments);
        } catch (ReflectiveOperationException notCreatable) {
            throw new AssertionError("Не удалось создать " + instantiable.getSimpleName(), notCreatable);
        }
    }

    /**
     * Ровно те классы, которые advice отдаёт в 503 — перечень D38.
     *
     * <p>Берётся ТОЛЬКО обработчик `unavailable`: у advice их несколько, и
     * `Refusal` с `MethodArgumentNotValidException` относятся к 422 и 409, а не к
     * отказу хранилища. Смешивать их здесь нельзя — сравнение со списком иначе
     * всегда расходилось бы.
     */
    private Set<Class<?>> unavailableMechanisms() {
        return Stream.of(ApiAdvice.class.getDeclaredMethods())
                .filter(method -> method.getName().equals("unavailable"))
                .flatMap(method -> Arrays.stream(
                        method.getAnnotation(ExceptionHandler.class).value()))
                .collect(Collectors.toSet());
    }

    private void inTransaction(Runnable action) {
        new TransactionTemplate(transactions).executeWithoutResult(status -> action.run());
    }

    private Booking booking(ZonedDateTime start, String email) {
        return new Booking(UUID.randomUUID(), "consult", start.toInstant(),
                start.plusMinutes(60).toInstant(), "Иван", email, Instant.now());
    }

    private void insertBookingDirectly(ZonedDateTime start, String email) {
        jdbc.update("""
                INSERT INTO bookings VALUES (gen_random_uuid(), 'consult', ?, ?, 'Прямая вставка', ?, now())
                """,
                Timestamp.from(start.toInstant()),
                Timestamp.from(start.plusMinutes(60).toInstant()),
                email);
    }

    private HttpResult postAfterBarrier(CyclicBarrier barrier, String path, String body) throws Exception {
        barrier.await();
        return post(path, body);
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