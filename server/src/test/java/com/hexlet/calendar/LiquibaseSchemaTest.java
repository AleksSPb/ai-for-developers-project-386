package com.hexlet.calendar;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;

import javax.sql.DataSource;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Схема приходит из Liquibase, а не из Hibernate.
 *
 * <p>Тест поднимает настоящий Postgres в Testcontainers и ждёт, что контекст
 * стартует: {@code ddl-auto=validate} проверяет схему на старте, поэтому если бы
 * её создавал Hibernate, тест прошёл бы и с пустой базой. Проверяется обратное —
 * таблицы и ограничения созданы миграциями.
 */
@Testcontainers
@SpringBootTest
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LiquibaseSchemaTest {

    /**
     * Контейнер на весь класс.
     *
     * <p>Адрес и учётные данные подставляет Spring Boot сам через
     * {@code @ServiceConnection}. Собственный {@code @DynamicPropertySource} здесь не
     * годится: он вызывается при сборке контекста, а контейнер на тот момент ещё не
     * стартовал, и Spring падал с «Mapped port can only be obtained after the
     * container is started» ещё до первого теста.
     */
    @Container
    @ServiceConnection
    @SuppressWarnings("resource")
    private static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:18-alpine")
            .withDatabaseName("calendar")
            .withUsername("calendar")
            .withPassword("calendar");

    @Autowired
    private DataSource dataSource;

    @Test
    @DisplayName("Liquibase создаёт все три таблицы, а не Hibernate")
    void createsTables() throws Exception {
        assertThat(tableNames()).contains("windows", "event_types", "bookings");
    }

    @Test
    @DisplayName("сид заводит 14 окон на 09:00–18:00 по Москве")
    void seedsWindows() throws Exception {
        List<String> bounds = jdbc("""
                SELECT to_char(min(start_dt AT TIME ZONE 'Europe/Moscow'), 'HH24:MI') || '-'
                    || to_char(max(end_dt   AT TIME ZONE 'Europe/Moscow'), 'HH24:MI')
                FROM windows
                """);

        assertThat(bounds).containsExactly("09:00-18:00");

        assertThat(jdbcLong("SELECT count(*) FROM windows")).isEqualTo(14L);
    }

    @Test
    @DisplayName("окна идут подряд по дням, без дублей и пропусков")
    void seedsConsecutiveDays() throws Exception {
        List<Integer> days = jdbcList(
                "SELECT extract(day FROM start_dt AT TIME ZONE 'Europe/Moscow')::int FROM windows ORDER BY 1");

        assertThat(days).doesNotHaveDuplicates();

        // Разница между соседними днями всегда один день: пропуска в сиде быть не может.
        for (int i = 1; i < days.size(); i++) {
            assertThat(days.get(i) - days.get(i - 1)).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("пересечение Броней отбивает база, а не код сервера")
    void rejectsOverlappingBookings() throws Exception {
        try (var connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {

            statement.executeUpdate("INSERT INTO event_types VALUES ('consult', 'Консультация', 'Описание', 60)");
            statement.executeUpdate("""
                    INSERT INTO bookings VALUES
                        ('11111111-1111-1111-1111-111111111111', 'consult',
                         '2026-10-15 10:00+03', '2026-10-15 10:30+03',
                         'Иван', 'ivan@example.com', now())
                    """);

            // Начало сдвинуто на четверть часа, поэтому начала не совпадают,
            // а пересечение всё равно есть: проверяется именно сдвиг, а не
            // совпадение начал.
            assertThatThrownBy(() -> statement.executeUpdate("""
                    INSERT INTO bookings VALUES
                        ('22222222-2222-2222-2222-222222222222', 'consult',
                         '2026-10-15 10:15+03', '2026-10-15 10:45+03',
                         'Пётр', 'petr@example.com', now())
                    """))
                    .hasMessageContaining("bookings_no_overlap");
        }
    }

    @Test
    @DisplayName("Бронь на несуществующий тип не проходит: внешний ключ varchar(40)")
    void rejectsUnknownEventType() throws Exception {
        try (var connection = dataSource.getConnection();
             Statement statement = connection.createStatement()) {

            assertThatThrownBy(() -> statement.executeUpdate("""
                    INSERT INTO bookings VALUES
                        ('33333333-3333-3333-3333-333333333333', 'nosuch',
                         '2026-11-15 10:00+03', '2026-11-15 10:30+03',
                         'Иван', 'ivan@example.com', now())
                    """))
                    .hasMessageContaining("bookings_event_type_id_fkey");
        }
    }

    private List<String> tableNames() throws Exception {
        return jdbc("""
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name <> 'databasechangelog'
                  AND table_name <> 'databasechangeloglock'
                """);
    }

    private List<String> jdbc(String sql) throws Exception {
        List<String> rows = new ArrayList<>();
        try (var connection = dataSource.getConnection();
             Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery(sql)) {
            while (result.next()) {
                rows.add(result.getString(1));
            }
        }
        return rows;
    }

    private List<Integer> jdbcList(String sql) throws Exception {
        List<Integer> rows = new ArrayList<>();
        try (var connection = dataSource.getConnection();
             Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery(sql)) {
            while (result.next()) {
                rows.add(result.getInt(1));
            }
        }
        return rows;
    }

    private long jdbcLong(String sql) throws Exception {
        try (var connection = dataSource.getConnection();
             Statement statement = connection.createStatement();
             ResultSet result = statement.executeQuery(sql)) {
            result.next();
            return result.getLong(1);
        }
    }
}
