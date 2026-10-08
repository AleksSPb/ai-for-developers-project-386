import { http, HttpResponse, type JsonBodyType } from 'msw'

/**
 * Заглушки сетевого слоя, написанные руками.
 *
 * Таблица `stubbedResponses` — единственный источник правды о том, какие ответы
 * описаны. Обработчики ниже собираются из неё, а тест `contract.test.ts`
 * сверяет её с `contract/openapi.yaml`: ответ, для которого заглушки нет,
 * роняет тест.
 *
 * Ключ ответа — не код, а **пара код и имя модели**: один код может нести разные
 * тела. У `POST /bookings` и `404`, и `422` описаны двумя моделями каждая —
 * слот не найден и Тип не найден, проверка не прошла и время непригодно. Ключ
 * только по коду потерял бы половину каждого из них.
 *
 * Заглушки лежат рядом с тестами, а не в сгенерированной папке: сгенерированное
 * не коммитится, и заглушки из него уехали бы вместе с выгрузкой.
 */

/** Ключ операции: метод и путь. */
export type StubbedOperation = `${string} ${string}`

/** Один описанный ответ: код ответа и имя модели из контракта. */
export type StubbedResponse = {
  /** Код ответа числом: в `openapi.yaml` коды тоже числа. */
  status: number
  /** Имя модели из `components.schemas`. */
  model: string
  /** Тело ответа. */
  body: unknown
}

/**
 * Момент, от которого считаются зашитые интервалы.
 *
 * Один на модуль: заглушка перечитывается на каждой перезагрузке страницы, а внутри
 * одной загрузки все интервалы должны быть согласованы между собой, иначе список
 * Броней говорил бы о времени, которого заглушка окон не предлагает.
 */
const now = new Date()

/** Интервал заданного дня: смещение в днях от «сейчас», час начала и длительность. */
const range = (dayOffset: number, hour: number, durationMinutes: number) => {
  const from = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + dayOffset,
    hour,
    0,
    0,
    0,
  )

  return { start: from.toISOString(), end: new Date(from.getTime() + durationMinutes * 60_000).toISOString() }
}

const stubBooking = {
  id: 'booking-1',
  eventTypeId: 'consultation',
  timeRange: range(1, 11, 30),
  guestName: 'Гость',
  guestEmail: 'guest@example.com',
  createdAt: now.toISOString(),
}

/**
 * Брони для заглушек.
 *
 * Три записи и два Типа, а не одна: фильтр встреч и разведение прошедших не видны
 * на одной записи, и проверять их приходилось бы вслепую.
 *
 * Интервалы считаются от «сейчас», а не зашиты: зашитая дата однажды просто
 * перестанет быть будущей, и все три встречи окажутся прошедшими.
 */
const stubBookingList = [
  { ...stubBooking, id: 'booking-upcoming', timeRange: range(1, 11, 30) },
  {
    ...stubBooking,
    id: 'booking-other-type',
    eventTypeId: 'review',
    timeRange: range(1, 14, 60),
    guestName: 'Иван Петров',
    guestEmail: 'ivan@example.com',
  },
  {
    ...stubBooking,
    id: 'booking-past',
    timeRange: range(-1, 11, 30),
    guestName: 'Анна',
    guestEmail: 'anna@example.com',
  },
]

const stubEventType = {
  id: 'consultation',
  name: 'Консультация',
  description: 'Полчаса о вашем проекте',
  durationMinutes: 30,
  bookingCount: 0,
}

/**
 * Второй Тип события.
 *
 * Нужен, чтобы в заглушке было из чего выбирать: фильтр встреч и ссылка «показать
 * встречи этого Типа» на одной записи неразличимы.
 */
const stubOtherEventType = {
  id: 'review',
  name: 'Разбор проекта',
  description: 'Час о вашем проекте',
  durationMinutes: 60,
  bookingCount: 1,
}

const stubEventTypeList = { types: [stubEventType, stubOtherEventType] }

const stubEventTypeNotFound = {
  code: 'event_type_not_found',
  message: 'Тип события не найден',
}

const stubEventTypeExists = {
  code: 'event_type_exists',
  message: 'Такой Тип события уже есть',
}

const stubServiceUnavailable = {
  code: 'service_unavailable',
  message: 'Сервис временно недоступен',
}

const stubValidationFailed = {
  code: 'validation_failed',
  message: 'Проверка не прошла',
  fields: ['guestName'],
}

const stubSlotTaken = {
  code: 'slot_taken',
  message: 'Слот уже занят',
}

const stubSlotNotFound = {
  code: 'slot_not_found',
  message: 'Слот не найден',
}

const stubTimeNotBookable = {
  code: 'time_not_bookable',
  message: 'На это время записаться нельзя',
  field: 'timeRange',
}

/**
 * Окна приёма для заглушек: сегодня и три дня вперёд, 09:00–18:00.
 *
 * Даты считаются от «сейчас», а не зашиты: заглушка работает и в разработке, где
 * зашитая дата рано или поздно перестаёт содержать Слоты, и страница записи
 * становится пустой без единого объяснения. Модуль перечитывается на каждой
 * перезагрузке страницы, поэтому окна следуют за календарём.
 *
 * Границы заданы **местным** временем, а не московским: интерфейс показывает
 * Слоты в Местном времени гостя, и окно от девяти утра по местному даёт слоты на
 * сегодняшний день у того, кто смотрит. Окно в UTC отстало бы на сутки от
 * календаря, который рисует страница.
 */
const stubWindowList = {
  windows: [0, 1, 2, 3].map((offset) => {
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 9, 0, 0, 0)
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 18, 0, 0, 0)

    return { start: from.toISOString(), end: to.toISOString() }
  }),
}

/**
 * Что заглушка отдаёт по умолчанию.
 *
 * Без переопределения операция отвечает **первым** описанным успехом: обычный
 * тест, ни о чём плохом не думающий, не должен ловить отказ наугад. Неудачу
 * выбирают руками — см. `stubbedResponseFor`.
 */
const defaults: Record<StubbedOperation, string> = {
  'GET /bookings': 'Booking',
  'POST /bookings': 'Booking',
  'GET /event-types': 'EventTypeList',
  'POST /event-types': 'EventTypeSummary',
  'GET /event-types/{id}': 'EventTypeSummary',
  'PATCH /event-types/{id}': 'EventTypeSummary',
  'GET /windows': 'AvailabilityWindowList',
}

/**
 * Все описанные ответы каждой операции контракта.
 *
 * Сверяется с `contract/openapi.yaml` тестом: пара «код и модель» должна
 * совпасть с тем, что есть в спецификации, — ни лишнего, ни недостающего.
 */
export const stubbedResponses: Record<StubbedOperation, StubbedResponse[]> = {
  'GET /bookings': [
    { status: 200, model: 'Booking', body: stubBookingList },
    { status: 503, model: 'ServiceUnavailableError', body: stubServiceUnavailable },
  ],

  'POST /bookings': [
    { status: 201, model: 'Booking', body: stubBooking },
    { status: 404, model: 'SlotNotFoundError', body: stubSlotNotFound },
    { status: 404, model: 'EventTypeNotFoundError', body: stubEventTypeNotFound },
    { status: 409, model: 'SlotTakenError', body: stubSlotTaken },
    { status: 422, model: 'ValidationError', body: stubValidationFailed },
    { status: 422, model: 'TimeNotBookableError', body: stubTimeNotBookable },
    { status: 503, model: 'ServiceUnavailableError', body: stubServiceUnavailable },
  ],

  'GET /event-types': [
    { status: 200, model: 'EventTypeList', body: stubEventTypeList },
    { status: 503, model: 'ServiceUnavailableError', body: stubServiceUnavailable },
  ],

  'POST /event-types': [
    { status: 201, model: 'EventTypeSummary', body: stubEventType },
    { status: 409, model: 'EventTypeExistsError', body: stubEventTypeExists },
    { status: 422, model: 'ValidationError', body: stubValidationFailed },
    { status: 503, model: 'ServiceUnavailableError', body: stubServiceUnavailable },
  ],

  'GET /event-types/{id}': [
    { status: 200, model: 'EventTypeSummary', body: stubEventType },
    { status: 404, model: 'EventTypeNotFoundError', body: stubEventTypeNotFound },
    { status: 503, model: 'ServiceUnavailableError', body: stubServiceUnavailable },
  ],

  'PATCH /event-types/{id}': [
    { status: 200, model: 'EventTypeSummary', body: stubEventType },
    { status: 404, model: 'EventTypeNotFoundError', body: stubEventTypeNotFound },
    { status: 422, model: 'ValidationError', body: stubValidationFailed },
    { status: 503, model: 'ServiceUnavailableError', body: stubServiceUnavailable },
  ],

  'GET /windows': [
    { status: 200, model: 'AvailabilityWindowList', body: stubWindowList },
    { status: 503, model: 'ServiceUnavailableError', body: stubServiceUnavailable },
  ],
}

/** Ответ по умолчанию для операции: успех, названный в `defaults`. */
export const stubbedResponseFor = (operation: StubbedOperation): StubbedResponse => {
  const described = stubbedResponses[operation]
  const found = described.find(({ model }) => model === defaults[operation])

  if (found === undefined) {
    throw new Error(
      `Для ${operation} не описана модель ${defaults[operation]}: проверь defaults и stubbedResponses`,
    )
  }

  return found
}

/**
 * Обработчик операции: плейсхолдер `{id}` из контракта становится `:id`.
 *
 * Один обработчик на операцию, а не по одному на ответ: MSW берёт первый
 * подходящий, поэтому обработчик на каждый код означал бы, что все, кроме
 * первого, недостижимы. Выбор ответа делает `server.use(...)`, а умолчание
 * описано в `defaults`.
 */
const handlerFor = (operation: StubbedOperation) => {
  const [method, path] = operation.split(' ')
  const route = path.replace('{id}', ':id')
  const { status, body } = stubbedResponseFor(operation)

  const respond = () => HttpResponse.json(body as JsonBodyType, { status })

  switch (method) {
    case 'GET':
      return http.get(route, respond)
    case 'POST':
      return http.post(route, respond)
    case 'PATCH':
      return http.patch(route, respond)
    default:
      throw new Error(`Метод ${method} не заглушен: добавь его в stubbedResponses`)
  }
}

export const handlers = (Object.keys(stubbedResponses) as StubbedOperation[]).map(handlerFor)