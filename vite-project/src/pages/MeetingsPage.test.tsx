import { MantineProvider } from '@mantine/core'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { server } from '../test/server'
import MeetingsPage from './MeetingsPage'

/**
 * Страница встреч.
 *
 * Смысл проверок — фильтр в адресе, граница «предстоящие и прошедшие» и пятиминутный
 * сторож. Время зафиксировано явно: без этого страница раскладывала бы встречи по
 * сегодняшнему дню машины, и завтрашний прогон вёл бы себя иначе сегодняшнего.
 */

const NOW = new Date('2026-10-08T06:00:00.000Z')

const eventType = (overrides: Record<string, unknown> = {}) => ({
  id: 'consultation',
  name: 'Консультация',
  description: 'Полчаса',
  durationMinutes: 30,
  bookingCount: 1,
  ...overrides,
})

const otherEventType = eventType({ id: 'review', name: 'Разбор проекта', bookingCount: 1 })

const booking = (overrides: Record<string, unknown> = {}) => ({
  id: 'b1',
  eventTypeId: 'consultation',
  timeRange: { start: '2026-10-09T07:00:00.000Z', end: '2026-10-09T07:30:00.000Z' },
  guestName: 'Иван',
  guestEmail: 'ivan@example.com',
  createdAt: '2026-10-08T10:00:00.000Z',
  ...overrides,
})

/** Прошедщая встреча: началась до зафиксированного «сейчас». */
const pastBooking = (overrides: Record<string, unknown> = {}) =>
  booking({
  id: 'b0',
  timeRange: { start: '2026-10-07T07:00:00.000Z', end: '2026-10-07T07:30:00.000Z' },
  guestName: 'Пётр',
  guestEmail: 'petr@example.com',
  ...overrides,
})

const withSources = (
  bookings: unknown[] = [booking()],
  types: unknown[] = [eventType()],
) => {
  server.use(
    http.get('/bookings', () => HttpResponse.json(bookings, { status: 200 })),
    http.get('/event-types', () => HttpResponse.json({ types }, { status: 200 })),
  )
}

/** Адрес страницы: на нём видно, что фильтр лежит в адресе, а не в состоянии. */
const LocationProbe = () => <span>{`адрес:${useLocation().search}`}</span>

const renderAt = (address = '/meetings') =>
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={[address]}>
        <LocationProbe />
        <MeetingsPage />
      </MemoryRouter>
    </MantineProvider>,
  )

const renderPage = () => renderAt()

const filterSelect = () => screen.getByLabelText('Тип события') as HTMLSelectElement

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  withSources()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('источники страницы', () => {
  it('до первого ответа показывает текст загрузки', () => {
    renderPage()
    expect(screen.getByText('Загружаем встречи…')).toBeTruthy()
  })

  it('показывает встречу с названием Типа, гостем и интервалом', async () => {
    renderPage()
    await screen.findByText('Иван')

    // Название Типа стоит и в списке фильтра, и в карточке встречи: берём именно
    // карточку, иначе проверка прошла бы на одном вхождении из двух.
    const card = screen.getByText('Иван').closest('div[class*="Paper"]') as HTMLElement

    expect(within(card).getByText('Консультация')).toBeTruthy()
    expect(within(card).getByText('ivan@example.com')).toBeTruthy()
    expect(within(card).getByText(/10:00 – 10:30/)).toBeTruthy()
  })

  it('пустое состояние говорит «Встреч пока нет», а не «Записей пока нет»', async () => {
    withSources([])
    renderPage()

    expect(await screen.findByText('Встреч пока нет')).toBeTruthy()
    // Совпадение с гостевой страницей заставило бы Владельца искать записи там.
    expect(screen.queryByText('Записей пока нет')).toBeNull()
  })

  it('при отказе не видно «Встреч пока нет»', async () => {
    server.use(
      http.get('/bookings', () =>
        HttpResponse.json(
          { code: 'service_unavailable', message: 'Сервис временно недоступен' },
          { status: 503 },
        ),
      ),
      http.get('/event-types', () => HttpResponse.json({ types: [] }, { status: 200 })),
    )
    renderPage()

    expect(await screen.findByText('Сервис временно недоступен')).toBeTruthy()
    expect(screen.queryByText('Встреч пока нет')).toBeNull()
  })

  it('грузит два источника и не грузит окна приёма', async () => {
    const asked = { bookings: 0, types: 0, windows: 0 }
    server.use(
      http.get('/bookings', () => {
        asked.bookings += 1
        return HttpResponse.json([booking()], { status: 200 })
      }),
      http.get('/event-types', () => {
        asked.types += 1
        return HttpResponse.json({ types: [eventType()] }, { status: 200 })
      }),
      http.get('/windows', () => {
        asked.windows += 1
        return HttpResponse.json({ windows: [] }, { status: 200 })
      }),
    )
    renderPage()
    await screen.findByText('Иван')

    expect(asked.bookings).toBe(1)
    expect(asked.types).toBe(1)
    // Владелец не бронирует и расписание не смотрит.
    expect(asked.windows).toBe(0)
  })

  it('встреча с удалённым Типом не исчезает', async () => {
    withSources([booking()], [])
    renderPage()

    // Тип могли удалить, а Встреча всё равно случилась и всё равно заняла время.
    expect(await screen.findByText('Тип события больше не заведён')).toBeTruthy()
    expect(screen.getByText('Иван')).toBeTruthy()
  })

  it('из раздела есть ссылка «Записаться» в гостевую страницу', async () => {
    renderPage()
    const link = await screen.findByText('Записаться')

    expect(link.getAttribute('href')).toBe('/book')
  })
})

describe('фильтр по Типу события', () => {
  const withTwoTypes = () =>
    withSources(
      [booking(), booking({ id: 'b2', eventTypeId: 'review', guestName: 'Анна' })],
      [eventType(), otherEventType],
    )

  it('адрес без параметра показывает встречи всех Типов', async () => {
    withTwoTypes()
    renderAt('/meetings')

    expect(await screen.findByText('Иван')).toBeTruthy()
    expect(screen.getByText('Анна')).toBeTruthy()
    expect(filterSelect().value).toBe('')
  })

  it('фильтр в адресе показывает только встречи этого Типа', async () => {
    withTwoTypes()
    renderAt('/meetings?eventType=review')

    // Взят из адреса, а не из состояния компонента: перезагрузка страницы не должна
    // терять фильтр.
    expect(await screen.findByText('Анна')).toBeTruthy()
    expect(screen.queryByText('Иван')).toBeNull()
    expect(filterSelect().value).toBe('review')
  })

  it('выбор в списке кладёт фильтр в адрес', async () => {
    withTwoTypes()
    renderAt('/meetings')
    await screen.findByText('Иван')

    fireEvent.change(filterSelect(), { target: { value: 'review' } })

    // Фильтр живёт в адресе — им можно поделиться, а кнопка «назад» вернёт прежний.
    expect(await screen.findByText('адрес:?eventType=review')).toBeTruthy()
    expect(screen.queryByText('Иван')).toBeNull()
  })

  it('снятие фильтра убирает его из адреса', async () => {
    withTwoTypes()
    renderAt('/meetings?eventType=review')
    await screen.findByText('Анна')

    fireEvent.change(filterSelect(), { target: { value: '' } })

    expect(await screen.findByText('адрес:')).toBeTruthy()
    expect(screen.getByText('Иван')).toBeTruthy()
  })

  it('неизвестный Тип в адресе даёт пустой список, а не ошибку', async () => {
    // Ссылка из закладки после пересоздания базы: Тип не исчезает сам, и пустой
    // список — правда о данных, а сообщение об ошибке было бы ложью.
    withTwoTypes()
    renderAt('/meetings?eventType=deleted-long-ago')

    expect(await screen.findByText('Встреч пока нет')).toBeTruthy()
    expect(screen.queryByText('Сервис временно недоступен')).toBeNull()
  })

  it('неизвестный Тип в адресе не выбран в списке', async () => {
    withTwoTypes()
    renderAt('/meetings?eventType=deleted-long-ago')
    await screen.findByText('Встреч пока нет')

    // Выбрать его негде: показывать выбранным значило бы утверждать, что Тип есть.
    expect(filterSelect().value).toBe('')
  })

  it('список фильтра берётся из того же ответа, что и список Типов', async () => {
    // Один запрос на Типы: второй ответ со списком разошёлся бы с первым, если бы
    // между ними кто-то завёл Тип.
    const asked = { types: 0 }
    server.use(
      http.get('/bookings', () => HttpResponse.json([booking()], { status: 200 })),
      http.get('/event-types', () => {
        asked.types += 1
        return HttpResponse.json({ types: [eventType()] }, { status: 200 })
      }),
    )
    renderPage()
    await screen.findByText('Иван')

    expect(asked.types).toBe(1)
    expect(screen.getByRole('option', { name: 'Консультация' })).toBeTruthy()
  })
})

describe('предстоящие и прошедшие', () => {
  it('прошедшие встречи не в том же списке, а за отдельной кнопкой', async () => {
    withSources([booking(), pastBooking()])
    renderPage()
    await screen.findByText('Иван')

    // Прошедшая встреча есть, но её не видно: она стоит за кнопкой.
    expect(screen.queryByText('Пётр')).toBeNull()
    expect(screen.getByRole('button', { name: 'Показать прошедшие (1)' })).toBeTruthy()
  })

  it('кнопка открывает прошедшие встречи', async () => {
    withSources([booking(), pastBooking()])
    renderPage()
    await screen.findByText('Иван')

    fireEvent.click(screen.getByRole('button', { name: 'Показать прошедшие (1)' }))

    expect(await screen.findByText('Пётр')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Скрыть прошедшие' })).toBeTruthy()
  })

  it('без прошедших встреч кнопки нет', async () => {
    renderPage()
    await screen.findByText('Иван')

    // Кнопка без того, что она открывает, обещала бы пустоту.
    expect(screen.queryByRole('button', { name: /прошедшие/ })).toBeNull()
  })

  it('фильтр применяется и к прошедшим', async () => {
    withSources(
      [booking(), pastBooking(), pastBooking({ id: 'b3', eventTypeId: 'review', guestName: 'Анна' })],
      [eventType(), otherEventType],
    )
    renderAt('/meetings?eventType=review')
    await screen.findByText('Показать прошедшие (1)')

    // Чужой Тип не считается прошедшей встречей и не попадает в счётчик кнопки.
    expect(screen.queryByText('Пётр')).toBeNull()
  })

  it('кнопки фильтра по дате, гостю и дате создания нет', async () => {
    withSources([booking(), pastBooking()])
    renderPage()
    await screen.findByText('Иван')

    // Фильтр ровно один, и он по Типу события: остальные вопросы раздел не решает.
    expect(screen.getAllByRole('combobox')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Показать прошедшие/ })).toBeTruthy()
  })
})

describe('пятиминутный сторож', () => {
  it('перечитывает встречи каждые пять минут', async () => {
    const asked = { bookings: 0 }
    server.use(
      http.get('/bookings', () => {
        asked.bookings += 1
        return HttpResponse.json([booking()], { status: 200 })
      }),
      http.get('/event-types', () => HttpResponse.json({ types: [eventType()] }, { status: 200 })),
    )
    renderPage()
    await waitFor(() => expect(asked.bookings).toBe(1))

    // Встреча появляется от записи Гостя, а не от правки Владельца: без сторожа он
    // узнал бы о ней только после ручного обновления.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000)
    })

    expect(asked.bookings).toBe(2)
  })

  it('перечитывание не стирает список на экране', async () => {
    withSources([booking(), pastBooking()])
    renderPage()
    await screen.findByText('Иван')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000)
    })

    // Иначе каждые пять минут экран мигал бы текстом загрузки вместо обновления.
    expect(screen.queryByText('Загружаем встречи…')).toBeNull()
    expect(screen.getByText('Иван')).toBeTruthy()
  })

  it('в скрытой вкладке не ходит на сервер', async () => {
    const asked = { bookings: 0 }
    server.use(
      http.get('/bookings', () => {
        asked.bookings += 1
        return HttpResponse.json([booking()], { status: 200 })
      }),
      http.get('/event-types', () => HttpResponse.json({ types: [eventType()] }, { status: 200 })),
    )
    renderPage()
    await waitFor(() => expect(asked.bookings).toBe(1))

    // Браузер, который Владелец закрыл, не должен делать запросы за него.
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000)
    })

    expect(asked.bookings).toBe(1)
  })
})