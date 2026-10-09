package com.hexlet.calendar.prototype.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.hexlet.calendar.prototype.jpa.EventType;

/**
 * ПРОТОТИП (#83). Типы событий: только чтение (D14).
 */
public interface EventTypeRepository extends JpaRepository<EventType, String> {
}
