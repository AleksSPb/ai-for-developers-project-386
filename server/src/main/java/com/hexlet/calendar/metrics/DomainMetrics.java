package com.hexlet.calendar.metrics;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

/**
 * Счётчики успешных операций домена (D62).
 *
 * <p>HTTP-метрики actuator'а отвечают на вопрос «как сервер отвечает», а этот
 * компонент — на вопрос «сколько записей и типов событий в нём появилось». Второй
 * вопрос actuator не закрывает: {@code http.server.requests} посчитает и запросы,
 * которым отказали, и идемпотентные повторы, создавшие ноль строк.
 *
 * <p>Счётчики заводятся один раз в конструкторе, а не на каждый вызов: Micrometer
 * возвращает зарегистрированный счётчик при повторной регистрации того же имени, и
 * инкремент поверх нового объекта просто потерялся бы. Имя метрики — константа в
 * коде, потому что список счётчиков и есть то, что обещано наблюдать; собирать
 * имена из названий операций значило бы переименовать метрику вместе с методом.
 *
 * <p>Теговов нет намеренно: у каждой метрики один смысл, вариантов значения не
 * требуется. Тег «успешно/неуспешно» завёл бы вторую, невыполнимую половину —
 * считать отказы здесь нечем, а выдавать {@code 0} за честное число нельзя.
 *
 * <p>Инкремент живёт в единственной точке, где операция действительно совершена
 * (в сервисе), а не здесь: «счётчик вырос» значит «строка легла в базу», и
 * идемпотентный повтор (D28, D37) повторно её не создаёт, поэтому не считается.
 */
@Component
public class DomainMetrics {

  /** Счётчик заведённых Броней; растёт только на реально вставленной строке. */
  private final Counter bookingsCreated;

  /** Счётчик заведённых Типов событий; идемпотентный повтор (D28) не считается. */
  private final Counter eventTypesCreated;

  /** Счётчик переименований Типа события: считает вызовы, а не различия в данных. */
  private final Counter eventTypesUpdated;

  /**
   * Регистрирует три счётчика в реестре Micrometer.
   *
   * @param meterRegistry реестр, который приложению поставляет Boot (по умолчанию
   *     SimpleMeterRegistry — внешний сервис сбора не требуется)
   */
  public DomainMetrics(MeterRegistry meterRegistry) {
    this.bookingsCreated = Counter.builder("booking.created").register(meterRegistry);
    this.eventTypesCreated = Counter.builder("event_type.created").register(meterRegistry);
    this.eventTypesUpdated = Counter.builder("event_type.updated").register(meterRegistry);
  }

  /** Учитывает одну записанную Броню — после успешного flush, до ответа гостю. */
  public void bookingCreated() {
    bookingsCreated.increment();
  }

  /** Учитывает один заведённый Тип события — после persist и flush. */
  public void eventTypeCreated() {
    eventTypesCreated.increment();
  }

  /** Учитывает одно переименование Типа события, включая вызов с теми же полями. */
  public void eventTypeUpdated() {
    eventTypesUpdated.increment();
  }
}
