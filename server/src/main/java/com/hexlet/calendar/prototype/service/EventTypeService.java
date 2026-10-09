package com.hexlet.calendar.prototype.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.hexlet.calendar.api.model.CreateEventTypeRequest;
import com.hexlet.calendar.api.model.EventTypeSummary;
import com.hexlet.calendar.prototype.jpa.EventType;
import com.hexlet.calendar.prototype.mapping.EventTypeMapper;
import com.hexlet.calendar.prototype.refusal.Refusal;
import com.hexlet.calendar.prototype.repository.EventTypeRepository;

import jakarta.persistence.EntityManager;

/**
 * ПРОТОТИП (#83). Правила Типа события: идемпотентность и «кратно 15» (D28, D42).
 *
 * <p>Второй показателяльный случай стенки «правило / код отказа»: PK
 * {@code event_types_pkey} читается здесь тем же {@link Integrity}, что и
 * {@code bookings_no_overlap}. Предпроверка {@code findById} штатный повтор
 * закрывает ДО базы; база ловит гонку двух Владельцев с одним слагом — и без
 * явного flush это произошло бы уже после выхода правил, то есть стало бы 500.
 */
@Service
public class EventTypeService {

    private static final int STEP_MINUTES = 15;

    private final EventTypeRepository eventTypeRepository;
    private final EventTypeMapper eventTypeMapper;
    private final EntityManager entityManager;

    public EventTypeService(EventTypeRepository eventTypeRepository,
                            EventTypeMapper eventTypeMapper,
                            EntityManager entityManager) {

        this.eventTypeRepository = eventTypeRepository;
        this.eventTypeMapper = eventTypeMapper;
        this.entityManager = entityManager;
    }

    /** Режимы: NORMAL — боевой путь; RACE пропускает предпроверку (см. BookingService). */
    public enum Mode {
        NORMAL,
        RACE,
    }

    @Transactional
    public EventTypeSummary create(CreateEventTypeRequest request, Mode mode) {

        String name = request.getName().trim();
        String description = request.getDescription().trim();
        int duration = request.getDurationMinutes();

        // Кратность 15 — единственное правило, которого нет в OpenAPI 3.0 (D42):
        // в аннотациях модели его не будет, оно ручное и живёт в слое правил.
        if (duration % STEP_MINUTES != 0) {
            throw new Refusal(Refusal.Kind.VALIDATION_FAILED, List.of("durationMinutes"));
        }

        // Идемпотентность по полному набору полей (D28): полное совпадение —
        // успех со старым Типом, любое расхождение — 409 event_type_exists.
        if (mode == Mode.NORMAL) {
            var existing = eventTypeRepository.findById(request.getId());
            if (existing.isPresent()) {
                if (existing.get().sameContent(name, description, duration)) {
                    return toSummary(existing.get());
                }
                throw new Refusal(Refusal.Kind.EVENT_TYPE_EXISTS);
            }
        }

        try {
            entityManager.persist(new EventType(request.getId(), name, description, duration));
            entityManager.flush();
        } catch (RuntimeException ex) {
            // Тип исключения — по наблюдению #83 — не один класс на все пути
            // (см. Integrity), поэтому разбор по имени ограничения идёт по цепочке.
            Refusal refusal = Integrity.refusalOf(ex);
            if (refusal == null) {
                throw ex;
            }
            throw refusal;
        }

        return toSummary(eventTypeRepository.findById(request.getId()).orElseThrow());
    }

    private EventTypeSummary toSummary(EventType type) {
        // bookingCount в прототипе не строится: боевой путь — один
        // сгруппированный запрос на все ответы (D31), это задача реализации,
        // а не вопрос о границах слоёв. Маппер принимает счётчик параметром:
        // сам он репозиторий не дёргает — иначе «слой без базы» лжёт.
        return eventTypeMapper.toSummary(type, 0);
    }
}
