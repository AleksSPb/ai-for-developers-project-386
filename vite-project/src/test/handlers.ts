import { http, HttpResponse, type JsonBodyType } from 'msw'

import { TEXT_LIMITS, TEXT_MINIMUMS } from '../app/textLimits'

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
 * Ответ операции с готовым телом.
 *
 * Хранилище отвечает за успех, а код и тело отказа берутся из констант, описанных
 * рядом с `stubbedResponses`: отказ описан в контракте один раз, и выдумывать
 * вторую копию значило бы однажды получить заглушку, которой нет в спецификации.
 */
const described = (status: number, model: string, body: unknown): StubbedResponse => ({
  status,
  model,
  body,
})

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

/**
 * Запрос на создание Типа события, как его пришлёт клиент.
 *
 * Отдельная форма ответа намеренно: тело запроса и тело ответа о Типе события —
 * разные вещи, и подставить одно вместо другого значило бы потерять то, что
 * Владелец написал.
 */
interface CreateEventTypeBody {
  id: string
  name: string
  description: string
  durationMinutes: number
}

/** Запрос на запись, как его пришлёт клиент. */
interface CreateBookingBody {
  eventTypeId: string
  timeRange: { start: string; end: string }
  guestName: string
  guestEmail: string
}

/** Тело, которым сервер отвечает на создание: то же, что лежит в хранилище. */
type EventTypeBody = Omit<CreateEventTypeBody, never>

/** Тело, которым сервер отвечает на запись. */
type BookingBody = CreateBookingBody & { id: string; createdAt: string }

/**
 * Хранилище заглушек.
 *
 * **Живёт в памяти и помнит написанное:** без этого созданный Тип или записанный
 * Слот появлялись на экране и тут же пропадали из списков, и проверить руками
 * «успех создания показывает карточку сразу» было нечем — тест проходил бы,
 * увидев карточку, которая была и до клика.
 *
 * Отдельно от `stubbedResponses`: та таблица отвечает на вопрос «какие коды и
 * модели описаны в контракте» и остаётся написанной руками, а это отвечает на
 * вопрос «что лежит сейчас».
 *
 * Сбрасывается между тестами — см. `resetStubStore`.
 */
const store = {
  eventTypes: [] as EventTypeBody[],
  bookings: [] as BookingBody[],
}

const seedEventTypes = (): EventTypeBody[] => [
  { ...stubEventType },
  { ...stubOtherEventType },
]

const seedBookings = (): BookingBody[] => stubBookingList.map((booking) => ({ ...booking }))

/**
 * Вернуть хранилище к посеянному состоянию.
 *
 * Вызывается после каждого теста рядом со `server.resetHandlers()`: заглушка,
 * пережившая один тест, не должна достаться следующему — иначе тесты начали бы
 * зависеть от порядка, и падение одного тянуло за собой чужие.
 */
export const resetStubStore = (): void => {
  store.eventTypes = seedEventTypes()
  store.bookings = seedBookings()
}

resetStubStore()

/**
 * Тот же Слот, что и у такой-то Брони.
 *
 * Идемпотентность по содержимому, как её обещает контракт: повтор запроса вернёт
 * ту же Броню, а не заведёт вторую на то же время.
 */
const sameSlot = (a: BookingBody, b: CreateBookingBody): boolean =>
  a.eventTypeId === b.eventTypeId && a.timeRange.start === b.timeRange.start

/**
 * Проверка полей Типа события по тому, что объявлено в контракте.
 *
 * Заглушка **обязана** отвергать негодное, иначе она врёт: без неё пустой
 * идентификатор заводил Тип, и проверка руками показывала успех там, где
 * настоящий сервер вернул бы `422`.
 *
 * Правила взяты из `main.tsp`: `@minLength(1)` у каждого текста, `@maxLength` из
 * `app/textLimits` (его же сверяет тест контракта) и `@pattern` у идентификатора.
 *
 * Возвращаются **все** негодные поля сразу, а не по одному, — так обещает контракт
 * и так подсвечивает форма за один проход.
 */
const idPattern = /^[a-z0-9-]+$/

const validateEventType = (
  body: Partial<CreateEventTypeBody>,
  withId: boolean,
): string[] => {
  const bad: string[] = []

  if (withId) {
    const id = body.id ?? ''

    if (
      id.length < TEXT_MINIMUMS.id ||
      id.length > TEXT_LIMITS.id ||
      !idPattern.test(id)
    ) {
      bad.push('id')
    }
  }

  const name = body.name ?? ''
  const description = body.description ?? ''

  if (name.length < TEXT_MINIMUMS.name || name.length > TEXT_LIMITS.name) {
    bad.push('name')
  }

  if (
    description.length < TEXT_MINIMUMS.description ||
    description.length > TEXT_LIMITS.description
  ) {
    bad.push('description')
  }

  return bad
}

/** Ответ с перечислением негодных полей: ровно то, что обещает `ValidationError`. */
const invalid = (fields: string[]): StubbedResponse =>
  described(422, 'ValidationError', {
    code: 'validation_failed',
    message: 'Проверка не прошла',
    fields,
  })

/**
 * Создать Тип события: тот же набор полей — та же Бронь-в-Типе, а не отказ.
 *
 * Идемпотентность по всем полям, как в контракте: любая правка Типа меняет набор
 * сама собой, и повтор исходного запроса после переименования вернёт `409`.
 */
const createEventType = (body: CreateEventTypeBody): StubbedResponse => {
  const bad = validateEventType(body, true)

  if (bad.length > 0) {
    return invalid(bad)
  }

  const exists = store.eventTypes.some((type) => type.id === body.id)

  if (exists) {
    const same = store.eventTypes.find((type) => type.id === body.id)
    const matchesSame = JSON.stringify(same) === JSON.stringify(body)

    if (!matchesSame) {
      return described(409, 'EventTypeExistsError', stubEventTypeExists)
    }

    return described(201, 'EventTypeSummary', same)
  }

  store.eventTypes.push(body)

  return described(201, 'EventTypeSummary', body)
}

/** Переименовать Тип события: идентификатора в теле нет, он неизменен. */
const renameEventType = (id: string, body: { name: string; description: string }) => {
  const index = store.eventTypes.findIndex((type) => type.id === id)

  if (index === -1) {
    return described(404, 'EventTypeNotFoundError', stubEventTypeNotFound)
  }

  const bad = validateEventType(body, false)

  if (bad.length > 0) {
    return invalid(bad)
  }

  store.eventTypes[index] = { ...store.eventTypes[index], ...body }

  return described(200, 'EventTypeSummary', store.eventTypes[index])
}

/** Записать Гостя на Слот. */
const createBooking = (body: CreateBookingBody): StubbedResponse => {
  const existing = store.bookings.find((booking) => sameSlot(booking, body))

  if (existing !== undefined) {
    return described(201, 'Booking', existing)
  }

  const created: BookingBody = {
    ...body,
    id: `booking-${store.bookings.length + 1}`,
    createdAt: new Date().toISOString(),
  }

  store.bookings.push(created)

  return described(201, 'Booking', created)
}

/**
 * Обработчики, которые читают и пишут хранилище.
 *
 * Идут раньше общих: MSW берёт первый подходящий, и общий обработчик отвечал бы
 * зашитым телом, минуя хранилище.
 */
const storeHandlers = [
  http.get('/event-types', () =>
    HttpResponse.json({ types: store.eventTypes }, { status: 200 }),
  ),

  http.post('/event-types', async ({ request }) => {
    const result = await createEventType((await request.json()) as CreateEventTypeBody)

    return HttpResponse.json(result.body as JsonBodyType, { status: result.status })
  }),

  http.get('/event-types/:id', ({ params }) => {
    const found = store.eventTypes.find((type) => type.id === params.id)

    if (found === undefined) {
      return HttpResponse.json(stubEventTypeNotFound as JsonBodyType, { status: 404 })
    }

    return HttpResponse.json(found as JsonBodyType, { status: 200 })
  }),

  http.patch('/event-types/:id', async ({ params, request }) => {
    const result = await renameEventType(
      String(params.id),
      (await request.json()) as { name: string; description: string },
    )

    return HttpResponse.json(result.body as JsonBodyType, { status: result.status })
  }),

  http.get('/bookings', () => HttpResponse.json(store.bookings, { status: 200 })),

  http.post('/bookings', async ({ request }) => {
    const result = await createBooking((await request.json()) as CreateBookingBody)

    return HttpResponse.json(result.body as JsonBodyType, { status: result.status })
  }),
]

export const handlers = [...storeHandlers, ...(Object.keys(stubbedResponses) as StubbedOperation[]).map(handlerFor)]