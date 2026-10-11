package com.hexlet.calendar.repository;

import com.hexlet.calendar.jpa.EventType;
import org.springframework.data.jpa.repository.JpaRepository;

/**
 * Типы событий: только чтение (D14).
 */
public interface EventTypeRepository extends JpaRepository<EventType, String> {}
