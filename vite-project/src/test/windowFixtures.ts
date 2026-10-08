import { http, HttpResponse } from 'msw'

/**
 * Окна приёма и Тип события для сценариев тестов.
 *
 * Переопределяются через `server.use(...)` на время теста. Обход MSW здесь
 * сознательный: проверяется слой, который сам ходит в сгенерированный клиент, и
 * подмена ответа ниже этого слоя ничего бы не проверяла.
 */

const windows = (...ranges: { start: string; end: string }[]) =>
  ranges.map(({ start, end }) => ({ start, end }))

/** Окно 09:00–18:00 по Москве: девять часовых Слотов. */
export const nineHourWindow = (date: string) => ({
  start: `${date}T06:00:00.000Z`,
  end: `${date}T15:00:00.000Z`,
})

export const stubWindowsHandler = (...ranges: { start: string; end: string }[]) =>
  http.get('/windows', () => HttpResponse.json({ windows: windows(...ranges) }, { status: 200 }))

export const stubEventTypeHandler = (durationMinutes: number) =>
  http.get('/event-types/consultation', () =>
    HttpResponse.json(
      {
        id: 'consultation',
        name: 'Консультация',
        description: 'Полчаса о вашем проекте',
        durationMinutes,
        bookingCount: 0,
      },
      { status: 200 },
    ),
  )

export const stubUnavailableHandler = () =>
  http.get('/windows', () =>
    HttpResponse.json(
      { code: 'service_unavailable', message: 'Сервис временно недоступен' },
      { status: 503 },
    ),
  )

/** Типовой набор источников страницы записи: окно на сегодня и Тип на 60 минут. */
export const withDefaultSources = (date: string) => [
  stubWindowsHandler(nineHourWindow(date)),
  stubEventTypeHandler(60),
]