package com.hexlet.calendar.mapping;

import com.hexlet.calendar.api.model.EventTypeSummary;
import com.hexlet.calendar.jpa.EventType;
import org.springframework.stereotype.Component;

/**
 * Тип события → сводка со счётчиком Броней.
 *
 * <p>{@code bookingCount} — отдельным параметром, а не полем сущности: счётчик
 * считает один сгруппированный запрос (D31), и маппер не должен незаметно
 * дёргать репозиторий — иначе «слой без базы» перестаёт быть правдой.
 */
@Component
public class EventTypeMapper {

  public EventTypeSummary toSummary(EventType type, int bookingCount) {
    EventTypeSummary summary = new EventTypeSummary();
    summary.setId(type.getId());
    summary.setName(type.getName());
    summary.setDescription(type.getDescription());
    summary.setDurationMinutes(type.getDurationMinutes());
    summary.setBookingCount(bookingCount);
    return summary;
  }
}
