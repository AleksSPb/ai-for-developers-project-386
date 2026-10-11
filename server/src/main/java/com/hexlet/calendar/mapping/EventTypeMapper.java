package com.hexlet.calendar.mapping;

import com.hexlet.calendar.api.model.EventTypeSummary;
import com.hexlet.calendar.jpa.EventType;
import org.springframework.stereotype.Component;

/**
 * Тип события → сводка со счётчиком Броней.
 *
 * <p>{@code bookingCount} — отдельным параметром, а не полем сущности: счётчик
 * приходит из запроса вместе с Типом (D31), и маппер не должен незаметно
 * дёргать репозиторий — иначе «слой без базы» перестаёт быть правдой.
 *
 * <p>Счётчик приходит {@code long}, как его отдаёт {@code count()} в SQL, а в
 * контракте поле {@code int32}. Приведение — здесь, единственное место: молча
 * обрезать число нельзя, а {@code Math.toIntExact} на невозможном значении
 * падает наружу как 500, а не как тихий счётчик со сдвигом.
 */
@Component
public class EventTypeMapper {

  /** Собирает сводку Типа; счётчик Броней приходит снаружи — см. описание класса. */
  public EventTypeSummary toSummary(EventType type, long bookingCount) {
    EventTypeSummary summary = new EventTypeSummary();
    summary.setId(type.getId());
    summary.setName(type.getName());
    summary.setDescription(type.getDescription());
    summary.setDurationMinutes(type.getDurationMinutes());
    summary.setBookingCount(Math.toIntExact(bookingCount));
    return summary;
  }
}
