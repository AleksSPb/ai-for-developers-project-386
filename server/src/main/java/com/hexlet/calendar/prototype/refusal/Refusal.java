package com.hexlet.calendar.prototype.refusal;

import java.util.List;

import org.springframework.http.HttpStatus;

/**
 * ПРОТОТИП (#83). Отказ как тип, а не как HTTP-код.
 *
 * <p>Ответ на вопрос тикета: стенка между правилом и кодом отказа проходит вот
 * здесь — слой правил бросает {@code Refusal} с семантическим kind, и это единственный
 * словарь, который понимают оба соседних слоя. Контроллер и advice не разбирают
 * SQLException и не читают {@code DataAccessException}, а сервис не знает, что
 * {@code slot_taken} — это 409, а не 422: статус живёт в {@code Kind}, рендер —
 * в {@code web}.
 *
 * <p>Плоский вариант (контроллер сам решает, какой код вернуть) это же требование
 * #82 выразить не может: имена ограничений надо успеть прочитать, пока транзакция
 * открыта, то есть внутри слоя правил. Стенка не позиция файлов, а направление
 * зависимостей: {@code web → service → repository}, отказ идёт вверх типом.
 */
public class Refusal extends RuntimeException {

    /** Семантический код отказа; статус и сообщение — его свойства (D39). */
    public enum Kind {

        VALIDATION_FAILED(HttpStatus.UNPROCESSABLE_ENTITY, "В присланных данных есть ошибки."),
        TIME_NOT_BOOKABLE(HttpStatus.UNPROCESSABLE_ENTITY, "Начало слота уже прошло."),
        SLOT_NOT_FOUND(HttpStatus.NOT_FOUND, "Окна приёма с таким слотом нет."),
        EVENT_TYPE_NOT_FOUND(HttpStatus.NOT_FOUND, "Такого типа события нет."),
        SLOT_TAKEN(HttpStatus.CONFLICT, "Этот слот уже занят."),
        EVENT_TYPE_EXISTS(HttpStatus.CONFLICT, "Тип события с таким идентификатором уже есть.");

        private final HttpStatus status;
        private final String message;

        Kind(HttpStatus status, String message) {
            this.status = status;
            this.message = message;
        }

        public HttpStatus status() {
            return status;
        }

        public String message() {
            // Одна константа на код (D39) — текст не сочиняется на месте.
            return message;
        }
    }

    private final Kind kind;
    private final List<String> fields;

    public Refusal(Kind kind) {
        this(kind, List.of());
    }

    public Refusal(Kind kind, List<String> fields) {
        super(kind.message());
        this.kind = kind;
        this.fields = List.copyOf(fields);
    }

    public Kind kind() {
        return kind;
    }

    /** Поля для `validation_failed.fields[]` (D40/D41); у остальных отказов пусто. */
    public List<String> fields() {
        return fields;
    }
}
