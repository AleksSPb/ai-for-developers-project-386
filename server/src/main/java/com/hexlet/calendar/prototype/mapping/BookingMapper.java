package com.hexlet.calendar.prototype.mapping;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.springframework.stereotype.Component;

import com.hexlet.calendar.api.model.TimeRange;

/**
 * ПРОТОТИП (#83). Бронь → модель контракта.
 *
 * <p>Маппер — единственное место раскладки, где сущность {@code prototype.jpa.Booking}
 * и модель {@code api.model.Booking} существуют одновременно, и они ОДНОИМЕННЫЕ:
 * генератор отдал имя домену (D9 — модели порождаются, сущности пишутся руками,
 * переименовать нельзя ни то ни другое). Платить полным именем того, кто в этом
 * файле не хозяин: здесь хозяин модель контракта, а сущность проходит по FQN в
 * сигнатуре. Тот же счёт лежит и в сервисе — и платить им должен именно сервис
 * с маппером, а не контроллер: контроллер сущности не видит вовсе.
 */
@Component
public class BookingMapper {

    public com.hexlet.calendar.api.model.Booking toModel(
            com.hexlet.calendar.prototype.jpa.Booking booking) {

        TimeRange range = new TimeRange();
        range.setStart(OffsetDateTime.ofInstant(booking.getStartDt(), ZoneOffset.UTC));
        range.setEnd(OffsetDateTime.ofInstant(booking.getEndDt(), ZoneOffset.UTC));

        com.hexlet.calendar.api.model.Booking model = new com.hexlet.calendar.api.model.Booking();
        model.setId(booking.getId().toString());
        model.setEventTypeId(booking.getEventTypeId());
        model.setTimeRange(range);
        model.setGuestName(booking.getGuestName());
        model.setGuestEmail(booking.getGuestEmail());
        model.setCreatedAt(OffsetDateTime.ofInstant(booking.getCreatedAt(), ZoneOffset.UTC));
        return model;
    }
}
