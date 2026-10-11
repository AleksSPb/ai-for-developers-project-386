package com.hexlet.calendar;

// Boot 4 переехал на Jackson 3: маппер живёт в tools.jackson.databind,
// хотя аннотации сгенерированных моделей — по-прежнему com.fasterxml.jackson.annotation.
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.hexlet.calendar.jpa.Booking;
import com.hexlet.calendar.jpa.EventType;
import com.hexlet.calendar.jpa.Window;
import com.hexlet.calendar.repository.BookingRepository;
import com.hexlet.calendar.repository.EventTypeRepository;
import com.hexlet.calendar.repository.WindowRepository;
import jakarta.persistence.EntityManager;
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
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
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

  @LocalServerPort private int port;

  @Autowired private ObjectMapper objectMapper;

  /** Слот в будущем: окна подделываются под него, сид базы здесь ни при чём. */
  private ZonedDateTime slotDay;

  private final HttpClient http = HttpClient.newHttpClient();

  @BeforeEach
  void stubStorage() {
    slotDay = LocalDate.now(MOSCOW).plusDays(3).atTime(10, 0).atZone(MOSCOW);

    when(types.findById("consult"))
        .thenReturn(Optional.of(new EventType("consult", "Консультация", "тип для тестов", 60)));
    // Тот же Тип, но уже со счётчиком: чтение и правка идут одним запросом (D31).
    // Заведение по-прежнему смотрит Тип по идентификатору — для повтора (D28).
    var consultRow = row("consult", "Консультация", 60, 0);
    when(types.findAllWithBookingCounts("consult")).thenReturn(List.of(consultRow));
    // Окно 09:00–18:00 того же дня: слот 10:00–11:00 лежит внутри него.
    when(windows.findByEndDtAfterOrderByStartDtAsc(any()))
        .thenReturn(
            List.of(new Window(slotDay.withHour(9).toInstant(), slotDay.withHour(18).toInstant())));

    // Умолчания «ничего нет»: тест переопределяет их только там, где это и есть
    // его предмет, а не размазывает предпосылки по каждому тесту.
    when(bookings.findByEventTypeIdAndStartDtAndGuestEmail(any(), any(), any()))
        .thenReturn(Optional.empty());
    when(bookings.findOverlapping(any(), any(), any())).thenReturn(List.of());
    when(bookings.findAllByOrderByStartDtAsc()).thenReturn(List.of());
    // Список типов по умолчанию пуст: тесты чтения переопределяют заглушку сами.
    when(types.findAllWithBookingCounts(null)).thenReturn(List.of());
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
  @DisplayName(
      "повтор по ключу (тип, начало, почта) — 201 со старой Бронью, имя не обновилось (D37)")
  void bookingIdempotentRepeat() throws Exception {
    Booking old =
        new Booking(
            UUID.fromString("11111111-1111-1111-1111-111111111111"),
            "consult",
            slotDay.toInstant(),
            slotDay.plusMinutes(60).toInstant(),
            "Иван",
            "ivan@example.com",
            Instant.now());
    when(bookings.findByEventTypeIdAndStartDtAndGuestEmail(
            "consult", slotDay.toInstant(), "ivan@example.com"))
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
    when(bookings.findOverlapping(
            "consult", slotDay.plusMinutes(15).toInstant(), slotDay.plusMinutes(75).toInstant()))
        .thenReturn(
            List.of(
                new Booking(
                    UUID.randomUUID(),
                    "consult",
                    slotDay.toInstant(),
                    slotDay.plusMinutes(60).toInstant(),
                    "Иван",
                    "ivan@example.com",
                    Instant.now())));

    var taken =
        post(
            "/bookings",
            bookingBody("consult", slotDay.plusMinutes(15), 60, "Пётр", "petr@example.com"));

    assertThat(taken.status()).isEqualTo(409);
    assertThat(taken.json(objectMapper).get("code").asText()).isEqualTo("slot_taken");
  }

  @Test
  @DisplayName("повтор Типа с расхождением — 409 event_type_exists (D28)")
  void eventTypeRepeatWithMismatch() throws Exception {
    var conflict =
        post(
            "/event-types",
            """
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
    var noWindow =
        post(
            "/bookings",
            bookingBody("consult", slotDay.withHour(7), 60, "Иван", "ivan@example.com"));
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
        .contains("guestName")
        .contains("guestEmail")
        .contains("eventTypeId");
  }

  @Test
  @DisplayName("GET /windows: прошлого нет, starts — целые часы Мск (D24/D25)")
  void windowsAreRoundedAndLive() throws Exception {
    ZonedDateTime nowMoscow = ZonedDateTime.now(MOSCOW);
    // Окно, начавшееся в прошлом: его начало поднимается до ближайшего целого часа.
    Instant started = nowMoscow.minusMinutes(30).toInstant();
    // Окно целиком в будущем: начало не трогается и уже целый час.
    ZonedDateTime future = nowMoscow.plusDays(1).truncatedTo(ChronoUnit.HOURS).plusHours(3);
    when(windows.findByEndDtAfterOrderByStartDtAsc(any()))
        .thenReturn(
            List.of(
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

  // — чтение и правка Типа события —

  @Test
  @DisplayName("GET /event-types: список и счётчик из одного запроса (D31)")
  void eventTypeListCarriesGroupedCounts() throws Exception {
    var withFour = row("consult", "Консультация", 60, 4);
    var withOne = row("coaching", "Коучинг", 90, 1);
    // Типа без Броней LEFT JOIN не отсекает — счётчик у него ноль.
    var withNone = row("review", "Разбор", 30, 0);
    when(types.findAllWithBookingCounts(null)).thenReturn(List.of(withFour, withOne, withNone));

    var result = get("/event-types");
    assertThat(result.status()).isEqualTo(200);

    JsonNode list = result.json(objectMapper).get("types");
    assertThat(list).hasSize(3);
    assertThat(list.get(0).get("id").asText()).isEqualTo("consult");
    assertThat(list.get(0).get("bookingCount").asInt()).isEqualTo(4);
    assertThat(list.get(1).get("bookingCount").asInt()).isEqualTo(1);
    assertThat(list.get(2).get("bookingCount").asInt()).isZero();

    // Три Типа — один запрос, а не findAll плюс отдельный запрос за счётчиками.
    verify(types, times(1)).findAllWithBookingCounts(null);
  }

  @Test
  @DisplayName("счётчик в списке и в одном Типе сходится: одно и то же число из одного ответа")
  void countIsTheSameInListAndInOneType() throws Exception {
    var inListRow = row("consult", "Консультация", 60, 7);
    var inOneRow = row("consult", "Консультация", 60, 7);
    when(types.findAllWithBookingCounts(null)).thenReturn(List.of(inListRow));
    when(types.findAllWithBookingCounts("consult")).thenReturn(List.of(inOneRow));

    JsonNode inList = get("/event-types").json(objectMapper).get("types").get(0);
    JsonNode inOne = get("/event-types/consult").json(objectMapper);

    assertThat(inList.get("bookingCount").asInt()).isEqualTo(7);
    assertThat(inOne.get("bookingCount").asInt()).isEqualTo(inList.get("bookingCount").asInt());
  }

  @Test
  @DisplayName("GET /event-types/{id}: нет Типа → 404 event_type_not_found")
  void oneEventTypeAndItsNotFound() throws Exception {
    var found = get("/event-types/consult");
    assertThat(found.status()).isEqualTo(200);
    assertThat(found.json(objectMapper).get("id").asText()).isEqualTo("consult");

    when(types.findAllWithBookingCounts("ghost")).thenReturn(List.of());
    var missing = get("/event-types/ghost");

    assertThat(missing.status()).isEqualTo(404);
    assertThat(missing.json(objectMapper).get("code").asText()).isEqualTo("event_type_not_found");
  }

  @Test
  @DisplayName("PATCH меняет название и описание, id и durationMinutes не трогает (D29)")
  void patchRenamesWithoutTouchingIdentity() throws Exception {
    var renamed = row("consult", "Консультация", 60, 0);
    when(types.findAllWithBookingCounts("consult")).thenReturn(List.of(renamed));

    var patched = patch("/event-types/consult", """
        {"name": "Новое название", "description": "новое описание"}""");

    assertThat(patched.status()).isEqualTo(200);
    JsonNode body = patched.json(objectMapper);
    assertThat(body.get("name").asText()).isEqualTo("Новое название");
    assertThat(body.get("description").asText()).isEqualTo("новое описание");
    // Идентификатор и длительность приходят из той же сущности: тело их не
    // содержит и подделать не может (ADR-0005).
    assertThat(body.get("id").asText()).isEqualTo("consult");
    assertThat(body.get("durationMinutes").asInt()).isEqualTo(60);
  }

  @Test
  @DisplayName("PATCH без обязательного поля → 422 из аннотаций модели (D29, D40)")
  void patchWithoutDescriptionIsRejectedByAnnotations() throws Exception {
    var result = patch("/event-types/consult", """
        {"name": "Только название"}""");

    assertThat(result.status()).isEqualTo(422);
    assertThat(result.json(objectMapper).get("fields").toString()).contains("description");
  }

  @Test
  @DisplayName("PATCH на несуществующий Тип → 404 event_type_not_found")
  void patchOfMissingTypeRefuses() throws Exception {
    when(types.findAllWithBookingCounts("ghost")).thenReturn(List.of());

    var result = patch("/event-types/ghost", """
        {"name": "Новое название", "description": "новое описание"}""");

    assertThat(result.status()).isEqualTo(404);
    assertThat(result.json(objectMapper).get("code").asText()).isEqualTo("event_type_not_found");
  }

  // — список Броней —

  @Test
  @DisplayName("GET /bookings: список целиком, порядок из запроса (D30)")
  void bookingsAreListedAsStored() throws Exception {
    when(bookings.findAllByOrderByStartDtAsc())
        .thenReturn(
            List.of(
                new Booking(
                    UUID.randomUUID(),
                    "consult",
                    slotDay.toInstant(),
                    slotDay.plusMinutes(60).toInstant(),
                    "Иван",
                    "ivan@example.com",
                    Instant.now()),
                new Booking(
                    UUID.randomUUID(),
                    "consult",
                    slotDay.plusMinutes(120).toInstant(),
                    slotDay.plusMinutes(180).toInstant(),
                    "Пётр",
                    "petr@example.com",
                    Instant.now())));

    var result = get("/bookings");
    assertThat(result.status()).isEqualTo(200);

    JsonNode list = result.json(objectMapper);
    assertThat(list).hasSize(2);
    assertThat(list.get(0).get("guestName").asText()).isEqualTo("Иван");
    assertThat(list.get(1).get("guestName").asText()).isEqualTo("Пётр");
    // Порядок приходит из базы, а не сортируется в памяти сервиса.
    verify(bookings, times(1)).findAllByOrderByStartDtAsc();
  }

  // — helpers —

  /**
   * Строка группированного ответа: Тип события вместе со счётчиком его Броней.
   *
   * <p>Подмок заводится до {@code when}: стабление другого мока внутри
   * {@code thenReturn} Mockito не завершает.
   */
  private EventTypeRepository.TypeWithBookingCount row(
      String id, String name, int duration, long total) {
    var row = mock(EventTypeRepository.TypeWithBookingCount.class);
    when(row.getType()).thenReturn(new EventType(id, name, "тип для тестов", duration));
    when(row.getTotal()).thenReturn(total);
    return row;
  }

  private String bookingBody(
      String typeId, ZonedDateTime start, long minutes, String name, String email)
      throws Exception {

    return objectMapper.writeValueAsString(
        Map.of(
            "eventTypeId", typeId,
            "timeRange",
                Map.of(
                    "start", start.toOffsetDateTime().toString(),
                    "end", start.plusMinutes(minutes).toOffsetDateTime().toString()),
            "guestName", name,
            "guestEmail", email));
  }

  private HttpResult post(String path, String body) throws Exception {
    return send(
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
            .header("Content-Type", "application/json")
            .POST(HttpRequest.BodyPublishers.ofString(body)));
  }

  private HttpResult patch(String path, String body) throws Exception {
    return send(
        HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
            .header("Content-Type", "application/json")
            .method(
                "PATCH",
                HttpRequest.BodyPublishers.ofString(body)));
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
