package com.hexlet.calendar.web;

import com.hexlet.calendar.api.model.AvailabilityWindowList;
import com.hexlet.calendar.api.model.CreateEventTypeRequest;
import com.hexlet.calendar.api.model.EventTypeList;
import com.hexlet.calendar.api.model.EventTypeSummary;
import com.hexlet.calendar.api.model.UpdateEventTypeRequest;
import com.hexlet.calendar.service.EventTypeService;
import com.hexlet.calendar.service.WindowService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
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

  /** Типы для гостевого выбора и раздела Владельца; счётчик — из базы (D31). */
  @GetMapping("/event-types")
  public EventTypeList eventTypes() {
    return eventTypeService.list();
  }

  /**
   * Один Тип по идентификатору; нет такого — 404 event_type_not_found.
   *
   * <p>Тот же {@code EventTypeSummary}, что и в списке и в правке: у Типа не
   * должно быть трёх представлений, иначе расхождение обнаружилось бы поздно,
   * на данных.
   */
  @GetMapping("/event-types/{id}")
  public EventTypeSummary eventType(@PathVariable String id) {
    return eventTypeService.get(id);
  }

  /**
   * Переименование Типа: меняются название и описание (D29).
   *
   * <p>Поля тела обязательны, и проверяет их аннотация модели на {@code @Valid};
   * контроллер про обязательность не знает, как и про то, что длительность
   * здесь не меняется.
   */
  @PatchMapping("/event-types/{id}")
  public EventTypeSummary renameEventType(
      @PathVariable String id, @Valid @RequestBody UpdateEventTypeRequest request) {

    return eventTypeService.update(id, request);
  }
}
