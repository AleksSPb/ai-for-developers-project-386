package com.hexlet.calendar.repository;

import java.time.Instant;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

import com.hexlet.calendar.jpa.Window;

/**
 * Окна приёма: только чтение.
 *
 * <p>Граница, которую легко пройти не туда: фильтр «окна, целиком закончившиеся,
 * не возвращаются» (D25) выглядит как {@code WHERE end_dt > now()}, но {@code now()}
 * здесь — параметр из {@code Clock} сервиса, а не часы базы. Иначе «начало в
 * прошлом» и «какие окна отдать» зависели бы от двух разных часов (D22), и
 * проверить это без контейнера было бы нельзя.
 */
public interface WindowRepository extends JpaRepository<Window, Long> {

    List<Window> findByEndDtAfterOrderByStartDtAsc(Instant now);
}
