package com.hexlet.calendar.service;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.hexlet.calendar.api.model.AvailabilityWindowList;
import com.hexlet.calendar.api.model.TimeRange;
import com.hexlet.calendar.jpa.Window;
import com.hexlet.calendar.mapping.WindowMapper;
import com.hexlet.calendar.repository.WindowRepository;

/**
 * Чтение окон приёма: живой фильтр и округление (D24/D25).
 *
 * <p>Здесь видно второй неочевидный шов: «сейчас» для запроса берётся из
 * {@link Clock} (D21), а не из базы, и ЗОНА округления — константа проекта
 * (ADR-0008), а не часовой пояс JVM и не серверное {@code now()} базы. Три
 * разных «текущего момента» в одном методе — ровно то, что плоская раскладка
 * прячет, а слоистая показывает именами переменных.
 */
@Service
public class WindowService {

    /** Зона константы: окна материализованы в Мск, живое окно округляется по Мск. */
    private static final ZoneId MOSCOW = ZoneId.of("Europe/Moscow");

    private final Clock clock;
    private final WindowRepository windowRepository;
    private final WindowMapper windowMapper;

    public WindowService(Clock clock, WindowRepository windowRepository, WindowMapper windowMapper) {
        this.clock = clock;
        this.windowRepository = windowRepository;
        this.windowMapper = windowMapper;
    }

    @Transactional(readOnly = true)
    public AvailabilityWindowList list() {
        Instant now = clock.instant();
        List<TimeRange> result = new ArrayList<>();

        for (Window window : windowRepository.findByEndDtAfterOrderByStartDtAsc(now)) {
            Instant start = window.getStartDt();

            // Живое окно: начало поднимается до целого часа (D24). Окно,
            // которое после подъёма перестало что-то вмещать, не возвращается.
            if (start.isBefore(now)) {
                ZonedDateTime ceiled = ZonedDateTime.ofInstant(now, MOSCOW)
                        .truncatedTo(ChronoUnit.HOURS);
                if (!ceiled.toInstant().equals(now)) {
                    ceiled = ceiled.plusHours(1);
                }
                start = ceiled.toInstant();
            }

            if (start.isBefore(window.getEndDt())) {
                TimeRange range = windowMapper.toModel(window);
                range.setStart(java.time.OffsetDateTime.ofInstant(start, java.time.ZoneOffset.UTC));
                result.add(range);
            }
        }

        AvailabilityWindowList response = new AvailabilityWindowList();
        response.setWindows(result);
        return response;
    }
}
