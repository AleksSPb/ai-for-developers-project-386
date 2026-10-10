package com.hexlet.calendar.config;

import java.time.Clock;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Ровно одно «сейчас» на сервер (D21).
 *
 * <p>Наблюдение про границу: {@code Clock} внедряется в СЛОЙ ПРАВИЛ, и только там
 * и читается. Репозиторий часов не знает — «сейчас» доходит до запроса
 * {@code windows} параметром {@code Instant}, который принёс сервис. Из этого
 * следует проверяемая вещь: «начало в прошлом» — это сравнение двух
 * {@code Instant} в сервисе, и оно тестируется без базы (см.
 * {@code RulesWithoutDbTest}). Если бы часы жили в репозитории или запросах
 * ({@code now()} на стороне Postgres), тот же сценарий требовал бы контейнер,
 * а расхождение часов JVM и БД (D22) превратилось бы в плывущий тест.
 */
@Configuration(proxyBeanMethods = false)
public class ClockConfig {

    @Bean
    Clock clock() {
        return Clock.systemUTC();
    }
}
