import { MantineProvider } from '@mantine/core'
import { act, render, screen } from '@testing-library/react'
import { http, HttpResponse, type JsonBodyType } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { toApiBooking } from '../api/bookings'
import type { Booking } from '../domain/booking'
import type { Slot } from '../domain/slots'
import { server } from '../test/server'
import { AppProvider } from './AppProvider'
import { useApp } from './useApp'

/**
 * Провайдер поверх сервера.
 *
 * Главное из #55: **клиентской проверки конфликта нет**. Раньше провайдер сравнивал
 * интервалы и отказывал сам; теперь за конфликт отвечает сервер один раз, а вторая
 * проверка на клиенте была бы второй правдой о том же факте — и успела бы
 * состариться: между проверкой и отправкой слот мог занять другой гость.
 */

/** 09:00 по Москве: Слот 10:00 впереди и свободен. */
const NOW = new Date('2026-10-08T06:00:00.000Z')

const slotAt = (hour: number): Slot => ({
  start: new Date(Date.UTC(2026, 9, 8, hour)),
  end: new Date(Date.UTC(2026, 9, 8, hour + 1)),
})

const guest = { name: 'Demo User', email: 'demo@example.com' }

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'b1',
  eventTypeId: 'consultation',
  ...slotAt(10),
  guestName: 'Demo User',
  guestEmail: 'demo@example.com',
  createdAt: '2026-10-07T14:40:00.000Z',
  ...overrides,
})

const withBookings = (...bookings: Booking[]) =>
  http.get('/bookings', () =>
    HttpResponse.json(bookings.map(toApiBooking), { status: 200 }),
  )

/** Ответ на создание и счётчик отправленных запросов. */
const withCreateResponse = (status: number, body: unknown) => {
  const state = {
    sent: 0,
    handler: http.post('/bookings', () => {
      state.sent += 1
      return HttpResponse.json(body as JsonBodyType, { status })
    }),
  }

  return state
}

interface ProbeProps {
  onReady?: (addBooking: ReturnType<typeof useApp>['addBooking']) => void
}

const Probe = ({ onReady }: ProbeProps) => {
  const { bookings, bookingsState, now, addBooking } = useApp()
  onReady?.(addBooking)
  return (
    <ul>
      <li>броней: {bookings.length}</li>
      <li>состояние: {bookingsState.kind}</li>
      <li>сейчас: {now.toISOString()}</li>
    </ul>
  )
}

const renderWith = () => {
  // Ссылка в объекте, а не в переменной: значение присваивается внутри колбэка
  // рендера, и TypeScript не сужает такие переменные.
  const handle: { submit: ReturnType<typeof useApp>['addBooking'] | null } = { submit: null }

  render(
    <MantineProvider>
      <AppProvider>
        <Probe onReady={(addBooking) => { handle.submit = addBooking }} />
      </AppProvider>
    </MantineProvider>,
  )

  return {
    submit: (slot: Slot = slotAt(10), who = guest) => {
      if (handle.submit === null) {
        throw new Error('пробник не смонтирован')
      }
      return handle.submit(slot, 'consultation', who)
    },
  }
}

const ready = () => screen.findByText('состояние: готов')

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  server.use(withBookings())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('провайдер поверх сервера', () => {
  it('читает Брони списком с сервера', async () => {
    server.use(withBookings(booking()))
    renderWith()

    expect(await screen.findByText('броней: 1')).toBeTruthy()
  })

  it('отдаёт «сейчас» из модуля часов', async () => {
    renderWith()
    await ready()
    expect(screen.getByText(`сейчас: ${NOW.toISOString()}`)).toBeTruthy()
  })

  it('записывает Бронь запросом на сервер и перечитывает список', async () => {
    server.use(
      http.post('/bookings', () =>
        HttpResponse.json(toApiBooking(booking({ id: 'new' })), { status: 201 }),
      ),
      // Список после создания перечитывается, и на сервере он уже не пуст.
      withBookings(booking({ id: 'new' })),
    )

    const { submit } = renderWith()
    await ready()

    let outcome: { kind: string } = { kind: 'отказ' }
    await act(async () => {
      outcome = await submit()
    })

    expect(outcome.kind).toBe('создана')
    expect(await screen.findByText('броней: 1')).toBeTruthy()
  })

  it('не проверяет конфликт на клиенте: занятый Слот уходит на сервер', async () => {
    // Слот 10:00 занят Бронью в списке, но клиент всё равно отправляет запрос и
    // показывает ответ сервера, а не решает сам.
    const create = withCreateResponse(409, { code: 'slot_taken', message: 'Слот уже занят' })
    server.use(withBookings(booking()), create.handler)

    const { submit } = renderWith()
    await screen.findByText('броней: 1')

    let outcome: { kind: string; refusal?: { kind: string } } = { kind: 'создана' }
    await act(async () => {
      outcome = await submit()
    })

    expect(create.sent).toBe(1)
    expect(outcome.kind).toBe('отказ')
    expect(outcome.refusal?.kind).toBe('занят')
  })

  it('перечитывает список и после отказа', async () => {
    // Список перечитывается после любой попытки: без этого после отказа по
    // занятости Слот остался бы свободным в интерфейсе, и гость жал бы кнопку
    // снова, получая тот же отказ.
    const create = withCreateResponse(409, { code: 'slot_taken', message: 'Слот уже занят' })
    const list = http.get('/bookings', () => HttpResponse.json([], { status: 200 }))
    server.use(create.handler, list)

    const { submit } = renderWith()
    await ready()

    await act(async () => {
      await submit()
    })

    // Второе чтение — после отказа: снимок списка не должен остаться прежним.
    expect(await screen.findByText('броней: 0')).toBeTruthy()
    expect(create.sent).toBe(1)
  })

  it('пустые поля не отправляются на сервер', async () => {
    const create = withCreateResponse(201, toApiBooking(booking()))
    server.use(create.handler)

    const { submit } = renderWith()
    await ready()

    let outcome: { kind: string; refusal?: { kind: string } } = { kind: 'создана' }
    await act(async () => {
      outcome = await submit(slotAt(10), { name: ' ', email: 'demo' })
    })

    expect(create.sent).toBe(0)
    expect(outcome.kind).toBe('отказ')
    expect(outcome.refusal?.kind).toBe('данные')
  })

  it('отказ списка отличается от пустого списка', async () => {
    server.use(
      http.get('/bookings', () =>
        HttpResponse.json(
          { code: 'service_unavailable', message: 'Сервис временно недоступен' },
          { status: 503 },
        ),
      ),
    )
    renderWith()

    // «Броней: 0» при отказе — это не «записей нет», и состояния их различает.
    expect(await screen.findByText('состояние: отказ')).toBeTruthy()
  })

  it('бросает понятную ошибку вне провайдера', async () => {
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