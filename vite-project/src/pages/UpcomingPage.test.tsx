import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toApiBooking } from '../api/bookings'
import type { Booking } from '../domain/booking'
import { server } from '../test/server'
import { AppProvider } from '../app/AppProvider'
import UpcomingPage from './UpcomingPage'

/**
 * Список Броней гостя.
 *
 * Брони приходят с сервера, поэтому список асинхронен и подменяется через MSW.
 * Отдельно проверяется, что страница **не говорит о браузере**: записи больше не
 * хранятся там, и прежняя оговорка стала бы ложью.
 */

/** 09:00 по Москве 8 октября: Слот 10:00 впереди, 08:30 позади. */
const NOW = new Date('2026-10-08T06:00:00.000Z')

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'b1',
  eventTypeId: 'consultation',
  start: new Date('2026-10-08T07:00:00.000Z'),
  end: new Date('2026-10-08T07:30:00.000Z'),
  guestName: 'Demo User',
  guestEmail: 'demo@example.com',
  createdAt: '2026-10-07T11:40:00.000Z',
  ...overrides,
})

const pastBooking = (overrides: Partial<Booking> = {}): Booking =>
  booking({
    id: 'past',
    start: new Date('2026-10-08T05:30:00.000Z'),
    end: new Date('2026-10-08T06:00:00.000Z'),
    ...overrides,
  })

const withBookings = (bookings: readonly Booking[]) =>
  http.get('/bookings', () =>
    HttpResponse.json(bookings.map(toApiBooking), { status: 200 }),
  )

const renderPage = (bookings: readonly Booking[] = []) => {
  server.use(withBookings(bookings))

  return render(
    <MantineProvider>
      <AppProvider>
        <MemoryRouter>
          <UpcomingPage />
        </MemoryRouter>
      </AppProvider>
    </MantineProvider>,
  )
}

/**
 * Список асинхронный: сначала текст загрузки, потом содержимое.
 *
 * Ждём **исчезновения** загрузки, а не появления какого-то текста: текст
 * содержимого совпадает сразу с несколькими карточками, и `findByText` спотыкался
 * бы о множественность.
 */
const ready = async () => {
  await waitFor(() => {
    expect(screen.queryByText('Загружаем записи…')).toBeNull()
  })
}

/** Переключатель прошедших адресуем по подписи: она меняется вместе со счётчиком. */
const toggle = (): HTMLElement => {
  const label = screen.getByText(/Показать прошедшие/)
  const button = label.closest('button')
  if (button === null) {
    throw new Error('кнопка показа прошедших не найдена')
  }
  return button
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('список Броней', () => {
  it('не говорит, что записи хранятся в браузере', async () => {
    renderPage([booking()])
    await ready()

    // Записи на сервере, и прежняя оговорка стала бы ложью.
    expect(screen.queryByText(/в этом браузере/i)).toBeNull()
  })

  it('до прихода ответа показывает текст загрузки', () => {
    renderPage()

    expect(screen.getByText('Загружаем записи…')).toBeTruthy()
  })

  it('объясняет пустоту, когда Броней нет', async () => {
    renderPage()
    expect(await screen.findByText('Записей пока нет')).toBeTruthy()
  })

  it('при отказе показывает отказ, а не «Записей пока нет»', async () => {
    server.use(
      http.get('/bookings', () =>
        HttpResponse.json(
          { code: 'service_unavailable', message: 'Сервис временно недоступен' },
          { status: 503 },
        ),
      ),
    )
    render(
      <MantineProvider>
        <AppProvider>
          <MemoryRouter>
            <UpcomingPage />
          </MemoryRouter>
        </AppProvider>
      </MantineProvider>,
    )

    // «Записей нет» при отказе сказало бы гостю, что его запись потерялась.
    expect(await screen.findByText('Сервис временно недоступен')).toBeTruthy()
    expect(screen.queryByText('Записей пока нет')).toBeNull()
  })

  it('показывает имя, почту, Слот и дату создания', async () => {
    renderPage([booking({ id: 'b2', guestName: 'Иван', guestEmail: 'ivan@example.com' })])
    await ready()

    expect(screen.getByText('Иван')).toBeTruthy()
    expect(screen.getByText('ivan@example.com')).toBeTruthy()
    expect(screen.getByText('Слот: 8 октября 2026 г., 10:00 – 10:30')).toBeTruthy()
  })

  it('прячет прошедшие Брони и показывает их по кнопке', async () => {
    renderPage([pastBooking()])
    await ready()

    expect(toggle().textContent).toBe('Показать прошедшие (1)')
    expect(screen.queryByText('Слот: 8 октября 2026 г., 08:30 – 09:00')).toBeNull()

    fireEvent.click(toggle())
    expect(screen.getByText('Слот: 8 октября 2026 г., 08:30 – 09:00')).toBeTruthy()
  })

  it('сворачивает прошедшие обратно', async () => {
    renderPage([pastBooking()])
    await ready()

    fireEvent.click(toggle())
    fireEvent.click(screen.getByText('Скрыть прошедшие'))
    expect(screen.queryByText('Слот: 8 октября 2026 г., 08:30 – 09:00')).toBeNull()
  })

  it('не показывает кнопку прошедших, если прошедших нет', async () => {
    renderPage([booking()])
    await ready()

    expect(screen.queryByText(/Показать прошедшие/)).toBeNull()
  })

  it('сортирует предстоящие по времени Слота', async () => {
    renderPage([
      booking({ id: 'late', start: new Date('2026-10-08T08:00:00.000Z'), end: new Date('2026-10-08T08:30:00.000Z') }),
      booking({ id: 'soon' }),
    ])
    await ready()

    const slots = screen.getAllByText(/^Слот: /).map((node) => node.textContent)
    expect(slots).toEqual([
      'Слот: 8 октября 2026 г., 10:00 – 10:30',
      'Слот: 8 октября 2026 г., 11:00 – 11:30',
    ])
  })

  it('говорит, что предстоящих нет, если все Брони прошли', async () => {
    renderPage([pastBooking()])
    expect(await screen.findByText('Предстоящих записей нет')).toBeTruthy()
  })

  it('показывает прошедшие свежими сверху', async () => {
    renderPage([
      pastBooking({ id: 'old', start: new Date('2026-10-08T04:00:00.000Z'), end: new Date('2026-10-08T04:30:00.000Z') }),
      pastBooking({ id: 'recent' }),
    ])
    await ready()

    fireEvent.click(toggle())
    const slots = screen.getAllByText(/^Слот: /).map((node) => node.textContent)
    expect(slots).toEqual([
      'Слот: 8 октября 2026 г., 08:30 – 09:00',
      'Слот: 8 октября 2026 г., 07:00 – 07:30',
    ])
  })
})