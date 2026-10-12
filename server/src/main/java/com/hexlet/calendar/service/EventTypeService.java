package com.hexlet.calendar.service;

import com.hexlet.calendar.api.model.CreateEventTypeRequest;
import com.hexlet.calendar.api.model.EventTypeList;
import com.hexlet.calendar.api.model.EventTypeSummary;
import com.hexlet.calendar.api.model.UpdateEventTypeRequest;
import com.hexlet.calendar.jpa.EventType;
import com.hexlet.calendar.mapping.EventTypeMapper;
import com.hexlet.calendar.metrics.DomainMetrics;
import com.hexlet.calendar.refusal.Refusal;
import com.hexlet.calendar.repository.EventTypeRepository;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Правила Типа события: идемпотентность и «кратно 15» (D28, D42).
 *
 * <p>Второй показателяльный случай стенки «правило / код отказа»: PK
 * {@code event_types_pkey} читается здесь тем же {@link Integrity}, что и
 * {@code bookings_no_overlap}. Предпроверка {@code findById} штатный повтор
 * закрывает ДО базы; база ловит гонку двух Владельцев с одним слагом — и без
 * явного flush это произошло бы уже после выхода правил, то есть стало бы 500.
 */
@Service
public class EventTypeService {

  private static final int STEP_MINUTES = 15;

  private final EventTypeRepository eventTypeRepository;
  private final EventTypeMapper eventTypeMapper;
  private final EntityManager entityManager;
  private final DomainMetrics metrics;

  /**
   * Репозиторий, маппер, менеджер сущностей и счётчики (D62) — всё, что нужно
   * D28, D29, D31 и D42.
   *
   * <p>Репозитория Броней здесь нет вовсе, и это не упущение: счётчик приходит
   * вместе с Типом из одного запроса (D31), а не отдельным — слать его за
   * пределы Типа было бы лишней связью слоя правил с чужим хранилищем.
   */
  public EventTypeService(
      EventTypeRepository eventTypeRepository,
      EventTypeMapper eventTypeMapper,
      EntityManager entityManager,
      DomainMetrics metrics) {

    this.eventTypeRepository = eventTypeRepository;
    this.eventTypeMapper = eventTypeMapper;
    this.entityManager = entityManager;
    this.metrics = metrics;
  }

  /**
   * Заводит Тип события; кратность 15 и идемпотентность — по описанию класса (D28, D42).
   *
   * <p>Повтор с тем же набором полей возвращает существующий Тип, любое
   * расхождение — отказ {@code event_type_exists}.
   */
  @Transactional
  public EventTypeSummary create(CreateEventTypeRequest request) {

    String name = request.getName().trim();
    String description = request.getDescription().trim();
    int duration = request.getDurationMinutes();

    // Кратность 15 — единственное правило, которого нет в OpenAPI 3.0 (D42):
    // в аннотациях модели его не будет, оно ручное и живёт в слое правил.
    if (duration % STEP_MINUTES != 0) {
      throw new Refusal(Refusal.Kind.VALIDATION_FAILED, List.of("durationMinutes"));
    }

    // Идемпотентность по полному набору полей (D28): полное совпадение —
    // успех со старым Типом, любое расхождение — 409 event_type_exists.
    var existing = findWithCounts(request.getId());
    if (existing.isPresent()) {
      if (existing.get().getType().sameContent(name, description, duration)) {
        // Счётчик повтора — из базы (D28): Брони на этот Тип могли завести
        // между первой попыткой и повторной, и «всегда ноль» соврал бы Владельцу.
        return toSummary(existing.get());
      }
      throw new Refusal(Refusal.Kind.EVENT_TYPE_EXISTS);
    }

    EventType created;
    try {
      created = new EventType(request.getId(), name, description, duration);
      entityManager.persist(created);
      entityManager.flush();
    } catch (RuntimeException ex) {
      // Тип исключения — по наблюдению #83 — не один класс на все пути
      // (см. Integrity), поэтому разбор по имени ограничения идёт по цепочке.
      Refusal refusal = Integrity.refusalOf(ex);
      if (refusal == null) {
        throw ex;
      }
      throw refusal;
    }

    // Повторно Тип из базы НЕ вычитывается: persist сделал его управляемым, а
    // flush кладёт строку в таблицу до выхода из этого метода. Вторая выборка
    // читала бы то же самое, что уже лежит в переменной created, — то есть
    // платила бы ещё одним обходом таблицы за единственный уже сделанный INSERT.
    //
    // Счётчик успешных заведений (D62) — после persist и flush, где строка
    // действительно легла в базу. Идемпотентный повтор (D28) вернулся выше и
    // сюда не доходит: он ничего не создавал.
    metrics.eventTypeCreated();

    // Счётчик Броней у только что заведённого Типа — ноль по построению: Бронь
    // ссылается на Тип внешним ключом, а Типа, на который можно сослаться, до
    // этого запроса не существовало.
    return eventTypeMapper.toSummary(created, 0L);
  }

  /**
   * Типы для гостевого выбора и раздела Владельца — плоским списком (D31).
   *
   * <p>Порядок не задан и не обещан: контракт его не объявляет, а выдумывать
   * устойчивый порядок ценой второй сортировки здесь нечего.
   *
   * <p>Счётчики приходят вместе с Типами из одного запроса — ни отдельного
   * запроса за счётчиками, ни запроса на Тип (D31). На списке из двадцати Типов
   * база видит один обход, а не двадцать один.
   */
  @Transactional(readOnly = true)
  public EventTypeList list() {

    List<EventTypeSummary> types =
        eventTypeRepository.findAllWithBookingCounts(null).stream()
            .map(row -> toSummary(row))
            .toList();

    EventTypeList response = new EventTypeList();
    response.setTypes(types);
    return response;
  }

  /**
   * Один Тип по идентификатору; нет такого — 404 event_type_not_found.
   *
   * <p>Отказ тот же, что у {@code POST /bookings}, и бросается оттуда же: двух
   * кодов «Типа нет» у модели быть не может, иначе клиенту пришлось бы различать
   * их на глаз.
   *
   * <p>Это тот же запрос, что и в списке, только с идентификатором (D31): один и
   * тот же счётчик обязан давать одно и то же число в обоих ответах, а разными
   * запросами это рано или поздно перестало бы быть правдой.
   */
  @Transactional(readOnly = true)
  public EventTypeSummary get(String id) {

    return toSummary(
        findWithCounts(id).orElseThrow(() -> new Refusal(Refusal.Kind.EVENT_TYPE_NOT_FOUND)));
  }

  /**
   * Переименование Типа: название и описание, оба обязательны (D29).
   *
   * <p>Длительность и идентификатор здесь не меняются и не приходят телом —
   * так и задумано (ADR-0005): длительность задаётся один раз, а идентификатор
   * попадает в гостевую ссылку, и смена обоих сделала бы старые ссылки
   * мёртвыми. Явного {@code flush} нет: нарушить тут нечего, констрейнт на
   * переименование не существует, а значения полей не выходят за границы,
   * которые @Valid проверил ещё до сервиса.
   */
  @Transactional
  public EventTypeSummary update(String id, UpdateEventTypeRequest request) {

    // Типа нет — 404 event_type_not_found, тем же отказом, что и у чтения.
    var row =
        findWithCounts(id).orElseThrow(() -> new Refusal(Refusal.Kind.EVENT_TYPE_NOT_FOUND));

    // Нормализация та же, что при заведении (D43): хвостовой пробел в названии
    // не должен становиться частью названия, которое увидит Гость.
    row.getType().rename(request.getName().trim(), request.getDescription().trim());

    // Счётчик переименований (D62) считает вызовы, а не различия в данных:
    // вызов с теми же значениями полей — тоже успешный вызов, и его отсутствие
    // в счётчике сделало бы число зависящим от того, как именно гость нажал
    // «сохранить».
    metrics.eventTypeUpdated();

    return toSummary(row);
  }

  /**
   * Тип со счётчиком по идентификатору; пусто — такого Типа нет.
   *
   * <p>Тот же один запрос, что у списка, с идентификатором вместо {@code null}.
   */
  private Optional<EventTypeRepository.TypeWithBookingCount> findWithCounts(String id) {
    return eventTypeRepository.findAllWithBookingCounts(id).stream().findFirst();
  }

  /**
   * Строка ответа → сводка; маппер тот же, что у заведения и правки (D31).
   *
   * <p>Счётчик приходит из строки, а не считается здесь: единственное место,
   * где счётчик берётся из базы, — репозиторий.
   */
  private EventTypeSummary toSummary(EventTypeRepository.TypeWithBookingCount row) {
    return eventTypeMapper.toSummary(row.getType(), row.getTotal());
  }
}
