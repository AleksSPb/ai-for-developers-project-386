package com.hexlet.calendar;

import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Один контейнер на весь прогон (#102), а не по контейнеру на класс.
 *
 * <p>Раньше каждый интеграционный класс поднимал свой Postgres, и это съедало
 * большую часть времени сборки: следующий добавленный класс удваивал бы её.
 * Здесь контейнер стартует один раз при первом обращении и живёт до конца JVM.
 *
 * <p>Остановки нет намеренно. Класс, глушащий контейнер, отравил бы всех, кто
 * идёт после, — а с {@code @Testcontainers} контейнер гасился бы после каждого
 * класса. JUnit к нему не причастен: {@code @Container} не ставится, а уборку
 * делает Ryuk при выходе JVM. Отсюда следствие для тестов: состояние базы общее,
 * и интеграционный тест обязан чистить за собой перед каждым своим тестом.
 */
final class SharedPostgres {

  private static final PostgreSQLContainer<?> INSTANCE =
      new PostgreSQLContainer<>("postgres:18-alpine")
          .withDatabaseName("calendar")
          .withUsername("calendar")
          .withPassword("calendar");

  static {
    INSTANCE.start();
  }

  private SharedPostgres() {}

  /** Тот же экземпляр для каждого класса: адрес подставляет {@code @ServiceConnection}. */
  static PostgreSQLContainer<?> container() {
    return INSTANCE;
  }
}
