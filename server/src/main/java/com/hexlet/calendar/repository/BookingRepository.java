package com.hexlet.calendar.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import com.hexlet.calendar.jpa.Booking;

/**
 * Брони: только чтение (D15).
 *
 * <p>Запись здесь отсутствует сознательно: PK {@code uuid} назначает приложение,
 * и {@code save()} на такой сущности делает merge (SELECT перед INSERT), а
 * нужно — всегда INSERT, чтобы отказ дал именно пересечение, а не потерянный
 * дубль. Пишет броню слой правил через {@code EntityManager.persist}.
 */
public interface BookingRepository extends JpaRepository<Booking, java.util.UUID> {

    /** Ключ идемпотентности Брони: тип + начало + почта, имя не входит (D37). */
    Optional<Booking> findByEventTypeIdAndStartDtAndGuestEmail(
            String eventTypeId, Instant startDt, String guestEmail);

    /**
     * Пересечение полуоткрытых интервалов {@code [)} — та же формула, что у
     * {@code EXCLUDE USING gist} в базе (D17), но это только предпроверка:
     * последний рубеж — база, а не этот запрос.
     */
    @Query("""
            select b from Booking b
            where b.eventTypeId = :eventTypeId and b.startDt < :end and b.endDt > :start
            """)
    List<Booking> findOverlapping(@Param("eventTypeId") String eventTypeId,
                                  @Param("start") Instant start,
                                  @Param("end") Instant end);
}
