/**
 * Бронь — единственное, что хранится. Слоты не хранятся, они считаются
 * (см. docs/adr/0001-slots-are-derived.md), поэтому проверка конфликта
 * спрашивает про интервалы, а не про записи в таблице Слотов.
 */

/** Интервал окна приёма в минутах от полуночи в таймзоне организатора. */
export interface Interval {
  startMinutes: number
  endMinutes: number
}

export interface Booking extends Interval {
  id: string
  /** Ключ дня календаря, 'ГГГГ-ММ-ДД' в таймзоне организатора. */
  date: string
  guestName: string
  guestEmail: string
  /** Когда бронь была создана, ISO 8601. */
  createdAt: string
}

export const hasConflict = (
  candidate: Interval,
  bookings: readonly Booking[],
): boolean => bookings.some((booking) => intervalsOverlap(candidate, booking))

/**
 * Полуоткрытые интервалы: слот 09:00–09:30 и 09:30–10:00 не пересекаются.
 * Границы не делятся, потому что каждый Слот занимается целиком.
 */
export const intervalsOverlap = (a: Interval, b: Interval): boolean =>
  a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes

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