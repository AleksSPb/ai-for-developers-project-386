package com.hexlet.calendar.prototype.mapping;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import org.springframework.stereotype.Component;

import com.hexlet.calendar.api.model.TimeRange;
import com.hexlet.calendar.prototype.jpa.Window;

/**
 * ПРОТОТИП (#83). Окно приёма → пара моментов из контракта.
 *
 * <p>Окно наружу — это {@code TimeRange} (список окон в контракте устроен так),
 * момент отдаётся в UTC: {@code hibernate.jdbc.time_zone=UTC} уже гарантирует, что
 * прочитанное — UTC, а не зона машины.
 */
@Component
public class WindowMapper {

    public TimeRange toModel(Window window) {
        TimeRange range = new TimeRange();
        range.setStart(OffsetDateTime.ofInstant(window.getStartDt(), ZoneOffset.UTC));
        range.setEnd(OffsetDateTime.ofInstant(window.getEndDt(), ZoneOffset.UTC));
        return range;
    }
}
