package com.hexlet.calendar.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.hexlet.calendar.api.model.CreateBookingRequest;
import com.hexlet.calendar.service.BookingService;

import jakarta.validation.Valid;

/**
 * Контроллер записи.
 *
 * <p>Что видит соседний слой — весь контроллер: принять модель (аннотации
 * {@code @Size/@NotNull/@Email} из {@code api.model} отрабатывают на {@code @Valid},
 * D40), позвать сервис, обернуть результат в статус. Ни репозитория, ни сущности,
 * ни порядка проверок. Ни одного {@code if} про слоты.
 */
@RestController
public class BookingController {

    private final BookingService bookingService;

    public BookingController(BookingService bookingService) {
        this.bookingService = bookingService;
    }

    @PostMapping("/bookings")
    public ResponseEntity<com.hexlet.calendar.api.model.Booking> create(
            @Valid @RequestBody CreateBookingRequest request) {

        return ResponseEntity.status(HttpStatus.CREATED).body(bookingService.create(request));
    }
}