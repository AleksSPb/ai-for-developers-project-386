import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProvider } from '../app/AppProvider'
import type { Booking } from '../domain/booking'
import type { BookingStorage } from '../ports/storage'
import BookingPage from './BookingPage'

/** 09:00 по Москве: Слот 09:00 уже начался, поэтому в списке его нет. */
const NOW = new Date('2026-03-28T06:00:00.000Z')

const createMemoryStorage = (initial: readonly Booking[] = []): BookingStorage => ({
  read: () => [...initial],
  write: () => {},
})

const renderPage = (bookings: readonly Booking[] = []) =>
  render(
    <MantineProvider>
      <AppProvider storage={createMemoryStorage(bookings)}>
        <BookingPage />
      </AppProvider>
    </MantineProvider>,
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