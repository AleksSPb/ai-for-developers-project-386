import "@typespec/http";
import "@typespec/rest";
import "@typespec/openapi";

using TypeSpec.Http;
using TypeSpec.Rest;
using TypeSpec.OpenAPI;

/**
 * Контракт сервиса бронирования звонков.
 *
 * Источник правды — этот файл. Сгенерированный код воспроизводится из
 * `openapi.yaml` и не коммитится.
 *
 * Что контракт НЕ описывает: расписание. Слоты считает клиент по рамке и
 * длительности Типа, которые приходят здесь. Контракт описывает форму данных,
 * а не логику их вычисления.
 */
@service(#{ title: "Календарь — запись на звонок" })
@info(#{ version: "2" })
namespace CalendarApi;

/**
 * Отрезок времени в Брони или Слоте.
 *
 * Это настоящие моменты, а не минуты от полуночи, поэтому такой отрезок
 * физически не может выглядеть как «начало позже конца»: момент окончания
 * всегда позже момента начала. Дата дня здесь выводится из начала в
 * Таймзоне организатора и отдельно не хранится.
 */
model TimeRange {
  /** Начало, с точностью до секунд. */
  @encode("rfc3339")
  start: utcDateTime;

  /** Конец, с точностью до секунд. Всегда позже `start`. */
  @encode("rfc3339")
  end: utcDateTime;
}

/**
 * Тип Брони в списке для выбора.
 *
 * Идентификатор приходит с сервера, поэтому на клиенте это строка, а не
 * значение закрытого набора: валидация уходит в рантайм.
 */
model BookingTypeSummary {
  /** Идентификатор Типа Брони, из которого строится адрес записи. */
  @minLength(1)
  type: string;

  /** Название для показа Гостю: «Консультация». */
  @minLength(1)
  name: string;
}

/** Список Типов, из которых Гость выбирает. */
model BookingTypeList {
  /** Типы, доступные для записи. Пустой список — запись невозможна. */
  types: BookingTypeSummary[];
}

/**
 * Правило расписания для выбранного Типа.
 *
 * Рамка приходит с сервера, а превращение её в Слоты остаётся на клиенте.
 * Длительность определяется Типом, поэтому сетка делит окно нацело: Тип на
 * 60 минут в окне 09:00–18:00 даёт 9 Слотов, а не 18.
 */
model ScheduleRule {
  /** Горизонт записи: сколько дней вперёд от сегодня можно забронировать. */
  @minValue(1)
  horizonDays: int32;

  /** Насколько далеко назад можно листать календарь, месяцев. */
  @minValue(0)
  backMonths: int32;

  /** Таймзона организатора. Приходит с сервера, а не берётся из браузера. */
  @minLength(1)
  organizerTimeZone: string;

  /** Длительность Слота в минутах, определяется выбранным Типом. */
  @minValue(5)
  durationMinutes: int32;
}

/**
 * Бронь — единственное, что хранится.
 *
 * Тип и интервал лежат рядом, но это не одно и то же: интервал — единственное,
 * что обещано Гостю, а Тип — ярлык. Длительность Типа может быть изменена, и
 * существующие Брони ей не соответствуют, поэтому сверки нет нигде.
 */
model Booking {
  /** Идентификатор, присваивает сервер. */
  @minLength(1)
  id: string;

  /** Тип Брони, как его назвал Гость при записи. */
  @minLength(1)
  type: string;

  /** Занятый отрезок времени целиком. */
  timeRange: TimeRange;

  /** Имя, которое Гость назвал сам. */
  @minLength(1)
  guestName: string;

  /** Почта, которую Гость назвал сам. */
  @format("email")
  guestEmail: string;

  /** Когда создана Бронь, по часам сервера. */
  @encode("rfc3339")
  createdAt: utcDateTime;
}

/** Запрос на запись. Идентификатор и время создания присваивает сервер. */
model CreateBookingRequest {
  /** Тип Брони, выбранный на странице выбора. */
  @minLength(1)
  type: string;

  /** Выбранный Слот, который Гость занимает целиком. */
  timeRange: TimeRange;

  /** Имя Гостя. */
  @minLength(1)
  guestName: string;

  /** Почта Гостя. */
  @format("email")
  guestEmail: string;
}

/** Слот занят другим Гостем. Возможен и при гонке — проигрывает второй. */
@error
model SlotTakenError {
  code: "slot_taken";
  message: string;
}

/**
 * Такого Слота нет: день вне Горизонта записи, либо Бронь сгорела,
 * а подтверждение пришло позже.
 */
@error
model SlotNotFoundError {
  code: "slot_not_found";
  message: string;
}

/** Типа Брони, который был в ссылке, на сервере больше нет. */
@error
model BookingTypeNotFoundError {
  code: "booking_type_not_found";
  message: string;
}

/** Проверка данных Гостя не прошла. */
@error
model ValidationError {
  code: "validation_failed";
  message: string;

  /** Поле, в котором ошибка: «guestEmail». */
  field?: string;
}

/** Сервер не отвечает. Гость может повторить попытку. */
@error
model ServiceUnavailableError {
  code: "service_unavailable";
  message: string;
}

@error
model Error409SlotTaken {
  @statusCode
  statusCode: 409;
  @body
  body: SlotTakenError;
}

@error
model Error404Slot {
  @statusCode
  statusCode: 404;
  @body
  body: SlotNotFoundError;
}

@error
model Error404Type {
  @statusCode
  statusCode: 404;
  @body
  body: BookingTypeNotFoundError;
}

@error
model Error422Validation {
  @statusCode
  statusCode: 422;
  @body
  body: ValidationError;
}

@error
model Error503Unavailable {
  @statusCode
  statusCode: 503;
  @body
  body: ServiceUnavailableError;
}

model BookingCreated {
  @statusCode
  statusCode: 201;
  @body
  body: Booking;
}

/** Типы, доступные для записи. */
@route("/booking-types")
@tag("Типы Брони")
interface BookingTypes {
  /**
   * Список Типов для выбора на странице записи.
   * Пустой список означает, что запись невозможна.
   */
  @get
  listBookingTypes(): BookingTypeList | Error503Unavailable;
}

/** Рамка расписания и Слоты. */
@route("/schedule")
@tag("Расписание")
interface Schedule {
  /**
   * Рамка расписания и длительность Слота для выбранного Типа.
   *
   * Одна операция отдаёт всё нужное, чтобы построить сетку дня. Типы приходят
   * отдельной операцией, иначе пришлось бы ждать два ответа и гадать, какой
   * придёт первым.
   */
  @get
  getSchedule(
    /** Тип Брони, параметры которого нужны. */
    @query
    type: string,
  ): ScheduleRule | Error404Type | Error503Unavailable;
}

/** Брони Гостя. */
@route("/bookings")
@tag("Брони")
interface Bookings {
  /**
   * Все Брони, видимые Гостю.
   *
   * Клиент читает список при загрузке и после каждой попытки записи —
   * успешной и нет. Без перечитывания клиентская проверка конфликта
   * сравнивает с устаревшим снимком и пропускает дубль.
   */
  @get
  listBookings(): Booking[] | Error503Unavailable;

  /**
   * Записать Гостя на Слот.
   *
   * Идемпотентно по содержимому: если такая Бронь уже есть, возвращается
   * успех с ней. Иначе Гость, чья первая попытка прошла, а ответ потерялся,
   * увидел бы отказ при существующей Броне и решил бы, что записаться не удалось.
   */
  @post
  createBooking(
    /** Данные записи. Слот занимается целиком. */
    @body
    request: CreateBookingRequest,
  ): BookingCreated
    | Error409SlotTaken
    | Error404Slot
    | Error404Type
    | Error422Validation
    | Error503Unavailable;
}
