package com.hexlet.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowable;

import com.hexlet.calendar.jpa.Booking;
import com.hexlet.calendar.jpa.EventType;
import com.hexlet.calendar.refusal.Refusal;
import com.hexlet.calendar.service.Integrity;
import jakarta.persistence.EntityManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * То, что требует настоящего Postgres, и поэтому осталось на уровне 3: ограничение
 * {@code EXCLUDE USING gist} под гонкой двух Гостей, поведение явного {@code flush}
 * на живом соединении, имена настоящих ограничений и величины таймаутов.
 * Уровень 3 пирамиды (#102).
 *
 * <p>Всё, что можно проверить дешевле, отсюда уехало на уровень 2 в
 * {@code ApiOperationsTest}: рендер отказов, коды и тела ответов, маршруты. Там
 * хранилище подменено моками, и контейнер не поднимается.
 *
 * <p>Контейнер — общий на прогон ({@link SharedPostgres}), поэтому каждый тест
 * чистит за собой перед собой: соседний класс мог оставить строки.
 *
 * <p>Суффикс {@code IT} в имени файла — то же, что уровень 3: failsafe гоняет его
 * фазой {@code integration-test}, после того как surefire прошёл уровни 1 и 2.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ApiOperationsIT {

  private static final ZoneId MOSCOW = ZoneId.of("Europe/Moscow");

  /**
   * Общий контейнер прогона. {@code @ServiceConnection} на статическом поле
   * подставляет адрес и учётные данные сам; {@code @Container} здесь НЕ ставится
   * — JUnit не должен гасить контейнер после класса (см. {@link SharedPostgres}).
   */
  @ServiceConnection
  @SuppressWarnings("resource")
  private static final PostgreSQLContainer<?> POSTGRES = SharedPostgres.container();

  @LocalServerPort private int port;

  @Autowired private JdbcTemplate jdbc;

  @Autowired private EntityManager entityManager;

  @Autowired private PlatformTransactionManager transactions;

  /** Тем же Jackson, что и в HTTP: тело проверяется таким, каким уедет гостю. */
  @Autowired private ObjectMapper objectMapper;

  /** Последний день сида: окна 09:00–18:00 Мск, слот берём 10:00–11:00. */
  private ZonedDateTime slotDay;

  private final HttpClient http = HttpClient.newHttpClient();

  @BeforeEach
  void cleanAndSetup() throws Exception {
    jdbc.update("DELETE FROM bookings");
    jdbc.update("DELETE FROM event_types");

    Instant lastWindowStart =
        jdbc.queryForObject("SELECT max(start_dt) FROM windows", Timestamp.class).toInstant();
    slotDay = lastWindowStart.atZone(MOSCOW).toLocalDate().atTime(10, 0).atZone(MOSCOW);

    // Тип событий заводится тем же HTTP-путём, которым пользуется Владелец.
    var created =
        post(
            "/event-types",
            """
            {"id": "consult", "name": "Консультация",
             "description": "тип для тестов", "durationMinutes": 60}
            """);
    assertThat(created.status()).isEqualTo(201);
  }

  // — граница слоёв: без настоящей базы этих наблюдений не получить —

  @Test
  @DisplayName("гонка двух Гостей за один слот: ровно один 201 и ровно один 409, не 503 (D45)")
  void raceOfTwoGuestsGivesOneCreatedAndOneConflict() throws Exception {
    // Настоящая гонка вместо ручки: оба запроса стартуют одновременно, и кто
    // проиграет — предпроверка или ограничение базы — не важно. Важно, что
    // проигравший получает 409, а не 503: `lock_timeout` меньше
    // `statement_timeout` именно для этого (см. application.yml).
    CyclicBarrier startLine = new CyclicBarrier(2);

    try (var pool = Executors.newFixedThreadPool(2)) {
      var first =
          pool.submit(
              () ->
                  postAfterBarrier(
                      startLine,
                      "/bookings",
                      bookingBody("consult", slotDay, 60, "Иван", "ivan@example.com")));
      var second =
          pool.submit(
              () ->
                  postAfterBarrier(
                      startLine,
                      "/bookings",
                      bookingBody("consult", slotDay, 60, "Пётр", "petr@example.com")));

      List<Integer> statuses =
          List.of(first.get().status(), second.get().status()).stream().sorted().toList();

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
    Throwable withFlush =
        catchThrowable(
            () ->
                inTransaction(
                    () -> {
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
    Throwable withoutFlush =
        catchThrowable(
            () -> inTransaction(() -> entityManager.persist(booking(slotDay, "ivan@example.com"))));

    assertThat(withoutFlush).isNotNull();
    assertThat(withoutFlush).isNotInstanceOf(Refusal.class);
    assertThat(UnavailableWhitelist.declaredInAdvice())
        .noneMatch(type -> type.isInstance(withoutFlush));
  }

  @Test
  @DisplayName("FK, пересечение и PK — один класс исключения; различимы только именем (D17, D38)")
  void integrityViolationsDifferByConstraintNameOnly() {
    Instant start = slotDay.toInstant();
    insertBookingDirectly(slotDay, "petr@example.com");

    // Пересечение: bookings_no_overlap → 409 slot_taken.
    assertThat(refusalOf(() -> entityManager.persist(booking(slotDay, "ivan@example.com"))))
        .isEqualTo(Refusal.Kind.SLOT_TAKEN);

    // Внешний ключ: тип исчез между проверкой и вставкой — база дописывает то,
    // чего не увидел код. Класс тот же, что у пересечения.
    assertThat(
            refusalOf(
                () ->
                    entityManager.persist(
                        new Booking(
                            UUID.randomUUID(),
                            "ghost",
                            start,
                            start.plus(Duration.ofHours(1)),
                            "Иван",
                            "ivan@example.com",
                            Instant.now()))))
        .isEqualTo(Refusal.Kind.EVENT_TYPE_NOT_FOUND);

    // PK двух Владельцев с одним слагом: тот же Integrity, что и у пересечения.
    assertThat(
            refusalOf(
                () ->
                    entityManager.persist(
                        new EventType("consult", "Другое", "тип для тестов", 60))))
        .isEqualTo(Refusal.Kind.EVENT_TYPE_EXISTS);

    // Ни одно из них не в белом списке 503: целостность — не недоступность.
    assertThat(UnavailableWhitelist.declaredInAdvice())
        .noneMatch(
            type ->
                type.isAssignableFrom(
                    org.springframework.dao.DataIntegrityViolationException.class));
  }

  // — чтение списков и правка Типа —

  @Test
  @DisplayName("счётчик Броней на живой базе: включает прошедшие и сходится со списком (D31)")
  void bookingCountIncludesPastBookings() throws Exception {
    // Три Брони одного Типа: две в прошлом и одна в будущем. Счётчик отвечает на
    // вопрос «сколько заведено за всё время», поэтому прошедшие в нём обязаны
    // быть — иначе он уехал бы в минус на второй день после записи.
    Instant past = slotDay.minusDays(3).toInstant();
    insertBookingDirectly(past.minusSeconds(3600), "прошедшая@example.com");
    insertBookingDirectly(past, "ещё-прошедшая@example.com");

    assertThat(post("/bookings", bookingBody("consult", slotDay, 60, "Иван", "ivan@example.com"))
            .status())
        .isEqualTo(201);

    // Тип без единой Брони: счётчик ноль, а не «нет данных».
    var second =
        post(
            "/event-types",
            """
            {"id": "coaching", "name": "Коучинг",
             "description": "тип без Броней", "durationMinutes": 90}
            """);
    assertThat(second.status()).isEqualTo(201);

    JsonNode list = get("/event-types").json(objectMapper).get("types");
    assertThat(list).hasSize(2);
    assertThat(countOf(list, "consult")).isEqualTo(3);
    assertThat(countOf(list, "coaching")).isZero();

    // Тот же Тип поимённо даёт то же число: два ответа считает одна и та же
    // форма запроса, и разойтись они не могут.
    assertThat(get("/event-types/consult").json(objectMapper).get("bookingCount").asInt())
        .isEqualTo(3);
    assertThat(get("/event-types/coaching").json(objectMapper).get("bookingCount").asInt()).isZero();
  }

  @Test
  @DisplayName("PATCH на живой базе меняет тексты и оставляет id с длительностью (D29)")
  void patchOnRealDatabaseKeepsIdentity() throws Exception {
    var patched =
        patch(
            "/event-types/consult",
            """
            {"name": "Новое название", "description": "новое описание"}""");

    assertThat(patched.status()).isEqualTo(200);
    JsonNode body = patched.json(objectMapper);
    assertThat(body.get("name").asText()).isEqualTo("Новое название");
    assertThat(body.get("description").asText()).isEqualTo("новое описание");
    assertThat(body.get("id").asText()).isEqualTo("consult");
    assertThat(body.get("durationMinutes").asInt()).isEqualTo(60);

    // То же в базе, а не только в ответе: ответ собран из той же сущности,
    // поэтому проверка чтением ловит и «ответ врёт, а база права».
    assertThat(jdbc.queryForObject("SELECT name FROM event_types WHERE id = 'consult'", String.class))
        .isEqualTo("Новое название");
    assertThat(
            jdbc.queryForObject(
                "SELECT duration_minutes FROM event_types WHERE id = 'consult'", Integer.class))
        .isEqualTo(60);
  }

  @Test
  @DisplayName("PATCH на несуществующий Тип → 404 event_type_not_found")
  void patchOfMissingTypeOnRealDatabaseRefuses() throws Exception {
    var result =
        patch(
            "/event-types/ghost",
            """
            {"name": "Новое название", "description": "новое описание"}""");

    assertThat(result.status()).isEqualTo(404);
    assertThat(result.json(objectMapper).get("code").asText()).isEqualTo("event_type_not_found");
  }

  // — «запись переживает перезагрузку» (D48) —

  @Test
  @DisplayName("запись переживает перезагрузку: POST, новый запрос, запись есть в GET /bookings (D48)")
  void bookingSurvivesReload() throws Exception {
    var created =
        post("/bookings", bookingBody("consult", slotDay, 60, "Иван", "ivan@example.com"));
    assertThat(created.status()).isEqualTo(201);
    String id = created.json(objectMapper).get("id").asText();

    // Новый запрос — то самое, что делает перезагрузка страницы. Если бы запись
    // жила в памяти процесса или в ответе первого POST, здесь её не было бы.
    var listed = get("/bookings");
    assertThat(listed.status()).isEqualTo(200);
    assertThat(listed.json(objectMapper).toString()).contains(id);
  }

  @Test
  @DisplayName("GET /bookings отдаёт всё по возрастанию start_dt, без параметров (D30)")
  void bookingsComeBackOrderedByStart() throws Exception {
    // Вставка задом наперёд: база обязана вернуть по возрастанию начала, а не
    // в порядке вставки — порядок в памяти был бы подделкой проверки.
    insertBookingDirectly(slotDay.plusMinutes(120).toInstant(), "поздняя@example.com");
    insertBookingDirectly(slotDay.toInstant(), "ранняя@example.com");

    var listed = get("/bookings");
    assertThat(listed.status()).isEqualTo(200);

    JsonNode bookings = listed.json(objectMapper);
    assertThat(bookings).hasSize(2);
    assertThat(bookings.get(0).get("guestEmail").asText()).isEqualTo("ранняя@example.com");
    assertThat(bookings.get(1).get("guestEmail").asText()).isEqualTo("поздняя@example.com");
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

  // — helpers —

  /** Имена ограничений разбирает слой правил; нарушение ловится на явном flush. */
  private Refusal.Kind refusalOf(Runnable insert) {
    Throwable thrown =
        catchThrowable(
            () ->
                inTransaction(
                    () -> {
                      insert.run();
                      entityManager.flush();
                    }));

    assertThat(thrown).isNotNull();
    return Integrity.refusalOf(thrown) == null ? null : Integrity.refusalOf(thrown).kind();
  }

  private void inTransaction(Runnable action) {
    new TransactionTemplate(transactions).executeWithoutResult(status -> action.run());
  }

  private Booking booking(ZonedDateTime start, String email) {
    return new Booking(
        UUID.randomUUID(),
        "consult",
        start.toInstant(),
        start.plusMinutes(60).toInstant(),
        "Иван",
        email,
        Instant.now());
  }

  private void insertBookingDirectly(ZonedDateTime start, String email) {
    insertBookingDirectly(start.toInstant(), email);
  }

  /**
   * Бронь мимо правил слоя — так заводится запись в прошлом, которую
   * {@code POST /bookings} не отпустил бы по правилу «начало не в прошлом».
   */
  private void insertBookingDirectly(Instant start, String email) {
    jdbc.update(
        """
        INSERT INTO bookings VALUES (gen_random_uuid(), 'consult', ?, ?, 'Прямая вставка', ?, now())
        """,
        Timestamp.from(start),
        Timestamp.from(start.plusSeconds(3600)),
        email);
  }

  /** Счётчик Броней конкретного Типа в списке типов. */
  private int countOf(JsonNode list, String typeId) {
    for (JsonNode type : list) {
      if (type.get("id").asText().equals(typeId)) {
        return type.get("bookingCount").asInt();
      }
    }
    throw new AssertionError("Типа " + typeId + " в ответе нет: " + list);
  }

  private HttpResult postAfterBarrier(CyclicBarrier barrier, String path, String body)
      throws Exception {
    barrier.await();
    return post(path, body);
  }

  private String bookingBody(
      String typeId, ZonedDateTime start, long minutes, String name, String email) {

    return """
    {"eventTypeId": "%s",
     "timeRange": {"start": "%s", "end": "%s"},
     "guestName": "%s",
     "guestEmail": "%s"}
    """
        .formatted(
            typeId,
            start.toOffsetDateTime(),
            start.plusMinutes(minutes).toOffsetDateTime(),
            name,
            email);
  }

  private HttpResult patch(String path, String body) throws Exception {
    return send(
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
            .header("Content-Type", "application/json")
            .method("PATCH", HttpRequest.BodyPublishers.ofString(body)));
  }

  private HttpResult post(String path, String body) throws Exception {
    return send(
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
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
