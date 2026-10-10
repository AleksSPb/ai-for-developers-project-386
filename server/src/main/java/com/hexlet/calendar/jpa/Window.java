package com.hexlet.calendar.jpa;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Сущность окна приёма, таблица {@code windows} (D13).
 *
 * <p>Схема — из Liquibase, здесь только зеркало: {@code ddl-auto: validate}
 * сверяет. Моменты — {@code Instant}, читаются в UTC (настройка
 * {@code hibernate.jdbc.time_zone}), зона константы живёт выше по стеку (ADR-0008).
 */
@Entity
@Table(name = "windows")
public class Window {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "start_dt", nullable = false)
    private Instant startDt;

    @Column(name = "end_dt", nullable = false)
    private Instant endDt;

    protected Window() {
    }

    public Window(Instant startDt, Instant endDt) {
        this.startDt = startDt;
        this.endDt = endDt;
    }

    public Long getId() {
        return id;
    }

    public Instant getStartDt() {
        return startDt;
    }

    public Instant getEndDt() {
        return endDt;
    }
}
