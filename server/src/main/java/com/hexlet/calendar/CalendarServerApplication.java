package com.hexlet.calendar;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Сервер бронирования звонков.
 *
 * Пока здесь только точка входа: операции, схема и сид окон заводятся дальше, а
 * локальный запуск (compose, Liquibase) уже работает — база поднимается, схема
 * создаётся миграциями, `ddl-auto=validate` проверяет, что схема совпала.
 *
 * <p>Контекст настроек по умолчанию: {@code src/main/resources/application.yml}.
 * Адреса и пароли приходят из окружения, см. {@code .env.example}.
 */
@SpringBootApplication
public class CalendarServerApplication {

    public static void main(String[] args) {
        SpringApplication.run(CalendarServerApplication.class, args);
    }
}
