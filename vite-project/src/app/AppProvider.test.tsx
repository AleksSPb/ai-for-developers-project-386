import { MantineProvider } from '@mantine/core'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Booking } from '../domain/booking'
import { getDaySlots, type Slot } from '../domain/schedule'
import type { BookingStorage } from '../ports/storage'
import { AppProvider } from './AppProvider'
import type { AddBookingResult } from './appContext'
import { useApp } from './useApp'

const NOW = new Date('2026-03-28T06:00:00.000Z')
const TODAY = '2026-03-28'

/** 10:00 по Москве — будущий Слот, который ещё никем не занят. */
const freeSlot = (): Slot => getDaySlots(TODAY)[2]

const validGuest = { name: 'Demo User', email: 'demo@example.com' }

const existingBooking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'existing',
  date: TODAY,
  startMinutes: 600,
  endMinutes: 630,
  guestName: 'Demo User',
  guestEmail: 'demo@example.com',
  createdAt: '2026-03-27T14:40:00.000Z',
  ...overrides,
})

/** Хранилище-заглушка: видно, что было записано, и позволяет подложить начальное состояние. */
const createMemoryStorage = (initial: readonly Booking[] = []): BookingStorage => {
  const state = { bookings: [...initial] }
  return {
    read: () => [...state.bookings],
    write: (bookings) => {
      state.bookings = [...bookings]
    },
  }
}

interface ProbeProps {
  guest?: { name: string; email: string }
  onReady?: (submit: (slot: Slot) => AddBookingResult) => void
}

const Probe = ({ guest = validGuest, onReady }: ProbeProps) => {
  const { bookings, now, addBooking } = useApp()
  onReady?.((slot) => addBooking({ slot, guest }))
  return (
    <ul>
      <li>броней: {bookings.length}</li>
      <li>сейчас: {now.toISOString()}</li>
      {bookings.map((booking) => (
        <li key={booking.id}>{`${booking.date} ${booking.startMinutes}`}</li>
      ))}
    </ul>
  )
}

const renderWith = (
  storage: BookingStorage,
  props: Omit<ProbeProps, 'onReady'> = {},
): { submit: (slot?: Slot) => AddBookingResult } => {
  // Держим ссылку в объекте, а не в переменной: значение присваивается
  // внутри колбэка рендера, и TypeScript не сужает такие переменные.
  const handle: { submit: ((slot: Slot) => AddBookingResult) | null } = { submit: null }
  render(
    <MantineProvider>
      <AppProvider storage={storage}>
        <Probe {...props} onReady={(probe) => { handle.submit = probe }} />
      </AppProvider>
    </MantineProvider>,
  )
  return {
    submit: (slot = freeSlot()) =>
      handle.submit?.(slot) ?? { ok: false, error: 'пробник не смонтирован' },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('AppProvider', () => {
  it('читает Брони из порта при монтировании', () => {
    renderWith(createMemoryStorage([existingBooking()]))
    expect(screen.getByText(/броней: 1/)).toBeTruthy()
  })

  it('отдаёт «сейчас» из модуля часов', () => {
    renderWith(createMemoryStorage())
    expect(screen.getByText(`сейчас: ${NOW.toISOString()}`)).toBeTruthy()
  })

  it('записывает Бронь в порт и добавляет её в состояние', () => {
    const storage = createMemoryStorage()
    const { submit } = renderWith(storage)

    let outcome: AddBookingResult = { ok: false, error: 'не вызвано' }
    act(() => {
      outcome = submit()
    })

    expect(outcome).toEqual({ ok: true })
    expect(storage.read()).toHaveLength(1)
    expect(screen.getByText(/броней: 1/)).toBeTruthy()
  })

  it('нормализует имя и почту Гостя перед записью', () => {
    const storage = createMemoryStorage()
    const { submit } = renderWith(storage, {
      guest: { name: '  Demo User  ', email: ' DEMO@Example.COM ' },
    })

    act(() => {
      submit()
    })

    expect(storage.read()[0]).toMatchObject({
      guestName: 'Demo User',
      guestEmail: 'demo@example.com',
    })
  })

  it('отказывает в занятом Слоте и не меняет состояние', () => {
    const storage = createMemoryStorage([existingBooking()])
    const { submit } = renderWith(storage)

    let outcome: AddBookingResult = { ok: true }
    act(() => {
      outcome = submit()
    })

    expect(outcome.ok).toBe(false)
    expect(storage.read()).toHaveLength(1)
    expect(screen.getByText(/броней: 1/)).toBeTruthy()
  })

  it('отказывает в прошедшем Слоте', () => {
    const storage = createMemoryStorage()
    const { submit } = renderWith(storage)

    let outcome: AddBookingResult = { ok: true }
    act(() => {
      // 09:00 по Москве к моменту NOW уже начался.
      outcome = submit(getDaySlots(TODAY)[0])
    })

    expect(outcome.ok).toBe(false)
    expect(storage.read()).toHaveLength(0)
  })

  it('не добавляет Бронь без имени или почты', () => {
    const storage = createMemoryStorage()
    const { submit } = renderWith(storage, { guest: { name: ' ', email: 'demo' } })

    let outcome: AddBookingResult = { ok: true }
    act(() => {
      outcome = submit()
    })

    expect(outcome.ok).toBe(false)
    expect(storage.read()).toHaveLength(0)
  })

  it('бросает понятную ошибку вне провайдера', () => {
    const Broken = () => {
      useApp()
      return null
    }
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      render(
        <MantineProvider>
          <Broken />
        </MantineProvider>,
      ),
    ).toThrow(/вне AppProvider/)
    quiet.mockRestore()
  })
})