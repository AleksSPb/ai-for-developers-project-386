package com.hexlet.calendar.prototype.web;

import java.util.Map;

import org.springframework.boot.web.error.ErrorAttributeOptions;
import org.springframework.boot.webmvc.error.DefaultErrorAttributes;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.WebRequest;

/**
 * ПРОТОТИП (#83). Тело для непойманного (#82): всё неописанное — {@code internal_error}.
 *
 * <p>Здесь стенка показана отсутствием: у advice нет обработчика на
 * {@code Exception.class}, потому что он присвоил бы системные 400/404/405.
 * Непойманное доходит до {@code /error}, и этот bean подменяет стандартный
 * JSON на {@code { code, message }} со статусом, который уже стоит в ответе
 * (500 для всего неописанного). Наследование от дефолтного сохраняет его
 * спецобработку servlet-исключений — переписано ровно тело.
 *
 * <p>Про раскладку это файл-предупреждение: в Spring Boot 4 {@code ErrorAttributes}
 * уехал из {@code spring-boot-autoconfigure} в модуль {@code spring-boot-webmvc}
 * ({@code org.springframework.boot.webmvc.error}) — автоконфигурация теперь
 * нарезана по модулям, и «где лежит дефолт» больше не видно по старым импортам.
 */
@Component
public class ErrorAttributesConfig extends DefaultErrorAttributes {

    @Override
    public Map<String, Object> getErrorAttributes(WebRequest webRequest,
                                                  ErrorAttributeOptions options) {

        return Map.of(
                "code", "internal_error",
                "message", "Сервер не смог выполнить запрос.");
    }
}
