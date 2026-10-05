import { MantineProvider } from '@mantine/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProvider } from '../app/AppProvider'
import type { Booking } from '../domain/booking'
import type { BookingStorage } from '../ports/storage'
import BookingPage from './BookingPage'

/** 09:00 по Москве: Слот 09:00 уже начался, поэтому в списке его нет. */
const NOW = new Date('2026-03-28T06:00:00.000Z')

const createMemoryStorage = (initial: readonly Booking[] = []): BookingStorage => {
  const state = { bookings: [...initial] }
  return {
    read: () => [...state.bookings],
    write: (bookings) => {
      state.bookings = [...bookings]
    },
  }
}

const renderPage = (bookings: readonly Booking[] = []) => render(storageWith(createMemoryStorage(bookings)))

const storageWith = (storage: BookingStorage) => (
  <MantineProvider>
    <AppProvider storage={storage}>
      <BookingPage />
    </AppProvider>
  </MantineProvider>
)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('первый шаг записи', () => {
  it('открывает сегодняшний день, когда в нём есть свободные Слоты', () => {
    renderPage()
    expect(screen.getByText('суббота, 28 марта')).toBeTruthy()
  })

  it('показывает длительность Слота', () => {
    renderPage()
    // Счётчик свободных Слотов проверяется в домене: число 17 встречается
    // ещё и в ячейке 17 марта, а слово «Свободно» — ещё и в статусе Слота,
    // поэтому в компонентном тесте берём строку, которая встречается один раз.
    const row = screen.getByText('Длительность слота').parentElement
    expect(row?.textContent).toBe('Длительность слота30 мин')
  })

  it('не показывает начавшийся Слот в списке', () => {
    renderPage()
    expect(screen.queryByText('09:00 - 09:30')).toBeNull()
    expect(screen.getByText('09:30 - 10:00')).toBeTruthy()
  })

  it('держит продолжение закрытым, пока Слот не выбран', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Продолжить' })).toHaveProperty('disabled', true)
  })

  it('открывает продолжение после выбора Слота и ведёт к подтверждению', () => {
    renderPage()
    fireEvent.click(screen.getByText('09:30 - 10:00'))
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
    expect(screen.getByText('Подтверждение записи')).toBeTruthy()
  })

  it('показывает занятый Слот и не даёт его выбрать', () => {
    const taken: Booking = {
      id: 'b1',
      date: '2026-03-28',
      startMinutes: 570,
      endMinutes: 600,
      guestName: 'Demo User',
      guestEmail: 'demo@example.com',
      createdAt: '2026-03-27T14:40:00.000Z',
    }
    renderPage([taken])

    const row = screen.getByText('09:30 - 10:00').closest('button')
    expect(row).toHaveProperty('disabled', true)
    expect(screen.getByText('Занято')).toBeTruthy()
  })

  it('показывает число свободных Слотов в ячейке даты', () => {
    renderPage()
    // Ячейка 28 марта подписана числом свободных Слотов.
    expect(screen.getByText('17 св.')).toBeTruthy()
  })

  it('закрывает дни за пределами горизонта записи', () => {
    renderPage()
    const cell = screen.getByText('18').closest('button')
    expect(cell).toHaveProperty('disabled', true)
  })

  it('возвращает выбор на шаг записи с кнопки «Изменить»', () => {
    renderPage()
    fireEvent.click(screen.getByText('09:30 - 10:00'))
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }))
    expect(screen.getByText('Статус слотов')).toBeTruthy()
  })
})

describe('подтверждение записи', () => {
  const reachConfirmation = () => {
    fireEvent.click(screen.getByText('09:30 - 10:00'))
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
  }

  it('показывает выбранный Слот и запрашивает имя и почту', () => {
    renderPage()
    reachConfirmation()
    expect(screen.getByText('суббота, 28 марта, 09:30 - 10:00')).toBeTruthy()
    expect(screen.getByLabelText('Имя')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })

  it('не показывает ошибки до первой попытки подтвердить', () => {
    renderPage()
    reachConfirmation()
    expect(screen.queryByText('Введите имя')).toBeNull()
  })

  it('требует имя и почту при пустых полях', () => {
    renderPage()
    reachConfirmation()
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))
    expect(screen.getByText('Введите имя')).toBeTruthy()
    expect(screen.getByText('Введите почту в формате name@example.com')).toBeTruthy()
  })

  it('сохраняет Бронь и показывает экран успеха', () => {
    const storage = createMemoryStorage()
    render(storageWith(storage))

    reachConfirmation()
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: '  Demo User  ' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'Demo@Example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))

    expect(screen.getByText('Бронь подтверждена. До встречи!')).toBeTruthy()
    expect(storage.read()).toHaveLength(1)
    expect(storage.read()[0]).toMatchObject({
      date: '2026-03-28',
      startMinutes: 570,
      guestName: 'Demo User',
      guestEmail: 'demo@example.com',
    })
  })

  it('возвращает к первому шагу с кнопки «Забронировать ещё»', () => {
    const storage = createMemoryStorage()
    render(storageWith(storage))

    reachConfirmation()
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Demo User' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'demo@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))
    fireEvent.click(screen.getByRole('button', { name: 'Забронировать ещё' }))

    expect(screen.getByText('Статус слотов')).toBeTruthy()
    // Слот снят, иначе «Продолжить» увело бы на уже занятое время.
    expect(screen.getByRole('button', { name: 'Продолжить' })).toHaveProperty('disabled', true)
  })

  it('теряет введённые поля при возврате через «Изменить»', () => {
    renderPage()
    reachConfirmation()
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Demo User' } })
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }))
    reachConfirmation()

    expect(screen.getByLabelText('Имя')).toHaveProperty('value', '')
  })

  it('отказывает, если Слот прошёл, пока гость вводил почту', () => {
    const storage = createMemoryStorage()
    render(storageWith(storage))

    reachConfirmation()
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Demo User' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'demo@example.com' } })

    // Гость начал в 09:00, а подтвердил в 10:00: Слот 09:30 уже прошёл.
    act(() => {
      vi.advanceTimersByTime(60 * 60_000)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))

    expect(screen.getByText('Это время уже занято или прошло')).toBeTruthy()
    expect(screen.queryByText('Бронь подтверждена. До встречи!')).toBeNull()
    expect(storage.read()).toHaveLength(0)
  })
})