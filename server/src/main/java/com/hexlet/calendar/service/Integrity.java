package com.hexlet.calendar.service;

import com.hexlet.calendar.refusal.Refusal;

/**
 * Единственный в раскладке читатель имён ограничений.
 *
 * <p>Наблюдение (требование приехало из #82 сюда): нарушение внешнего ключа и
 * нарушение exclusion-ограничения — в Java это ОДИН И ТОТ ЖЕ класс
 * исключения; различимы только по имени ограничения в тексте причины:
 *
 * <ul>
 *   <li>{@code bookings_no_overlap} → {@code 409 slot_taken} (D17, D36);</li>
 *   <li>{@code bookings_event_type_id_fkey} → {@code 404 event_type_not_found}
 *       (D15: тип исчез между проверкой и вставкой — база дописывает то,
 *       что не увидел код);</li>
 *   <li>{@code event_types_pkey} → {@code 409 event_type_exists} (D28).</li>
 * </ul>
 *
 * <p>Главное наблюдение раскладки, которого нет в #82: в паре Spring Boot 4 +
 * Hibernate 7 тип исключения зависит от пути. {@code EntityManager.flush()}
 * сквозь shared-прокси бросает СЫРОЙ {@code org.hibernate.exception.
 * ConstraintViolationException}; Spring-овский {@code DataIntegrityViolationException}
 * появляется только когда за потоком стоит переводчик — вызов через Spring Data
 * репозиторий или коммит транзакции. Поэтому слой правил ловит
 * {@code RuntimeException} и читает ВСЮ цепочку причин, а не один класс.
 *
 * <p>Почему разбор живёт в слое правил, а не в advice: белый список D38
 * резервирует {@code 503} за инфраструктурой ({@code DataAccessResourceFailureException}
 * и собратья), и целостность в него не входит. Если бы advice ловил целостность
 * broadly, гонка за слот превратилась бы в 503 (дефект, исправленный в #82).
 * Пока транзакция открыта, имя ограничения читает сервис; непонятое имя он НЕ
 * интерпретирует — пробрасывает как есть, и это становится 500.
 */
public final class Integrity {

    private Integrity() {
    }

    /** Refusal по имени ограничения из цепочки причин, либо null. */
    public static Refusal refusalOf(Throwable e) {
        String message = chainMessage(e);
        if (message.contains("bookings_no_overlap")) {
            return new Refusal(Refusal.Kind.SLOT_TAKEN);
        }
        if (message.contains("bookings_event_type_id_fkey")) {
            return new Refusal(Refusal.Kind.EVENT_TYPE_NOT_FOUND);
        }
        if (message.contains("event_types_pkey")) {
            return new Refusal(Refusal.Kind.EVENT_TYPE_EXISTS);
        }
        return null;
    }

    private static String chainMessage(Throwable e) {
        StringBuilder all = new StringBuilder();
        for (Throwable t = e; t != null; t = t.getCause()) {
            if (t.getMessage() != null) {
                all.append(t.getMessage()).append('\n');
            }
            if (t.getCause() == t) {
                break;
            }
        }
        return all.toString();
    }
}
