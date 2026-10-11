package com.hexlet.calendar.repository;

import com.hexlet.calendar.jpa.EventType;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/**
 * Типы событий: чтение (D14).
 *
 * <p>Единственный запрос со счётчиком Броней лежит здесь, а не в сервисе: счётчик
 * нельзя получить «по Типу» — на списке это N+1, ровно то, что запрещает D31.
 */
public interface EventTypeRepository extends JpaRepository<EventType, String> {

  /**
   * Типы вместе со счётчиком их Броней — одним запросом (D31).
   *
   * <p>{@code LEFT JOIN} и группировка дают Тип без Броней в ответе тоже, со
   * счётчиком ноль: {@code count} считает не-null, а у несошедшейся строки он
   * равен нулю, а не {@code null}. Внутренний {@code JOIN} отсёк бы такие Типы
   * из списка, и Владелец увидел бы не «ноль броней», а «типа нет».
   *
   * <p>Все Брони, включая прошедшие: счётчик отвечает на вопрос «сколько
   * заведено за всё время», а «сколько впереди» — вопрос страницы встреч.
   *
   * <p>Один метод на оба ответа — список и чтение одного Типа (D31). Параметр
   * {@code id} может быть {@code null}, и тогда условие не срабатывает вовсе:
   * два почти одинаковых запроса разъехались бы текстом, а счётчик обязан
   * считаться одинаково.
   */
  @Query(
      """
      select t as type, count(b) as total
      from EventType t
      left join Booking b on b.eventTypeId = t.id
      where (:id is null or t.id = :id)
      group by t
      """)
  List<TypeWithBookingCount> findAllWithBookingCounts(@Param("id") String id);

  /**
   * Строка ответа: Тип события и число его Броней.
   *
   * <p>Проекция, а не {@code List<Object[]>}: разбирать два числа по позициям
   * значило бы взять порядок колонок из SQL и держать его в сервисе.
   */
  interface TypeWithBookingCount {

    /** Тип события целиком, как лежит в {@code event_types}. */
    EventType getType();

    /** Число Броней этого Типа за всё время, включая прошедшие. */
    long getTotal();
  }
}