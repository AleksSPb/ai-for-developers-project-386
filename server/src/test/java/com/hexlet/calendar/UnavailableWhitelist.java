package com.hexlet.calendar;

import java.lang.reflect.Constructor;
import java.lang.reflect.Modifier;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import org.springframework.dao.CleanupFailureDataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.InvalidDataAccessResourceUsageException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.dao.TransientDataAccessResourceException;
import org.springframework.dao.UncategorizedDataAccessException;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;

import com.hexlet.calendar.web.ApiAdvice;

/**
 * Перечень D38, вынесенный отдельно отadvice и от тестов.
 *
 * <p>Список нужен сразу двум уровням: уровень 2 сверяет его с аннотацией
 * {@code @ExceptionHandler} и проверяет, что advice сводит каждый механизм в 503;
 * уровень 3 проверяет, что нарушения целостности в него <em>не</em> попадают.
 * Держать копию в каждом классе нельзя — разойдутся молча, и перечень перестанет
 * быть перечнем.
 *
 * <p>Источник правды — аннотация в {@link ApiAdvice}, а этот класс — вторая
 * сторона, которая обязана с ней разойтись громко: сверка живёт в
 * {@code ApiAdviceTest#testedWhitelistIsTheWholeWhitelist}.
 */
final class UnavailableWhitelist {

    private UnavailableWhitelist() {
    }

    /**
     * Перечень D38 в тесте, а не только в advice.
     *
     * <p>Список задан здесь намеренно отдельно от аннотации {@code @ExceptionHandler}:
     * если белый список расширится в advice, тест упадёт на «механизм без проверки»,
     * а не промолчит. Обе стороны списка — источник правды, и разойтись они не
     * должны молча.
     */
    static Stream<Class<? extends Exception>> mechanisms() {
        return Stream.of(
                DataAccessResourceFailureException.class,
                CannotGetJdbcConnectionException.class,
                TransientDataAccessResourceException.class,
                CannotCreateTransactionException.class,
                QueryTimeoutException.class,
                // Абстрактный: в белом списке стоит сам класс, а создать его нельзя.
                // Advice ловит по типу, поэтому для проверки подходит любой подкласс,
                // и это отдельно оговорено в exceptionOf.
                UncategorizedDataAccessException.class,
                CleanupFailureDataAccessException.class);
    }

    /**
     * Ровно те классы, которые advice отдаёт в 503 — перечень D38.
     *
     * <p>Берётся ТОЛЬКО обработчик {@code unavailable}: у advice их несколько, и
     * {@code Refusal} с {@code MethodArgumentNotValidException} относятся к 422 и 409,
     * а не к отказу хранилища. Смешивать их здесь нельзя — сравнение со списком
     * иначе всегда расходилось бы.
     */
    static Set<Class<?>> declaredInAdvice() {
        return Stream.of(ApiAdvice.class.getDeclaredMethods())
                .filter(method -> method.getName().equals("unavailable"))
                .flatMap(method -> Arrays.stream(
                        method.getAnnotation(ExceptionHandler.class).value()))
                .collect(Collectors.toSet());
    }

    /**
     * Исключение данного класса для проверки белого списка.
     *
     * <p>Пустого конструктора нет ни у одного из семи механизмов — проверено
     * рефлексией, а не предположено. Берётся конструктор с наименьшим числом
     * аргументов, недостающие заполняются заглушками: {@code String} — осмысленным
     * текстом, остальное — {@code null}. Тесту важно, что advice отдаёт 503 для
     * КЛАССА, а не то, что он умеет создавать этот класс.
     */
    static Exception exceptionOf(Class<? extends Exception> declared) {
        // `UncategorizedDataAccessException` абстрактен: создать его нельзя, а
        // advice ловит по типу, поэтому проверяется конкретный подкласс. Отдельно
        // оговорено, чтобы «проверен весь список» не читалось как «проверен каждый
        // класс буквально» — экземпляр всё равно подставляет подкласс.
        Class<?> instantiable = Modifier.isAbstract(declared.getModifiers())
                ? InvalidDataAccessResourceUsageException.class
                : declared;

        var constructor = Arrays.stream(instantiable.getDeclaredConstructors())
                .min(Comparator.comparingInt(Constructor::getParameterCount))
                .orElseThrow(() -> new AssertionError(
                        "Нет ни одного конструктора у " + instantiable.getSimpleName()));

        Object[] arguments = Arrays.stream(constructor.getParameterTypes())
                .map(type -> type == String.class ? "проверка белого списка D38" : null)
                .toArray();

        try {
            constructor.setAccessible(true);
            return (Exception) constructor.newInstance(arguments);
        } catch (ReflectiveOperationException notCreatable) {
            throw new AssertionError("Не удалось создать " + instantiable.getSimpleName(), notCreatable);
        }
    }
}