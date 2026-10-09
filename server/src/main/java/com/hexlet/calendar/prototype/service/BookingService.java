package com.hexlet.calendar.prototype.service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.hexlet.calendar.api.model.CreateBookingRequest;
import com.hexlet.calendar.prototype.jpa.Booking;
import com.hexlet.calendar.prototype.jpa.EventType;
import com.hexlet.calendar.prototype.jpa.Window;
import com.hexlet.calendar.prototype.mapping.BookingMapper;
import com.hexlet.calendar.prototype.refusal.Refusal;
import com.hexlet.calendar.prototype.repository.BookingRepository;
import com.hexlet.calendar.prototype.repository.EventTypeRepository;
import com.hexlet.calendar.prototype.repository.WindowRepository;

import jakarta.persistence.EntityManager;

/**
 * ПРОТОТИП (#83). Слой правил записи: пять шагов D32 целиком здесь, HTTP-кодов — нет.
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
 * с занятым слотом получает 500 вместо 409. Наблюдение — в {@code
 * LayerObservationsTest#raceWithoutFlush} (тестовом).
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

    public BookingService(Clock clock,
                          BookingRepository bookingRepository,
                          EventTypeRepository eventTypeRepository,
                          WindowRepository windowRepository,
                          BookingMapper bookingMapper,
                          EntityManager entityManager) {

        this.clock = clock;
        this.bookingRepository = bookingRepository;
        this.eventTypeRepository = eventTypeRepository;
        this.windowRepository = windowRepository;
        this.bookingMapper = bookingMapper;
        this.entityManager = entityManager;
    }

    /**
     * Режим записи. NORMAL — боевой путь; RACE_* существуют только чтобы
     * показать, где именно срабатывает базовый рубеж и что делает явный flush.
     */
    public enum Mode {
        NORMAL,
        /** Предпроверка пропущена, flush есть: ограничение ловит слой правил. */
        RACE_WITH_FLUSH,
        /** Предпроверка пропущена, flush нет: то же ограничение ловит /error. */
        RACE_WITHOUT_FLUSH,
    }

    @Transactional
    public com.hexlet.calendar.api.model.Booking create(CreateBookingRequest request, Mode mode) {

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
        EventType eventType = eventTypeRepository.findById(request.getEventTypeId())
                .orElseThrow(() -> new Refusal(Refusal.Kind.EVENT_TYPE_NOT_FOUND));
        if (Duration.between(start, end).toMinutes() != eventType.getDurationMinutes()) {
            throw new Refusal(Refusal.Kind.VALIDATION_FAILED, List.of("timeRange"));
        }

        // Шаг 4 — окно: ОДНО, целиком содержащее интервал (D35). Длинный интервал
        // даёт 404, а не 409; «409 вне окна» в этой формулировке недостижим.
        // Момент для фильтра пришёл из Clock, запрос его не получает из базы (D21).
        boolean insideAWindow = windowRepository.findByEndDtAfterOrderByStartDtAsc(now).stream()
                .anyMatch(w -> !w.getStartDt().isAfter(start) && w.getEndDt().isAfter(end));
        if (!insideAWindow) {
            throw new Refusal(Refusal.Kind.SLOT_NOT_FOUND);
        }

        // Ключ идемпотентности — ДО шага «пересечение» (D37, закрыто в #81):
        // повтор возвращает старую Бронь со СТАРЫМ именем; имя не обновляется
        // и ошибкой не считается, created_at не переписывается.
        var repeated = bookingRepository
                .findByEventTypeIdAndStartDtAndGuestEmail(eventType.getId(), start, guestEmail);
        if (repeated.isPresent()) {
            return bookingMapper.toModel(repeated.get());
        }

        Booking booking = new Booking(UUID.randomUUID(), eventType.getId(), start, end,
                guestName, guestEmail, now);

        // Шаг 5 — пересечение: предпроверка кодом (последний рубеж не отменяет
        // обязательность проверки в коде, см. комментарий к схеме), затем INSERT
        // и явный flush: без flush база возразит на commit, за пределами правил.
        if (mode == Mode.NORMAL
                && !bookingRepository.findOverlapping(eventType.getId(), start, end).isEmpty()) {
            throw new Refusal(Refusal.Kind.SLOT_TAKEN);
        }

        try {
            entityManager.persist(booking);
            if (mode != Mode.RACE_WITHOUT_FLUSH) {
                entityManager.flush();
            }
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

        return bookingMapper.toModel(booking);
    }
}
