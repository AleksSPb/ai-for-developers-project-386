package com.hexlet.calendar.prototype.jpa;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * ПРОТОТИП (#83). Сущность типа события, таблица {@code event_types} (D14).
 *
 * <p>Идентификатор — слаг владельца, {@code varchar(40)}: он уходит прямо в
 * адрес гостевой ссылки, поэтому колонка обязана быть ровно такой длины (D15).
 * Генератора у него нет и быть не может — его пишет человек.
 */
@Entity
@Table(name = "event_types")
public class EventType {

    @Id
    @Column(length = 40)
    private String id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, length = 600)
    private String description;

    @Column(name = "duration_minutes", nullable = false)
    private int durationMinutes;

    protected EventType() {
    }

    public EventType(String id, String name, String description, int durationMinutes) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.durationMinutes = durationMinutes;
    }

    public String getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public int getDurationMinutes() {
        return durationMinutes;
    }

    /** Идемпотентность Типа — по полному набору полей (D28). */
    public boolean sameContent(String name, String description, int durationMinutes) {
        return this.name.equals(name)
                && this.description.equals(description)
                && this.durationMinutes == durationMinutes;
    }
}
