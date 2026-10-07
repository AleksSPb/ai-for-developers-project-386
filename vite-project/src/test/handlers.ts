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

const stubBooking = {
  id: 'booking-1',
  eventTypeId: 'consultation',
  timeRange: {
    start: '2026-10-08T09:00:00.000Z',
    end: '2026-10-08T09:30:00.000Z',
  },
  guestName: 'Гость',
  guestEmail: 'guest@example.com',
  createdAt: '2026-10-07T10:00:00.000Z',
}

const stubEventType = {
  id: 'consultation',
  name: 'Консультация',
  description: 'Полчаса о вашем проекте',
  durationMinutes: 30,
  bookingCount: 0,
}

const stubEventTypeList = { types: [stubEventType] }

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

const stubWindowList = {
  windows: [
    {
      start: '2026-10-08T06:00:00.000Z',
      end: '2026-10-08T15:00:00.000Z',
    },
  ],
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
    { status: 200, model: 'Booking', body: [stubBooking] },
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