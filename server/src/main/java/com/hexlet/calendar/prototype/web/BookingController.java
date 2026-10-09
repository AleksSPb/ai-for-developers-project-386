package com.hexlet.calendar.prototype.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.hexlet.calendar.api.model.CreateBookingRequest;
import com.hexlet.calendar.prototype.service.BookingService;

import jakarta.validation.Valid;

/**
 * ПРОТОТИП (#83). Контроллер записи.
 *
 * <p>Что видит соседний слой — весь контроллер: принять модель (аннотации
 * {@code @Size/@NotNull/@Email} из {@code api.model} отрабатывают на {@code @Valid},
 * D40), позвать сервис, обернуть результат в статус. Ни репозитория, ни сущности,
 * ни порядка проверок. Ни одного {@code if} про слоты.
 *
 * <p>Параметры {@code race} и {@code flush} — прототипные ручки, их нет в контракте:
 * они включают режимы сервиса, чтобы показать, где именно ловится ограничение
 * базы и что бывает без явного flush. Боевой вызов — {@code POST /bookings} без
 * параметров.
 */
@RestController
public class BookingController {

    private final BookingService bookingService;

    public BookingController(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    @PostMapping("/bookings")
    public ResponseEntity<com.hexlet.calendar.api.model.Booking> create(
            @Valid @RequestBody CreateBookingRequest request,
            @RequestParam(defaultValue = "false") boolean race,
            @RequestParam(defaultValue = "true") boolean flush) {

        BookingService.Mode mode =
                !race ? BookingService.Mode.NORMAL
                        : flush ? BookingService.Mode.RACE_WITH_FLUSH
                                : BookingService.Mode.RACE_WITHOUT_FLUSH;

        return ResponseEntity.status(HttpStatus.CREATED).body(bookingService.create(request, mode));
    }
}
