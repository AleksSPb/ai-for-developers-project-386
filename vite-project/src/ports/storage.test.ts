import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Booking } from '../domain/booking'
import { bookingsStorageKey, createBookingStorage } from './storage'

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'b1',
  eventTypeId: 'consultation',
  start: new Date('2026-10-08T06:00:00.000Z'),
  end: new Date('2026-10-08T06:30:00.000Z'),
  guestName: 'Demo User',
  guestEmail: 'demo@example.com',
  createdAt: '2026-10-07T14:40:00.000Z',
  ...overrides,
})

beforeEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('createBookingStorage', () => {
  it('начинает с пустого списка', () => {
    expect(createBookingStorage().read()).toEqual([])
  })

  it('возвращает записанное при следующем чтении', () => {
    const storage = createBookingStorage()
    storage.write([booking()])
    expect(storage.read()).toEqual([booking()])
  })

  it('моменты переживают JSON туда и обратно', () => {
    // `Date` не сериализуется сам, а приводить его к строке полем `toJSON`
    // значило бы тащить `Date` в домен. Проверяем, что на диске лежит ISO и
    // читается обратно в момент, а не в строку.
    const storage = createBookingStorage()
    storage.write([booking()])
    const raw = window.localStorage.getItem(bookingsStorageKey) ?? ''

    expect(raw).toContain('2026-10-08T06:00:00.000Z')
    expect(storage.read()[0].start).toBeInstanceOf(Date)
  })

  it('переживает пересоздание хранилища, то есть перезагрузку страницы', () => {
    createBookingStorage().write([booking()])
    expect(createBookingStorage().read()).toEqual([booking()])
  })

  it('хранит под ключом с версией', () => {
    createBookingStorage().write([booking()])
    expect(window.localStorage.getItem(bookingsStorageKey)).not.toBeNull()
  })

  it('игнорирует повреждённый JSON', () => {
    window.localStorage.setItem(bookingsStorageKey, '{не json')
    expect(createBookingStorage().read()).toEqual([])
  })

  it('игнорирует значение, которое не массив', () => {
    window.localStorage.setItem(bookingsStorageKey, '{"bookings": []}')
    expect(createBookingStorage().read()).toEqual([])
  })

  it('игнорирует Бронь без обязательных полей', () => {
    window.localStorage.setItem(bookingsStorageKey, JSON.stringify([{ id: 'b1' }]))
    expect(createBookingStorage().read()).toEqual([])
  })

  it('не падает, когда запись в хранилище запрещена', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    const storage = createBookingStorage()
    expect(() => storage.write([booking()])).not.toThrow()
    // Запись остаётся рабочей в пределах сессии.
    expect(storage.read()).toEqual([booking()])
  })

  it('читает из памяти, когда хранилище недоступно целиком', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('access denied')
    })
    const storage = createBookingStorage()
    storage.write([booking()])
    getItem.mockRestore()
    expect(storage.read()).toEqual([booking()])
  })
})