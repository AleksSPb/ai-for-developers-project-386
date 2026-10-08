import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProvider } from '../app/AppProvider'
import type { Booking } from '../domain/booking'
import type { BookingStorage } from '../ports/storage'
import UpcomingPage from './UpcomingPage'

/** 09:00 по Москве 8 октября: слот 10:00 впереди, слот 08:30 позади. */
const NOW = new Date('2026-10-08T06:00:00.000Z')

/** Слот получасовой длительности от момента в UTC. */
const slotAt = (startIso: string): { start: Date; end: Date } => ({
  start: new Date(startIso),
  end: new Date(new Date(startIso).getTime() + 30 * 60_000),
})

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'b1',
  eventTypeId: 'consultation',
  ...slotAt('2026-10-08T07:00:00.000Z'),
  guestName: 'Demo User',
  guestEmail: 'demo@example.com',
  createdAt: '2026-10-07T11:40:00.000Z',
  ...overrides,
})

const pastBooking = (overrides: Partial<Booking> = {}): Booking =>
  booking({ id: 'past', ...slotAt('2026-10-08T05:30:00.000Z'), ...overrides })

const renderPage = (bookings: readonly Booking[] = []) => {
  const storage: BookingStorage = { read: () => [...bookings], write: () => {} }
  return render(
    <MantineProvider>
      <AppProvider storage={storage}>
        <UpcomingPage />
      </AppProvider>
    </MantineProvider>,
  )
}

/** Переключатель прошедщих адресуем по подписи, а не по роли: подпись меняется вместе со счётчиком. */
const toggle = (): HTMLElement => {
  const label = screen.getByText(/Показать прошедшие/)
  const button = label.closest('button')
  if (button === null) {
    throw new Error('кнопка показа прошедших не найдена')
  }
  return button
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('список Броней', () => {
  it('объявляет, что записи хранятся в этом браузере', () => {
    renderPage([booking()])
    expect(screen.getByText('Записи, сохранённые в этом браузере.')).toBeTruthy()
  })

  it('объясняет пустоту, когда Броней нет', () => {
    renderPage()
    expect(screen.getByText('Записей пока нет')).toBeTruthy()
  })

  it('показывает имя, почту, Слот и дату создания', () => {
    renderPage([booking({ id: 'b2', guestName: 'Иван', guestEmail: 'ivan@example.com' })])
    expect(screen.getByText('Иван')).toBeTruthy()
    expect(screen.getByText('ivan@example.com')).toBeTruthy()
    expect(screen.getByText('Слот: 8 октября 2026 г., 10:00 – 10:30')).toBeTruthy()
    expect(screen.getByText('Создано: 14:40')).toBeTruthy()
  })

  it('прячет прошедшие Брони и показывает их по кнопке', () => {
    renderPage([pastBooking()])
    expect(toggle().textContent).toBe('Показать прошедшие (1)')
    expect(screen.queryByText('Слот: 8 октября 2026 г., 08:30 – 09:00')).toBeNull()

    fireEvent.click(toggle())
    expect(screen.getByText('Слот: 8 октября 2026 г., 08:30 – 09:00')).toBeTruthy()
  })

  it('сворачивает прошедшие обратно', () => {
    renderPage([pastBooking()])
    fireEvent.click(toggle())
    fireEvent.click(screen.getByText('Скрыть прошедшие'))
    expect(screen.queryByText('Слот: 8 октября 2026 г., 08:30 – 09:00')).toBeNull()
  })

  it('не показывает кнопку прошедших, если прошедших нет', () => {
    renderPage([booking()])
    expect(screen.queryByText(/Показать прошедшие/)).toBeNull()
  })

  it('сортирует предстоящие по времени Слота', () => {
    renderPage([
      // 08:00 UTC — 11:00 по Москве, то есть более поздняя Бронь.
      booking({ id: 'late', ...slotAt('2026-10-08T08:00:00.000Z') }),
      booking({ id: 'soon', ...slotAt('2026-10-08T07:00:00.000Z') }),
    ])
    const slots = screen.getAllByText(/^Слот: /).map((node) => node.textContent)
    expect(slots).toEqual([
      'Слот: 8 октября 2026 г., 10:00 – 10:30',
      'Слот: 8 октября 2026 г., 11:00 – 11:30',
    ])
  })

  it('говорит, что предстоящих нет, если все Брони прошли', () => {
    renderPage([pastBooking()])
    expect(screen.getByText('Предстоящих записей нет')).toBeTruthy()
  })

  it('показывает прошедшие свежими сверху', () => {
    renderPage([
      // 04:00 UTC — это 07:00 по Москве, то есть более ранняя Бронь.
      pastBooking({ id: 'old', ...slotAt('2026-10-08T04:00:00.000Z') }),
      pastBooking({ id: 'recent' }),
    ])
    fireEvent.click(toggle())
    const slots = screen.getAllByText(/^Слот: /).map((node) => node.textContent)
    expect(slots).toEqual([
      'Слот: 8 октября 2026 г., 08:30 – 09:00',
      'Слот: 8 октября 2026 г., 07:00 – 07:30',
    ])
  })
})