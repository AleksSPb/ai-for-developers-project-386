package com.hexlet.calendar.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.hexlet.calendar.jpa.EventType;

/**
 * Типы событий: только чтение (D14).
 */
public interface EventTypeRepository extends JpaRepository<EventType, String> {
}
