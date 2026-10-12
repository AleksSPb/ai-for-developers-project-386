package com.hexlet.calendar.config;

import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Клиент с другого origin (D61).
 *
 * <p>Клиент раздаётся Vite с {@code http://localhost:5173}, а сервер отвечает с
 * {@code http://localhost:8080}. Для браузера это два разных источника, и без
 * разрешения он отбрасывает ответы: {@code GET} — молча, а {@code POST} и
 * {@code PATCH} ещё и на предварительном запросе, который без разрешения
 * отклоняется вовсе. Записаться с живым сервером было бы нельзя.
 *
 * <p>Разрешение живёт здесь, а не прокси в Vite, потому что адрес сервера приходит
 * в клиент извне ({@code VITE_API_BASE_URL}) и однажды будет указывать не на
 * локальную машину: собранное приложение ходит на сервер откуда угодно, и
 * «работает у разработчика, потому что dev-сервер проксирует» такой случай не
 * покрывает.
 *
 * <p>Список origin'ов — свойство {@code cors.allowed-origins} (см.
 * {@code application.yml} и {@code CORS_ALLOWED_ORIGINS}), а не константа в коде:
 * переезд на другой адрес раздачи не должен требовать правки сервера. Значение
 * по умолчанию — адрес Vite по умолчанию, и ровно он, а не «любой origin»:
 * {@code allowedOrigins("*")} открыл бы запись в календарь любому сайту, чей
 * гость откроет страницу.
 *
 * <p>Куки и авторизация не участвуют ({@code allowCredentials} не включён), и
 * разрешён ровно тот набор, что описан контрактом: {@code GET}, {@code POST},
 * {@code PATCH}. Заголовок — только {@code Content-Type}: клиент шлёт его с телом
 * записи, и больше ничего.
 */
@Configuration(proxyBeanMethods = false)
public class CorsConfig implements WebMvcConfigurer {

  /** Разрешённые источники: список через запятую из {@code cors.allowed-origins}. */
  private final String[] allowedOrigins;

  /**
   * Читает список источников из настроек.
   *
   * <p>Умолчания здесь нет намеренно: оно живёт в {@code application.yml} рядом с
   * остальными, и отсутствие свойства означает ошибку сборки конфигурации, а не
   * сервер, который молча не пускает никого.
   *
   * @param allowedOrigins источники через запятую, с необязательными пробелами
   */
  public CorsConfig(@Value("${cors.allowed-origins}") String allowedOrigins) {
    List<String> origins =
        Arrays.stream(allowedOrigins.split(","))
            .map(String::trim)
            .filter(origin -> !origin.isEmpty())
            .toList();

    this.allowedOrigins = origins.toArray(String[]::new);
  }

  /**
   * Разрешает перечисленные источники на всех путях контракта.
   *
   * <p>Путь {@code /**} — потому что операции описаны контрактом, а не
   * приложением: правило для каждого маршрута пришлось бы дописывать вместе с
   * каждым новым.
   */
  @Override
  public void addCorsMappings(CorsRegistry registry) {
    registry
        .addMapping("/**")
        .allowedOrigins(allowedOrigins)
        .allowedMethods("GET", "POST", "PATCH", "OPTIONS")
        .allowedHeaders("Content-Type")
        .maxAge(3600);
  }
}