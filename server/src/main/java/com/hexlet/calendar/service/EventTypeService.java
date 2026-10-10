package com.hexlet.calendar.service;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.hexlet.calendar.api.model.CreateEventTypeRequest;
import com.hexlet.calendar.api.model.EventTypeSummary;
import com.hexlet.calendar.jpa.EventType;
import com.hexlet.calendar.mapping.EventTypeMapper;
import com.hexlet.calendar.refusal.Refusal;
import com.hexlet.calendar.repository.EventTypeRepository;

import jakarta.persistence.EntityManager;

/**
 * Правила Типа события: идемпотентность и «кратно 15» (D28, D42).
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

    @Transactional
    public EventTypeSummary create(CreateEventTypeRequest request) {

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
        var existing = eventTypeRepository.findById(request.getId());
        if (existing.isPresent()) {
            if (existing.get().sameContent(name, description, duration)) {
                return toSummary(existing.get());
            }
            throw new Refusal(Refusal.Kind.EVENT_TYPE_EXISTS);
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
        // bookingCount пока всегда ноль: счётчик требует одного сгруппированного
        // запроса на все ответы (D31), это задача реализации. Маппер принимает
        // счётчик параметром: сам он репозиторий не дёргает — иначе «слой без
        // базы» лжёт.
        return eventTypeMapper.toSummary(type, 0);
    }
}
