package com.hexlet.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.hexlet.calendar.api.model.CreateBookingRequest;
import com.hexlet.calendar.api.model.CreateEventTypeRequest;
import com.hexlet.calendar.api.model.EventTypeSummary;
import com.hexlet.calendar.api.model.TimeRange;
import com.hexlet.calendar.api.model.UpdateEventTypeRequest;
import com.hexlet.calendar.jpa.Booking;
import com.hexlet.calendar.jpa.EventType;
import com.hexlet.calendar.jpa.Window;
import com.hexlet.calendar.mapping.BookingMapper;
import com.hexlet.calendar.mapping.EventTypeMapper;
import com.hexlet.calendar.metrics.DomainMetrics;
import com.hexlet.calendar.refusal.Refusal;
import com.hexlet.calendar.repository.BookingRepository;
import com.hexlet.calendar.repository.EventTypeRepository;
import com.hexlet.calendar.repository.WindowRepository;
import com.hexlet.calendar.service.BookingService;
import com.hexlet.calendar.service.EventTypeService;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Порядок проверок слоя правил — БЕЗ базы.
 *
 * <p>Никакого {@code @SpringBootTest}, никаких контейнеров: {@code Clock} —
 * конструкторный параметр слоя правил (D21), репозитории — мок. Если бы часы
 * читались в запросах или в репозитории, этот файл был бы невозможен, а
 * фикстура времени требовала бы контейнер на каждый шаг порядка D32.
 *
 * <p>Второе наблюдение, которое даёт только такой тест: шаг «прошлое» стоит
 * РАНЬШЕ шага «длительность» (D32 в редакции #81) — видно по {@code verify}:
 * за типом событий репозиторий не идёт вовсе.
 *
 * <p>Уровень 1 пирамиды (#102). Суффикс {@code Unit} в имени файла — то же, что
 * уровень: surefire гоняет его первым execution'ом, до контекста и контейнера.
 */
class RulesWithoutDbUnit {

  private static final Instant NOW = Instant.parse("2026-10-09T09:00:00Z");
  private static final Clock FIXED = Clock.fixed(NOW, ZoneOffset.UTC);

  private final WindowRepository windows = mock(WindowRepository.class);
  private final EventTypeRepository types = mock(EventTypeRepository.class);
  private final BookingRepository bookings = mock(BookingRepository.class);

  /** Заведение Типа пишет через него; тут важно лишь, что persist и flush зовутся. */
  private final EntityManager entityManager = mock(EntityManager.class);

  /**
   * Настоящий реестр Micrometer, а не мок: счётчики обязаны действительно расти,
   * иначе проверка «повтор не посчитан» прошла бы и при счётчике, который не
   * работает вовсе. SimpleMeterRegistry ничего внешнего не требует — ровно то,
   * чем заменяет себя приложение по умолчанию (D62).
   */
  private SimpleMeterRegistry registry;

  private DomainMetrics metrics;

  /**
   * Запись пишет через {@code EntityManager}, поэтому здесь он настоящий мок, а не
   * {@code null}: успешная запись нужна тестам счётчиков (D62), а {@code persist}
   * на {@code null} упал бы раньше, чем дошло дело до метрики.
   */
  private BookingService service;

  /**
   * Заводит реестр и сервисы заново перед каждым тестом — так нулевая база
   * счётчиков объявлена прямо здесь, а не оставлена на волю life cycle JUnit.
   *
   * <p>Пока life cycle {@code PER_METHOD}, новый экземпляр на метод даёт новый
   * реестр и само собой. Опора на умолчание молча ломается, если класс переведут
   * на {@code PER_CLASS} — так сделано в {@code ApiOperationsIT}, — и «счётчик
   * равен единице» упало бы на числах, накопленных соседними тестами.
   *
   * <p>Обнулять старый реестр через {@code clear()} нельзя, и это отдельная
   * ловушка: {@code clear()} убирает метрики из реестра, а {@link DomainMetrics}
   * держит ссылки на уже зарегистрированные счётчики. После очистки эти счётчики
   * остаются инкрементируемыми, но в реестр больше ничего не пишут, и любой
   * тест метрик проходит с нулём. Поэтому реестр пересоздаётся, а не очищается.
   */
  @BeforeEach
  void setUp() {
    registry = new SimpleMeterRegistry();
    metrics = new DomainMetrics(registry);
    service =
        new BookingService(
            FIXED, bookings, types, windows, new BookingMapper(), entityManager, metrics);
  }

  private EventTypeService typeService() {
    return new EventTypeService(types, new EventTypeMapper(), entityManager, metrics);
  }

  /**
   * Текущее значение счётчика; отсутствующий счётчик — ноль, а не исключение:
   * до первого вызова метрики в реестре ещё нет, и это то же самое число.
   */
  private double counterValue(String name) {
    var meter = registry.find(name).counter();
    return meter == null ? 0d : meter.count();
  }

  @Test
  @DisplayName("начало в прошлом — 422 time_not_bookable, и база не тронута")
  void pastStartRefusesBeforeAnyRead() {
    when(types.findById(anyString()))
        .thenReturn(Optional.of(new EventType("consult", "Консультация", "описание", 60)));

    CreateBookingRequest request =
        bookingRequest("consult", NOW.minusSeconds(3600), NOW.minusSeconds(3600).plusSeconds(3600));

    assertThatThrownBy(() -> service.create(request))
        .isInstanceOfSatisfying(
            Refusal.class,
            refusal -> assertThat(refusal.kind()).isEqualTo(Refusal.Kind.TIME_NOT_BOOKABLE));

    // Прошлое раньше длительности: до база за типом не шли (D32, #81).
    verify(types, never()).findById(anyString());
    verify(windows, never()).findByEndDtAfterOrderByStartDtAsc(any());
  }

  @Test
  @DisplayName("длительность ≠ длительности Типа → 422 validation_failed[timeRange]")
  void durationMustMatchType() {
    when(types.findById("consult"))
        .thenReturn(Optional.of(new EventType("consult", "Консультация", "описание", 60)));

    CreateBookingRequest request =
        bookingRequest("consult", NOW.plusSeconds(3600), NOW.plusSeconds(3600).plusSeconds(1800));

    assertThatThrownBy(() -> service.create(request))
        .isInstanceOfSatisfying(
            Refusal.class,
            refusal -> {
              assertThat(refusal.kind()).isEqualTo(Refusal.Kind.VALIDATION_FAILED);
              assertThat(refusal.fields()).containsExactly("timeRange");
            });
  }

  @Test
  @DisplayName("нет окна, содержащего интервал → 404 slot_not_found")
  void intervalMustFitOneWindow() {
    when(types.findById("consult"))
        .thenReturn(Optional.of(new EventType("consult", "Консультация", "описание", 60)));
    when(windows.findByEndDtAfterOrderByStartDtAsc(NOW))
        .thenReturn(
            List.of(new Window(NOW.plusSeconds(3600), NOW.plusSeconds(3600).plusSeconds(1800))));

    // Интервал 09:00+3600 … +7200 не влезает в окно [+3600, +5400): не 409, а 404 (D35).
    CreateBookingRequest request =
        bookingRequest("consult", NOW.plusSeconds(3600), NOW.plusSeconds(3600).plusSeconds(3600));

    assertThatThrownBy(() -> service.create(request))
        .isInstanceOfSatisfying(
            Refusal.class,
            refusal -> assertThat(refusal.kind()).isEqualTo(Refusal.Kind.SLOT_NOT_FOUND));
  }

  @Test
  @DisplayName("повтор по ключу (тип, начало, почта) — старая Бронь, имя не обновляется (D37)")
  void repeatReturnsOldBooking() {
    Booking old =
        new Booking(
            UUID.fromString("11111111-1111-1111-1111-111111111111"),
            "consult",
            NOW.plusSeconds(3600),
            NOW.plusSeconds(7200),
            "ИВАН",
            "ivan@example.com",
            NOW.minusSeconds(60));

    when(types.findById("consult"))
        .thenReturn(Optional.of(new EventType("consult", "Консультация", "описание", 60)));
    when(windows.findByEndDtAfterOrderByStartDtAsc(NOW))
        .thenReturn(List.of(new Window(NOW, NOW.plusSeconds(36000))));
    when(bookings.findByEventTypeIdAndStartDtAndGuestEmail(
            "consult", NOW.plusSeconds(3600), "ivan@example.com"))
        .thenReturn(Optional.of(old));

    // Тот же ключ, но другое имя: ответ — старая Броня со СТАРЫМ именем.
    CreateBookingRequest request =
        bookingRequest("consult", NOW.plusSeconds(3600), NOW.plusSeconds(7200), "Пётр");

    var model = service.create(request);

    assertThat(model.getId()).isEqualTo("11111111-1111-1111-1111-111111111111");
    assertThat(model.getGuestName()).isEqualTo("ИВАН");
    assertThat(model.getCreatedAt().toInstant()).isEqualTo(NOW.minusSeconds(60));
  }

  @Test
  @DisplayName("почта проверяется руками → 422 validation_failed[guestEmail] (D41)")
  void emailFormatIsManualRule() {
    CreateBookingRequest request =
        bookingRequest("consult", NOW.plusSeconds(3600), NOW.plusSeconds(7200));
    request.setGuestEmail("nope");

    assertThatThrownBy(() -> service.create(request))
        .isInstanceOfSatisfying(
            Refusal.class,
            refusal -> {
              assertThat(refusal.kind()).isEqualTo(Refusal.Kind.VALIDATION_FAILED);
              assertThat(refusal.fields()).containsExactly("guestEmail");
            });
  }

  @Test
  @DisplayName(
      "счётчик Броней приходит вместе с Типом: один запрос на весь список, а не два (D31)")
  void bookingCountComesWithTheTypesInOneQuery() {
    EventTypeService typeService = typeService();

    // Три строки группированного ответа, счётчик — в каждой. Типа без Броней
    // LEFT JOIN не отсекает: у него счётчик ноль.
    // Строки заведены ДО `when`: стабление мока внутри `thenReturn` Mockito
    // не даёт закончить начатое.
    var consult = row("consult", "Консультация", 60, 4);
    var coaching = row("coaching", "Коучинг", 90, 1);
    var review = row("review", "Разбор", 30, 0);
    when(types.findAllWithBookingCounts(null)).thenReturn(List.of(consult, coaching, review));

    var list = typeService.list();

    assertThat(list.getTypes())
        .extracting(EventTypeSummary::getId, EventTypeSummary::getBookingCount)
        .containsExactly(tuple("consult", 4), tuple("coaching", 1), tuple("review", 0));

    // Ключевое наблюдение: один запрос на три Типа, а не findAll плюс запрос за
    // счётчиками (то, что было бы N+1 с точностью до наоборот).
    verify(types, times(1)).findAllWithBookingCounts(null);
    verify(types, never()).findAll();
  }

  @Test
  @DisplayName("один Тип и список берут счётчик одной и той же формой запроса (D31)")
  void singleAndListShareTheSameCountQuery() {
    EventTypeService typeService = typeService();

    var single = row("consult", "Консультация", 60, 2);
    when(types.findAllWithBookingCounts("consult")).thenReturn(List.of(single));

    assertThat(typeService.get("consult").getBookingCount()).isEqualTo(2);

    // Ровно тот же метод репозитория, что у списка: если бы чтение одного Типа
    // считало своим запросом, числа разошлись бы при первой же гонке.
    verify(types, times(1)).findAllWithBookingCounts("consult");
  }

  @Test
  @DisplayName("нет Типа → 404 event_type_not_found, тем же отказом, что и у записи")
  void missingEventTypeRefuses() {
    EventTypeService typeService = typeService();

    when(types.findAllWithBookingCounts("ghost")).thenReturn(List.of());

    assertThatThrownBy(() -> typeService.get("ghost"))
        .isInstanceOfSatisfying(
            Refusal.class,
            refusal -> assertThat(refusal.kind()).isEqualTo(Refusal.Kind.EVENT_TYPE_NOT_FOUND));
  }

  @Test
  @DisplayName("переименование меняет только название и описание: id и durationMinutes целы (D29)")
  void renameTouchesNothingButText() {
    EventTypeService typeService = typeService();

    var stored = row("consult", "Консультация", 60, 0);
    when(types.findAllWithBookingCounts("consult")).thenReturn(List.of(stored));

    UpdateEventTypeRequest request = new UpdateEventTypeRequest();
    request.setName("  Новое название  ");
    request.setDescription("новое описание");

    var summary = typeService.update("consult", request);

    assertThat(summary.getName()).isEqualTo("Новое название");
    assertThat(summary.getDescription()).isEqualTo("новое описание");
    assertThat(summary.getId()).isEqualTo("consult");
    assertThat(summary.getDurationMinutes()).isEqualTo(60);
  }

  @Test
  @DisplayName("кратность 15 — ручное правило Типа (D42): 20 минут → fields[durationMinutes]")
  void durationStepIsManual() {
    EventTypeService typeService = typeService();

    CreateEventTypeRequest request = new CreateEventTypeRequest();
    request.setId("coaching");
    request.setName("Коучинг");
    request.setDescription("описание");
    request.setDurationMinutes(20);

    assertThatThrownBy(() -> typeService.create(request))
        .isInstanceOfSatisfying(
            Refusal.class,
            refusal -> {
              assertThat(refusal.kind()).isEqualTo(Refusal.Kind.VALIDATION_FAILED);
              assertThat(refusal.fields()).containsExactly("durationMinutes");
            });
  }

  @Test
  @DisplayName("заведение Типа обходится одним чтением: повторной выборки после INSERT нет")
  void createDoesNotReReadWhatItJustPersisted() {
    EventTypeService typeService = typeService();

    when(types.findAllWithBookingCounts("coaching")).thenReturn(List.of());

    CreateEventTypeRequest request = new CreateEventTypeRequest();
    request.setId("coaching");
    request.setName("Коучинг");
    request.setDescription("описание");
    request.setDurationMinutes(90);

    var summary = typeService.create(request);

    assertThat(summary.getId()).isEqualTo("coaching");
    assertThat(summary.getBookingCount()).isZero();

    // Ключевое наблюдение: чтение было ровно одно — предпроверка идемпотентности.
    // Повторная выборка Типа, который мы только что вставили, читала бы из базы
    // то же, что уже лежит в переменной, и стоила бы ещё одного обхода таблицы
    // за один уже сделанный INSERT.
    verify(types, times(1)).findAllWithBookingCounts("coaching");
  }

  @Test
  @DisplayName("повтор заведения возвращает Тип со счётчиком из базы (D28)")
  void createRepeatReturnsCountFromDatabase() {
    EventTypeService typeService = typeService();

    // Брони на этот Тип могли завести между первой попыткой и повторной:
    // счётчик повтора обязан прийти из базы, а не быть нулём по умолчанию.
    var repeated = row("coaching", "Коучинг", 90, 5);
    when(types.findAllWithBookingCounts("coaching")).thenReturn(List.of(repeated));

    CreateEventTypeRequest request = new CreateEventTypeRequest();
    request.setId("coaching");
    request.setName("Коучинг");
    request.setDescription("описание");
    request.setDurationMinutes(90);

    assertThat(typeService.create(request).getBookingCount()).isEqualTo(5);
  }

  // — метрики домена (D62) —

  @Test
  @DisplayName("новая Бронь увеличивает booking.created")
  void newBookingCountsOnTheCounter() {
    stubSuccessfulBooking();

    service.create(bookingRequest("consult", NOW.plusSeconds(3600), NOW.plusSeconds(7200)));

    assertThat(counterValue("booking.created")).isEqualTo(1d);
  }

  @Test
  @DisplayName("повтор по ключу идемпотентности не считается записью (D37): счётчик не растёт")
  void bookingRepeatIsNotCounted() {
    stubSuccessfulBooking();
    Booking old =
        new Booking(
            UUID.fromString("11111111-1111-1111-1111-111111111111"),
            "consult",
            NOW.plusSeconds(3600),
            NOW.plusSeconds(7200),
            "Иван",
            "ivan@example.com",
            NOW.minusSeconds(60));
    when(bookings.findByEventTypeIdAndStartDtAndGuestEmail(
            "consult", NOW.plusSeconds(3600), "ivan@example.com"))
        .thenReturn(Optional.of(old));

    service.create(bookingRequest("consult", NOW.plusSeconds(3600), NOW.plusSeconds(7200)));

    // Повтор вернул существующую Бронь и не вставил строку: считать его было бы
    // «посчитать HTTP-запросы», а это и делает actuator без нас.
    assertThat(counterValue("booking.created")).isZero();
    verify(entityManager, never()).persist(any());
  }

  @Test
  @DisplayName("заведение Типа считается, идемпотентный повтор (D28) — нет")
  void eventTypeCreatedIsCountedButItsRepeatIsNot() {
    EventTypeService typeService = typeService();

    when(types.findAllWithBookingCounts("coaching")).thenReturn(List.of());

    typeService.create(eventTypeRequest("coaching", "Коучинг", 90));

    assertThat(counterValue("event_type.created")).isEqualTo(1d);

    // Тот же набор полей: повтор вернёт существующий Тип, ничего не заведя.
    // Строка заводится ДО `when`: стабление мока внутри `thenReturn` Mockito
    // не даёт закончить начатое.
    var repeated = row("coaching", "Коучинг", 90, 0);
    when(types.findAllWithBookingCounts("coaching")).thenReturn(List.of(repeated));

    typeService.create(eventTypeRequest("coaching", "Коучинг", 90));

    assertThat(counterValue("event_type.created")).isEqualTo(1d);
  }

  @Test
  @DisplayName("переименование увеличивает event_type.updated")
  void eventTypeUpdateCountsOnTheCounter() {
    EventTypeService typeService = typeService();
    var stored = row("consult", "Консультация", 60, 0);
    when(types.findAllWithBookingCounts("consult")).thenReturn(List.of(stored));

    UpdateEventTypeRequest request = new UpdateEventTypeRequest();
    request.setName("Новое название");
    request.setDescription("новое описание");
    typeService.update("consult", request);

    assertThat(counterValue("event_type.updated")).isEqualTo(1d);
  }

  @Test
  @DisplayName("занятый слот — отказ, а не запись: booking.created не растёт")
  void takenSlotIsNotCountedAsBooking() {
    stubSuccessfulBooking();
    // Пересечение нашлось предпроверкой. Отказ тот же, что даёт гонка на базе,
    // поэтому подделки достаточно — INSERT всё равно не дойдёт.
    when(bookings.findOverlapping(any(), any(), any()))
        .thenReturn(
            List.of(
                new Booking(
                    UUID.randomUUID(),
                    "consult",
                    NOW.plusSeconds(3600),
                    NOW.plusSeconds(7200),
                    "Иван",
                    "ivan@example.com",
                    NOW)));

    assertThatThrownBy(
            () -> service.create(bookingRequest("consult", NOW.plusSeconds(3600), NOW.plusSeconds(7200))))
        .isInstanceOfSatisfying(
            Refusal.class,
            refusal -> assertThat(refusal.kind()).isEqualTo(Refusal.Kind.SLOT_TAKEN));

    assertThat(counterValue("booking.created")).isZero();
  }

  @Test
  @DisplayName("нет окна под слот — отказ до вставки, счётчик не растёт")
  void bookingOutsideAnyWindowIsNotCounted() {
    stubSuccessfulBooking();
    when(windows.findByEndDtAfterOrderByStartDtAsc(NOW)).thenReturn(List.of());

    assertThatThrownBy(
            () -> service.create(bookingRequest("consult", NOW.plusSeconds(3600), NOW.plusSeconds(7200))))
        .isInstanceOfSatisfying(
            Refusal.class,
            refusal -> assertThat(refusal.kind()).isEqualTo(Refusal.Kind.SLOT_NOT_FOUND));

    assertThat(counterValue("booking.created")).isZero();
  }

  @Test
  @DisplayName("расхождение полей при заведении Типа — отказ, event_type.created не растёт")
  void conflictingEventTypeIsNotCountedAsCreated() {
    EventTypeService typeService = typeService();
    // Тот же идентификатор, но другие поля: по D28 это 409, а не идемпотентный
    // повтор. Строка заводится ДО `when` — стабление мока внутри `thenReturn`
    // Mockito не даёт закончить начатое.
    var existing = row("coaching", "Совсем другое название", 90, 0);
    when(types.findAllWithBookingCounts("coaching")).thenReturn(List.of(existing));

    assertThatThrownBy(() -> typeService.create(eventTypeRequest("coaching", "Коучинг", 90)))
        .isInstanceOfSatisfying(
            Refusal.class,
            refusal -> assertThat(refusal.kind()).isEqualTo(Refusal.Kind.EVENT_TYPE_EXISTS));

    assertThat(counterValue("event_type.created")).isZero();
  }

  @Test
  @DisplayName("переименование несуществующего Типа — отказ, event_type.updated не растёт")
  void renameOfMissingEventTypeIsNotCounted() {
    EventTypeService typeService = typeService();
    when(types.findAllWithBookingCounts("ghost")).thenReturn(List.of());

    UpdateEventTypeRequest request = new UpdateEventTypeRequest();
    request.setName("Новое название");
    request.setDescription("новое описание");

    assertThatThrownBy(() -> typeService.update("ghost", request))
        .isInstanceOfSatisfying(
            Refusal.class,
            refusal -> assertThat(refusal.kind()).isEqualTo(Refusal.Kind.EVENT_TYPE_NOT_FOUND));

    assertThat(counterValue("event_type.updated")).isZero();
  }

  /**
   * Запись, доходящая до конца: Тип есть, окно есть, повтора нет, пересечений нет.
   *
   * <p>Общие предпосылки для тестов счётчика записи вынесены сюда, потому что
   * предмет их разный: одним нужен успешный INSERT, другим — отказ до него или
   * ранний выход по D37.
   */
  private void stubSuccessfulBooking() {
    when(types.findById("consult"))
        .thenReturn(Optional.of(new EventType("consult", "Консультация", "описание", 60)));
    when(windows.findByEndDtAfterOrderByStartDtAsc(NOW))
        .thenReturn(List.of(new Window(NOW, NOW.plusSeconds(36000))));
    when(bookings.findByEventTypeIdAndStartDtAndGuestEmail(any(), any(), any()))
        .thenReturn(Optional.empty());
    when(bookings.findOverlapping(any(), any(), any())).thenReturn(List.of());
  }

  private static CreateEventTypeRequest eventTypeRequest(String id, String name, int duration) {
    CreateEventTypeRequest request = new CreateEventTypeRequest();
    request.setId(id);
    request.setName(name);
    request.setDescription("описание");
    request.setDurationMinutes(duration);
    return request;
  }

  /**
   * Строка группированного ответа: Тип события вместе со счётчиком его Броней.
   *
   * <p>Проекция — интерфейс, поэтому подделать её можно только моком; собственного
   * типа ради теста здесь не заводим, иначе он стал бы вторым описанием формы
   * ответа, которая правда живёт в SQL.
   */
  private static EventTypeRepository.TypeWithBookingCount row(
      String id, String name, int duration, long total) {
    var row = mock(EventTypeRepository.TypeWithBookingCount.class);
    when(row.getType()).thenReturn(new EventType(id, name, "описание", duration));
    when(row.getTotal()).thenReturn(total);
    return row;
  }

  private static CreateBookingRequest bookingRequest(String typeId, Instant start, Instant end) {
    return bookingRequest(typeId, start, end, "Иван");
  }

  private static CreateBookingRequest bookingRequest(
      String typeId, Instant start, Instant end, String guestName) {

    TimeRange range = new TimeRange();
    range.setStart(OffsetDateTime.ofInstant(start, ZoneOffset.UTC));
    range.setEnd(OffsetDateTime.ofInstant(end, ZoneOffset.UTC));

    CreateBookingRequest request = new CreateBookingRequest();
    request.setEventTypeId(typeId);
    request.setTimeRange(range);
    request.setGuestName(guestName);
    request.setGuestEmail("ivan@example.com");
    return request;
  }
}
