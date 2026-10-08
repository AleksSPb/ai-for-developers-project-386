import type { TimeRange } from './range'

/**
 * Бронь — единственное, что хранится.
 *
 * Интервал Брони — пара моментов, а не минуты от полуночи: момент несёт своё
 * смещение, поэтому Броня через полночь или через переход на летнее время не
 * требует ничего. Слоты не хранятся, они считаются (docs/adr/0001), поэтому
 * проверка конфликта спрашивает про интервалы, а не про записи в таблице Слотов.
 */
export interface Booking extends TimeRange {
  id: string
  /** Тип события, под который Гость забронировал Слот. */
  eventTypeId: string
  guestName: string
  guestEmail: string
  /** Когда Бронь была создана, ISO 8601. */
  createdAt: string
}

export interface GuestInput {
  name: string
  email: string
}

export interface GuestErrors {
  name?: string
  email?: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Пробелы по краям — опечатка, а не часть имени; регим почты значения не имеет. */
export const normalizeGuest = (input: GuestInput): GuestInput => ({
  name: input.name.trim(),
  email: input.email.trim().toLowerCase(),
})

export const validateGuest = (input: GuestInput): GuestErrors => {
  const guest = normalizeGuest(input)
  const errors: GuestErrors = {}

  if (guest.name.length === 0) {
    errors.name = 'Введите имя'
  }

  if (!emailPattern.test(guest.email)) {
    errors.email = 'Введите почту в формате name@example.com'
  }

  return errors
}