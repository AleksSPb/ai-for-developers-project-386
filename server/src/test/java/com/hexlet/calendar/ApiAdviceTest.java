package com.hexlet.calendar;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.hexlet.calendar.refusal.Refusal;
import com.hexlet.calendar.repository.BookingRepository;
import com.hexlet.calendar.repository.EventTypeRepository;
import com.hexlet.calendar.repository.WindowRepository;
import com.hexlet.calendar.web.ApiAdvice;

import jakarta.persistence.EntityManager;

// Boot 4 переехал на Jackson 3: маппер живёт в tools.jackson.databind,
// хотя аннотации сгенерированных моделей — по-прежнему com.fasterxml.jackson.annotation.
import tools.jackson.databind.ObjectMapper;

/**
 * Рендер отказов без базы — уровень 2 пирамиды (#102).
 *
 * <p>Контекст поднимается, хранилище подменено моками: {@code @MockitoBean} на
 * репозиториях и {@code EntityManager}, а автоконфигурация DataSource, Hibernate,
 * Liquibase и репозиториев выключена. Ни контейнера, ни {@code @Testcontainers} —
 * и не нужно: проверяется не то, как база отвечает, а то, как advice превращает
 * отказ в тело ответа.
 *
 * <p>Что даёт именно контекст, чего не дал бы {@code new ApiAdvice()}: настоящий
 * {@code ObjectMapper} приложения. Тело проверяется не полями объекта, а тем JSON,
 * который уедет гостю, — с теми именами свойств, что придут из контракта. Ровно
 * это и ломалось бы незаметно: переименование поля в сгенерированной модели или
 * лишний {@code fields[]} в теле 409 не роняют больше ни один тест.
 *
 * <p>Живой отказ хранилища сюда не переносится: он закрыт решением владельца
 * (см. #102), а «логично ли отдать 503» проверяется ниже — сразу для всех семи
 * механизмов белого списка D38.
 *
 * <p>Суффикс {@code Test} в имени файла — то же, что уровень 2: surefire гоняет
 * его вторым execution'ом, после дешёвого уровня 1 и до контейнера.
 */
@SpringBootTest(properties = {
        // Хранилища нет — и не нужно: advice о нём ничего не знает, а контекст без
        // DataSource не поднимется. Имена классов указаны полностью: в Boot 4
        // автоконфигурация нарезана по модулям и больше не лежит в общем пакете.
        "spring.autoconfigure.exclude="
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration,"
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceTransactionManagerAutoConfiguration,"
                + "org.springframework.boot.jdbc.autoconfigure.JdbcTemplateAutoConfiguration,"
                + "org.springframework.boot.jdbc.autoconfigure.DataSourceInitializationAutoConfiguration,"
                + "org.springframework.boot.hibernate.autoconfigure.HibernateJpaAutoConfiguration,"
                + "org.springframework.boot.data.jpa.autoconfigure.DataJpaRepositoriesAutoConfiguration,"
                + "org.springframework.boot.persistence.autoconfigure.PersistenceExceptionTranslationAutoConfiguration,"
                + "org.springframework.boot.liquibase.autoconfigure.LiquibaseAutoConfiguration",
})
class ApiAdviceTest {

    /** Слоям правил репозитории нужны как бины, но ни один тест сюда не доходит. */
    @MockitoBean
    @SuppressWarnings("unused")
    private BookingRepository bookings;

    @MockitoBean
    @SuppressWarnings("unused")
    private EventTypeRepository types;

    @MockitoBean
    @SuppressWarnings("unused")
    private WindowRepository windows;

    @MockitoBean
    @SuppressWarnings("unused")
    private EntityManager entityManager;

    @Autowired
    private ApiAdvice advice;

    @Autowired
    private ObjectMapper objectMapper;

    // — белый список D38 —

    @ParameterizedTest(name = "{0}")
    @MethodSource("com.hexlet.calendar.UnavailableWhitelist#mechanisms")
    @DisplayName("каждый механизм белого списка D38 даёт 503 service_unavailable")
    void everyWhitelistMechanismIs503(Class<? extends Exception> mechanism) {
        // Здесь мок уместен: механизм ЗАДАН белым списком, и вопрос в том, сводит ли
        // advice каждый из них к одному телу. А вот «умершая база приходит именно
        // этим классом» — не вопрос предположения, а наблюдение, и оно снято
        // решением владельца: проверки нет вовсе (см. #102).
        var response = advice.unavailable(UnavailableWhitelist.exceptionOf(mechanism));

        assertThat(response.getStatusCode().value()).isEqualTo(503);
        assertThat(json(response.getBody()))
                .containsEntry("code", "service_unavailable")
                .containsEntry("message", "Сервер временно не может обслужить запрос.");
    }

    @Test
    @DisplayName("список проверяемых механизмов совпадает с перечнем в advice")
    void testedWhitelistIsTheWholeWhitelist() {
        // Без этого параметризованный тест проверял бы только тех, кого перечислил
        // тест: механизм, добавленный в advice, остался бы непроверенным, и тест
        // промолчал бы. Здесь он падает на расхождении.
        assertThat(UnavailableWhitelist.declaredInAdvice())
                .containsExactlyInAnyOrderElementsOf(UnavailableWhitelist.mechanisms().toList());
    }

    // — шесть отказов слоя правил —

    @ParameterizedTest(name = "{0}")
    @EnumSource(Refusal.Kind.class)
    @DisplayName("каждый Refusal.Kind даёт свой статус и тело контракта (D39)")
    void everyRefusalKindRendersItsOwnStatusAndBody(Refusal.Kind kind) {
        // Код в теле — не произвольная строка, а имя Kind в snake_case: расхождение
        // между ними не поймал бы ни один тест, потому что оба живут в одном файле
        // и правятся вместе.
        var refusal = kind == Refusal.Kind.VALIDATION_FAILED
                ? new Refusal(kind, List.of("guestEmail"))
                : new Refusal(kind);

        var response = advice.refusal(refusal);

        assertThat(response.getStatusCode()).isEqualTo(kind.status());
        assertThat(json(response.getBody()))
                .containsEntry("code", kind.name().toLowerCase(Locale.ROOT))
                .containsEntry("message", kind.message());
    }

    @Test
    @DisplayName("fields[] есть только у validation_failed — у 404 и 409 его быть не должно (D40)")
    void fieldsBelongOnlyToValidationError() {
        var validation = json(advice.refusal(
                new Refusal(Refusal.Kind.VALIDATION_FAILED, List.of("guestEmail", "timeRange"))).getBody());
        var conflict = json(advice.refusal(new Refusal(Refusal.Kind.SLOT_TAKEN)).getBody());

        // Порядок полей формы задаёт advice, а не порядок вставки: гость иначе видит
        // подсветку, которая прыгает между прогонами.
        assertThat(validation).containsEntry("fields", List.of("guestEmail", "timeRange"));
        assertThat(conflict).doesNotContainKey("fields");
    }

    // — helpers —

    /** Тело ответа тем же Jackson, что и в HTTP: проверяется то, что уедет гостю. */
    @SuppressWarnings("unchecked")
    private Map<String, Object> json(Object body) {
        return objectMapper.convertValue(body, Map.class);
    }
}