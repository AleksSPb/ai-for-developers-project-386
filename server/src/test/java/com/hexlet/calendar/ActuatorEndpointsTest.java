package com.hexlet.calendar;

import static org.assertj.core.api.Assertions.assertThat;

import com.hexlet.calendar.repository.BookingRepository;
import com.hexlet.calendar.repository.EventTypeRepository;
import com.hexlet.calendar.repository.WindowRepository;
import jakarta.persistence.EntityManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/**
 * Эндпоинты actuator'а через настоящий HTTP на настоящий Tomcat. Уровень 2
 * пирамиды (#102): контекст поднят, хранилище подменено моками, контейнера нет.
 *
 * <p>Уровень здесь — тот же, что у {@code ApiOperationsTest}, и по той же
 * причине: проверяется HTTP-граница (эндпоинт виден, отвечает 200, тело разбирается
 * Jackson'ом), а не поведение Micrometer. Реестр метрик и правило «счётчик
 * равен единице после одной записи» проверяется дешевле — на настоящем
 * {@code SimpleMeterRegistry} в {@code RulesWithoutDbUnit}. Контейнер тут покупал
 * бы ровно ничего: база на ответ actuator'а не влияет, а её индикатор в health —
 * единственное, что пришлось бы подменять, и он проверяется на живом стенде.
 *
 * <p>Контекст общий с {@code ApiOperationsTest}: у обоих файлов совпадают
 * web-окружение и набор подменяемых бинов, поэтому этот файл не добавляет
 * третьего контекста на уровне 2. Второй контекст — у {@code ApiAdviceTest}, и
 * он был до actuator'а: тому нужен web-окружение {@code MOCK}, а не случайный
 * порт. Тесты этого файла ходят в эндпоинты по настоящему HTTP, как соседний.
 */
@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      // Хранилища нет — actuator отвечает и без него. Имена классов полностью:
      // в Boot 4 автоконфигурация нарезана по модулям (см. ApiOperationsTest).
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
class ActuatorEndpointsTest {

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

  @LocalServerPort private int port;

  /**
   * Маппер приложения, а не свой: ответ actuator'а разбирать нужно тем же
   * Jackson'ом, каким сервер сериализует, иначе тест проверял бы чужую
   * конфигурацию (см. {@code ApiOperationsTest}).
   */
  @Autowired private ObjectMapper objectMapper;

  private final HttpClient http = HttpClient.newHttpClient();

  @Test
  @DisplayName("GET /actuator/metrics отвечает 200 и перечисляет HTTP-метрики")
  void metricsEndpointListsHttpMetrics() throws Exception {
    // Сначала запрос к самому actuator'у: http.server.requests появляется в
    // реестре после первого обслуженного запроса, поэтому спрашивать список
    // метрик первым же обращением — значит получить пустой список и решить,
    // что метрик нет.
    assertThat(get("/actuator/health").status()).isEqualTo(200);

    var response = get("/actuator/metrics");

    assertThat(response.status()).withFailMessage(() -> "body=" + response.body()).isEqualTo(200);
    // Имена метрик в теле — единственное, что этот эндпоинт и отдаёт, и
    // разбирается оно тем же Jackson'ом, что и тела операций.
    assertThat(response.json(objectMapper).get("names").toString())
        .contains("http.server.requests");
    // Счётчики домена в списке имён есть только после первого вызова: MeterRegistry
    // создаёт счётчик лениво, поэтому до записи их в перечне не будет, и проверять
    // тут нечего.
  }

  @Test
  @DisplayName("GET /actuator/health отвечает 200 и отдаёт статус")
  void healthEndpointAnswers() throws Exception {
    var response = get("/actuator/health");

    assertThat(response.status()).withFailMessage(() -> "body=" + response.body()).isEqualTo(200);
    // Состояние в этом тесте UP: состав индикаторов подставной базы не трогает
    // итог, а вот отсутствие поля status означало бы, что отвечает не health.
    assertThat(response.json(objectMapper).get("status").asText()).isEqualTo("UP");
    // Настоящий индикатор базы здесь невозможен: хранилище подменено моками (D62).
    // В живой сборке `show-details: always` показывает db — это проверяется на стенде.
  }

  @Test
  @DisplayName("GET /actuator/loggers читается, а смена уровня не проходит")
  void loggersAreReadOnly() throws Exception {
    assertThat(get("/actuator/loggers").status()).isEqualTo(200);

    // `access: read-only` — ровно то свойство, которое заявлено в application.yml.
    // Проверяется отказом на попытку смены, а не чтением конфигурации: значение
    // из application.yml и поведение эндпоинта могут разойтись (Boot это умеет),
    // и интересен здесь второй.
    var changed =
        send(
            HttpRequest.newBuilder(URI.create(base() + "/actuator/loggers/com.hexlet.calendar"))
                .header("Content-Type", "application/json")
                .POST(
                    HttpRequest.BodyPublishers.ofString(
                        "{\"configuredLevel\":\"DEBUG\"}")));

    assertThat(changed.status()).withFailMessage(() -> "body=" + changed.body()).isEqualTo(405);
  }

  @Test
  @DisplayName("GET /actuator/env отдаёт имена свойств, значения скрыты")
  void envShowsNamesButNotValues() throws Exception {
    var response = get("/actuator/env");

    assertThat(response.status()).withFailMessage(() -> "body=" + response.body()).isEqualTo(200);

    // show-values: never. Проверка не по POSTGRES_PASSWORD, а по маркеру
    // подстановки: имя свойства есть, а рядом с ним — `******` вместо значения.
    // Открытая пара «имя и значение» означала бы, что ограничение снято.
    String body = response.body();
    assertThat(body).contains("spring.datasource.password");
    assertThat(body).doesNotContain("\"value\":\"calendar\"");
  }

  // — helpers —

  private String base() {
    return "http://localhost:" + port;
  }

  private Response get(String path) throws Exception {
    return send(HttpRequest.newBuilder(URI.create(base() + path)).GET());
  }

  private Response send(HttpRequest.Builder builder) throws Exception {
    var response = http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    return new Response(response.statusCode(), response.body());
  }

  /**
   * Ответ как есть: статус и тело.
   *
   * <p>Тело разбирает переданный маппер, а не свой: record вложен статически и
   * до поля бина не дотягивается, да и разбирать ответ нужно тем же Jackson'ом,
   * каким сервер сериализует (см. {@code HttpResult} в {@code ApiOperationsTest}).
   */
  private record Response(int status, String body) {
    JsonNode json(ObjectMapper mapper) throws Exception {
      return mapper.readTree(body);
    }
  }
}
