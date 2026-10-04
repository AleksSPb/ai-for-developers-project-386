import type { Booking } from '../domain/booking'

/**
 * Порт хранения Броней. Домен и интерфейс знают только этот интерфейс,
 * поэтому появление сервера — это замена одной реализации
 * (см. docs/adr/0002-bookings-stored-in-browser-behind-a-port.md).
 */
export interface BookingStorage {
  read: () => Booking[]
  write: (bookings: readonly Booking[]) => void
}

/**
 * Версия в ключе: после изменения формата Брони старое значение не должно
 * читаться молча, иначе сломанные данные уедут в интерфейс как рабочие.
 */
export const bookingsStorageKey = 'calendar.bookings.v1'

const isBooking = (value: unknown): value is Booking => {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<Booking>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.date === 'string' &&
    typeof candidate.startMinutes === 'number' &&
    typeof candidate.endMinutes === 'number' &&
    typeof candidate.guestName === 'string' &&
    typeof candidate.guestEmail === 'string' &&
    typeof candidate.createdAt === 'string'
  )
}

const isBookingList = (value: unknown): value is Booking[] =>
  Array.isArray(value) && value.every(isBooking)

/**
 * Проверяем доступность хранилища записью, а не чтением: в приватном режиме
 * чтение проходит, а первая же запись падает.
 */
const getAvailableStorage = (): Storage | null => {
  try {
    const probe = 'calendar.probe'
    window.localStorage.setItem(probe, probe)
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Хранилище на `localStorage` с откатом в память. Откат нужен, чтобы
 * приватный режим не превращался в пустое расписание: брони в такой сессии
 * не переживут перезагрузку, но работать будут.
 */
export const createBookingStorage = (key: string = bookingsStorageKey): BookingStorage => {
  const storage = getAvailableStorage()
  let memory: readonly Booking[] = []

  return {
    read: () => {
      if (storage !== null) {
        try {
          const raw = storage.getItem(key)
          if (raw !== null) {
            const parsed: unknown = JSON.parse(raw)
            return isBookingList(parsed) ? parsed : []
          }
        } catch {
          // Повреждённое значение лучше проигнорировать, чем уронить страницу.
        }
      }
      return [...memory]
    },
    write: (bookings) => {
      memory = [...bookings]
      if (storage !== null) {
        try {
          storage.setItem(key, JSON.stringify(bookings))
        } catch {
          // Квота или приватный режим: запись остаётся в памяти сессии.
        }
      }
    },
  }
}