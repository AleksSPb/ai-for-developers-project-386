package com.hexlet.calendar.web;

import com.hexlet.calendar.api.model.CreateBookingRequest;
import com.hexlet.calendar.service.BookingService;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

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

  /** Слой правил записи; репозитория и сущностей контроллер не знает. */
  public BookingController(BookingService bookingService) {
    this.bookingService = bookingService;
  }

  /**
   * Запись Гостя на Слот; пять шагов проверки — в сервисе (D32).
   *
   * <p>Повтор по ключу идемпотентности вернёт ту же Бронь и тот же статус (D37).
   */
  @PostMapping("/bookings")
  public ResponseEntity<com.hexlet.calendar.api.model.Booking> create(
      @Valid @RequestBody CreateBookingRequest request) {

    return ResponseEntity.status(HttpStatus.CREATED).body(bookingService.create(request));
  }

  /**
   * Все Брони по возрастанию начала, без параметров (D30).
   *
   * <p>Правил здесь нет и быть не должно: чтение списка не отказывает, а
   * порядок и пагинация — снаружи этого метода (см. сервис).
   */
  @GetMapping("/bookings")
  public List<com.hexlet.calendar.api.model.Booking> list() {
    return bookingService.list();
  }
}
