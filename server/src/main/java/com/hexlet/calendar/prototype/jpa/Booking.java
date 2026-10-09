package com.hexlet.calendar.prototype.jpa;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * ПРОТОТИП (#83). Сущность брони, таблица {@code bookings} (D15).
 *
 * <p>Неочевидное место раскладки: у сущности PK назначает приложение
 * ({@code uuid}, без {@code @GeneratedValue}), и из-за этого {@code save()}
 * Spring Data считает её «существующей» — merge делает SELECT перед INSERT,
 * лишним запросом размывая окно гонки. Поэтому запись в слой правил идёт через
 * {@code EntityManager.persist} (всегда INSERT), а {@code repository} — только
 * чтение. Продакшену стоит об этом помнить, а не проверять на merge.
 */
@Entity
@Table(name = "bookings")
public class Booking {

    @Id
    @Column(columnDefinition = "uuid")
    private UUID id;

    @Column(name = "event_type_id", nullable = false, length = 40)
    private String eventTypeId;

    @Column(name = "start_dt", nullable = false)
    private Instant startDt;

    @Column(name = "end_dt", nullable = false)
    private Instant endDt;

    @Column(name = "guest_name", nullable = false, length = 100)
    private String guestName;

    @Column(name = "guest_email", nullable = false, length = 254)
    private String guestEmail;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Booking() {
    }

    public Booking(UUID id, String eventTypeId, Instant startDt, Instant endDt,
                   String guestName, String guestEmail, Instant createdAt) {

        this.id = id;
        this.eventTypeId = eventTypeId;
        this.startDt = startDt;
        this.endDt = endDt;
        this.guestName = guestName;
        this.guestEmail = guestEmail;
        this.createdAt = createdAt;
    }

    public UUID getId() {
        return id;
    }

    public String getEventTypeId() {
        return eventTypeId;
    }

    public Instant getStartDt() {
        return startDt;
    }

    public Instant getEndDt() {
        return endDt;
    }

    public String getGuestName() {
        return guestName;
    }

    public String getGuestEmail() {
        return guestEmail;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
