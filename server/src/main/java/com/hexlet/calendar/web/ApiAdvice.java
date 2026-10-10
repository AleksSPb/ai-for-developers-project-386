package com.hexlet.calendar.web;

import java.util.List;

import org.springframework.dao.CleanupFailureDataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.dao.TransientDataAccessResourceException;
import org.springframework.dao.UncategorizedDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.hexlet.calendar.api.model.EventTypeExistsError;
import com.hexlet.calendar.api.model.EventTypeNotFoundError;
import com.hexlet.calendar.api.model.ServiceUnavailableError;
import com.hexlet.calendar.api.model.SlotNotFoundError;
import com.hexlet.calendar.api.model.SlotTakenError;
import com.hexlet.calendar.api.model.TimeNotBookableError;
import com.hexlet.calendar.api.model.ValidationError;
import com.hexlet.calendar.refusal.Refusal;

/**
 * Рендер отказа и белый список недоступности (D38).
 *
 * <p>Перевод «kind → статус» живёт здесь, а не в сервисе: {@code Refusal.Kind}
 * несёт {@code HttpStatus} как свойство, но тело собирает advice — сервис не
 * знает ни про один класс ответа контракта. SQLException сюда не доходит:
 * имена ограничений разобрал слой правил, пока транзакция была открыта.
 *
 * <p>Обработчика на {@code Exception.class} нет и быть не должно (#82): он
 * отрабатывал бы раньше {@code DefaultHandlerExceptionResolver} и присвоил бы
 * системные 400/404/405. Непойманное добирается до {@code /error}, где тело
 * подменяет {@link ErrorAttributesConfig}.
 */
@RestControllerAdvice
public class ApiAdvice {

    @ExceptionHandler(Refusal.class)
    public ResponseEntity<Object> refusal(Refusal refusal) {
        Object body = switch (refusal.kind()) {
            case VALIDATION_FAILED -> new ValidationError()
                    .code(ValidationError.CodeEnum.VALIDATION_FAILED)
                    .message(refusal.kind().message())
                    .fields(refusal.fields());
            case TIME_NOT_BOOKABLE -> new TimeNotBookableError()
                    .code(TimeNotBookableError.CodeEnum.TIME_NOT_BOOKABLE)
                    .message(refusal.kind().message());
            case SLOT_NOT_FOUND -> new SlotNotFoundError()
                    .code(SlotNotFoundError.CodeEnum.SLOT_NOT_FOUND)
                    .message(refusal.kind().message());
            case EVENT_TYPE_NOT_FOUND -> new EventTypeNotFoundError()
                    .code(EventTypeNotFoundError.CodeEnum.EVENT_TYPE_NOT_FOUND)
                    .message(refusal.kind().message());
            case SLOT_TAKEN -> new SlotTakenError()
                    .code(SlotTakenError.CodeEnum.SLOT_TAKEN)
                    .message(refusal.kind().message());
            case EVENT_TYPE_EXISTS -> new EventTypeExistsError()
                    .code(EventTypeExistsError.CodeEnum.EVENT_TYPE_EXISTS)
                    .message(refusal.kind().message());
        };
        return ResponseEntity.status(refusal.kind().status()).body(body);
    }

    /**
     * Форма из аннотаций сгенерированной модели — «бесплатные» {@code fields[]}
     * (D40). Неочевидная деталь границы: вложенные поля приходят путём
     * {@code timeRange.start}, а контракт ждёт имя поля формы — совет берёт
     * верхний сегмент. Ручные правила (кратность, почта) дают то же имя
     * {@code timeRange}/{@code guestEmail} из слоя правил, и гость видит один
     * словарь полей с двух сторон стенки.
     */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ValidationError> invalid(MethodArgumentNotValidException e) {
        List<String> fields = e.getBindingResult().getFieldErrors().stream()
                .map(error -> error.getField().split("\\.")[0])
                .distinct()
                .sorted()
                .toList();

        ValidationError body = new ValidationError()
                .code(ValidationError.CodeEnum.VALIDATION_FAILED)
                .message(Refusal.Kind.VALIDATION_FAILED.message())
                .fields(fields);

        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY).body(body);
    }

    /**
     * Белый список механизмов недоступности (D38, закрыто в #82): 503 — только
     * эти, и никаких супертипов: под {@code DataAccessException} лежит
     * {@code DataIntegrityViolationException}, и широкий перехват превратил бы
     * гонку за слот в 503. Не из этого перечня — 500.
     */
    @ExceptionHandler({
            DataAccessResourceFailureException.class,
            CannotGetJdbcConnectionException.class,
            TransientDataAccessResourceException.class,
            CannotCreateTransactionException.class,
            QueryTimeoutException.class,
            UncategorizedDataAccessException.class,
            CleanupFailureDataAccessException.class,
    })
    public ResponseEntity<ServiceUnavailableError> unavailable(Exception e) {
        ServiceUnavailableError body = new ServiceUnavailableError()
                .code(ServiceUnavailableError.CodeEnum.SERVICE_UNAVAILABLE)
                .message("Сервер временно не может обслужить запрос.");

        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }
}
