package com.hexlet.calendar.web;

import com.hexlet.calendar.api.model.AvailabilityWindowList;
import com.hexlet.calendar.api.model.CreateEventTypeRequest;
import com.hexlet.calendar.api.model.EventTypeSummary;
import com.hexlet.calendar.service.EventTypeService;
import com.hexlet.calendar.service.WindowService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Окна приёма и Типы событий: те же две строки, что и у брони —
 * валидация аннотациями, вызов сервиса, статус ответа.
 */
@RestController
public class WindowAndEventTypeController {

  private final WindowService windowService;
  private final EventTypeService eventTypeService;

  /** Сервисы окон и Типов; правил и сущностей контроллер не знает. */
  public WindowAndEventTypeController(
      WindowService windowService, EventTypeService eventTypeService) {
    this.windowService = windowService;
    this.eventTypeService = eventTypeService;
  }

  /** Список окон приёма; живой фильтр и округление живут в сервисе (D24/D25). */
  @GetMapping("/windows")
  public AvailabilityWindowList windows() {
    return windowService.list();
  }

  /**
   * Завод Типа события; повтор с тем же набором полей вернёт старый Тип (D28).
   *
   * <p>Пять шагов проверки здесь нет и быть не должно — см. описание класса.
   */
  @PostMapping("/event-types")
  public ResponseEntity<EventTypeSummary> createEventType(
      @Valid @RequestBody CreateEventTypeRequest request) {

    return ResponseEntity.status(HttpStatus.CREATED).body(eventTypeService.create(request));
  }
}
