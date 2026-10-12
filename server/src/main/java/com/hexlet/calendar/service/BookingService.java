package com.hexlet.calendar.service;

import com.hexlet.calendar.api.model.CreateBookingRequest;
import com.hexlet.calendar.jpa.Booking;
import com.hexlet.calendar.jpa.EventType;
import com.hexlet.calendar.mapping.BookingMapper;
import com.hexlet.calendar.metrics.DomainMetrics;
import com.hexlet.calendar.refusal.Refusal;
import com.hexlet.calendar.repository.BookingRepository;
import com.hexlet.calendar.repository.EventTypeRepository;
import com.hexlet.calendar.repository.WindowRepository;
import jakarta.persistence.EntityManager;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Слой правил записи: пять шагов D32 целиком здесь, HTTP-кодов — нет.
 *
 * <p>Что слой получает: сгенерированную модель {@code CreateBookingRequest}
 * (валидация формы дошла уже сгруппированной из {@code web}) и {@link Clock}.
 * Что отдаёт наружу: модель контракта (через маппер — сущность не выходит)
 * или {@link Refusal}.
 *
 * <p>Правило записи и код отказа разделены стенкой, но не пакетом-словарём
 * HTTP: {@code slot_taken} рождается здесь как {@code Refusal}, а «это 409»
 * знает только advice. Единственное место, где база говорит с правилами, —
 * {@link Integrity}: имена ограничений читаются, пока транзакция открыта.
 * Отсюда требование явного {@code flush} (приехало из #82): без него INSERT
 * уходит на commit, исключение прилетает НЕ из-под {@code try} правил, и гость
 * с занятым слотом получает 500 вместо 409. Наблюдение — в {@code ApiOperationsIT}.
 */
@Service
public class BookingService {

  /** Ручная проверка почты — канон (D41); @Email из модели лишь дублирует её. */
  private static final java.util.regex.Pattern EMAIL =
      java.util.regex.Pattern.compile("^[^@\\s]+@[^@\\s.]+(\\.[^@\\s.]+)+$");

  private final Clock clock;
  private final BookingRepository bookingRepository;
  private final EventTypeRepository eventTypeRepository;
  private final WindowRepository windowRepository;
  private final BookingMapper bookingMapper;
  private final EntityManager entityManager;
  private final DomainMetrics metrics;

  /**
   * Репозитории, маппер и счётчик — всё, что нужно пяти шагам D32; часы приходят
   * извне (D21).
   *
   * <p>Счётчик — не часть правил: он ничего не проверяет и ни на что не влияет,
   * а нужен затем, чтобы «записей столько-то» можно было увидеть, не заводя
   * ради этого ещё одну таблицу или запрос (D62).
   */
  public BookingService(
      Clock clock,
      BookingRepository bookingRepository,
      EventTypeRepository eventTypeRepository,
      WindowRepository windowRepository,
      BookingMapper bookingMapper,
      EntityManager entityManager,
      DomainMetrics metrics) {

    this.clock = clock;
    this.bookingRepository = bookingRepository;
    this.eventTypeRepository = eventTypeRepository;
    this.windowRepository = windowRepository;
    this.bookingMapper = bookingMapper;
    this.entityManager = entityManager;
    this.metrics = metrics;
  }

  /**
   * Записывает Бронь; порядок и содержание пяти шагов — в описании класса (D32).
   *
   * <p>Наружу отдаётся модель контракта, а не сущность; отказ приходит
   * исключением {@link Refusal} без HTTP-кода.
   */
  @Transactional
  public com.hexlet.calendar.api.model.Booking create(CreateBookingRequest request) {

    Instant now = clock.instant();

    // Шаг 1 — форма. Обязательность и длина пришли аннотациями из api.model
    // и разбираются advice (D40); руками остаётся формат почты (D41) и
    // нормализация — trim имени, lowercase почты (D43).
    String guestName = request.getGuestName().trim();
    String guestEmail = request.getGuestEmail().trim().toLowerCase(java.util.Locale.ROOT);
    if (!EMAIL.matcher(guestEmail).matches()) {
      throw new Refusal(Refusal.Kind.VALIDATION_FAILED, List.of("guestEmail"));
    }

    Instant start = request.getTimeRange().getStart().toInstant();
    Instant end = request.getTimeRange().getEnd().toInstant();

    // Шаг 2 — прошлое раньше длительности, как в прозе main.tsp (D32; закрыто в #81).
    if (start.isBefore(now)) {
      throw new Refusal(Refusal.Kind.TIME_NOT_BOOKABLE);
    }

    // Шаг 3 — длительность: тип сначала ищется (нет — 404 event_type_not_found),
    // потом сравнивается интервал (не совпала — 422 validation_failed, D33).
    EventType eventType =
        eventTypeRepository
            .findById(request.getEventTypeId())
            .orElseThrow(() -> new Refusal(Refusal.Kind.EVENT_TYPE_NOT_FOUND));
    if (Duration.between(start, end).toMinutes() != eventType.getDurationMinutes()) {
      throw new Refusal(Refusal.Kind.VALIDATION_FAILED, List.of("timeRange"));
    }

    // Шаг 4 — окно: ОДНО, целиком содержащее интервал (D35). Длинный интервал
    // даёт 404, а не 409; «409 вне окна» в этой формулировке недостижим.
    // Момент для фильтра пришёл из Clock, запрос его не получает из базы (D21).
    boolean insideWindow =
        windowRepository.findByEndDtAfterOrderByStartDtAsc(now).stream()
            .anyMatch(w -> !w.getStartDt().isAfter(start) && w.getEndDt().isAfter(end));
    if (!insideWindow) {
      throw new Refusal(Refusal.Kind.SLOT_NOT_FOUND);
    }

    // Ключ идемпотентности — ДО шага «пересечение» (D37, закрыто в #81):
    // повтор возвращает старую Бронь со СТАРЫМ именем; имя не обновляется
    // и ошибкой не считается, created_at не переписывается.
    var repeated =
        bookingRepository.findByEventTypeIdAndStartDtAndGuestEmail(
            eventType.getId(), start, guestEmail);
    if (repeated.isPresent()) {
      return bookingMapper.toModel(repeated.get());
    }

    Booking booking =
        new Booking(UUID.randomUUID(), eventType.getId(), start, end, guestName, guestEmail, now);

    // Шаг 5 — пересечение: предпроверка кодом (последний рубеж не отменяет
    // обязательность проверки в коде, см. комментарий к схеме), затем INSERT
    // и явный flush: без flush база возразит на commit, за пределами правил.
    if (!bookingRepository.findOverlapping(eventType.getId(), start, end).isEmpty()) {
      throw new Refusal(Refusal.Kind.SLOT_TAKEN);
    }

    try {
      entityManager.persist(booking);
      // Явный flush обязателен: без него INSERT уходит на commit, исключение
      // вспыхивает за пределами этого try, имя ограничения читать уже некому,
      // и гость с занятым слотом получает 500 вместо 409.
      entityManager.flush();
    } catch (RuntimeException ex) {
      // НЕ catch (DataIntegrityViolationException): явный flush сквозь
      // shared-прокси в Hibernate 7 бросает СЫРОЙ ConstraintViolationException,
      // Spring его не переводит (наблюдение #83, см. Integrity).
      Refusal refusal = Integrity.refusalOf(ex);
      if (refusal == null) {
        throw ex; // непонятое имя ограничения — не отказ гостю, а 500:
        // белый список D38 не трогает его, /error подменит тело.
      }
      throw refusal;
    }

    // Счётчик успешных записей (D62) — здесь, а не в advice и не в контроллере:
    // единственная точка, где строка действительно легла в базу. Ветка
    // идемпотентного повтора (D37) выше вернула существующую Бронь и сюда не
    // доходит, поэтому повтор созданием не считается.
    metrics.bookingCreated();

    return bookingMapper.toModel(booking);
  }

  /**
   * Все Брони по возрастанию начала — целиком, без параметров (D30).
   *
   * <p>Здесь нет ни одного правила: чтение списка не может быть отказом —
   * любой отказ означал бы, что календарь сломан, и гость увидел бы пустоту
   * вместо ответа. Порядок задаёт запрос в базе, а не сортировка в памяти:
   * сортировка памяти была бы вторым местом правды о порядке, который
   * контракт уже описал словами.
   *
   * <p>Пагинации нет и не заводится: она означала бы, что клиент умеет
   * листать список Броней, а он не умеет — он читает его целиком.
   */
  @Transactional(readOnly = true)
  public List<com.hexlet.calendar.api.model.Booking> list() {

    return bookingRepository.findAllByOrderByStartDtAsc().stream()
        .map(bookingMapper::toModel)
        .toList();
  }
}
