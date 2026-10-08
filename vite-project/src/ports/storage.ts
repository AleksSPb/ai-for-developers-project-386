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
 *
 * Версия поднята до v2 вместе с переходом интервала на пару моментов: у Брони
 * v1 полей `startMinutes` и `endMinutes` больше нет, и старое значение читать
 * незачем.
 */
export const bookingsStorageKey = 'calendar.bookings.v2'

interface StoredBooking {
  id: string
  eventTypeId: string
  start: string
  end: string
  guestName: string
  guestEmail: string
  createdAt: string
}

const isStoredBooking = (value: unknown): value is StoredBooking => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<StoredBooking>

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.eventTypeId === 'string' &&
    typeof candidate.start === 'string' &&
    typeof candidate.end === 'string' &&
    typeof candidate.guestName === 'string' &&
    typeof candidate.guestEmail === 'string' &&
    typeof candidate.createdAt === 'string'
  )
}

const isStoredBookingList = (value: unknown): value is StoredBooking[] =>
  Array.isArray(value) && value.every(isStoredBooking)

/**
 * Моменты хранятся строками ISO: `Date` не переживает `JSON.stringify` иначе,
 * а приводить его к строке полем `toJSON` значило бы тащить `Date` в домен.
 */
const fromStored = (stored: StoredBooking): Booking => ({
  ...stored,
  start: new Date(stored.start),
  end: new Date(stored.end),
})

const toStored = (booking: Booking): StoredBooking => ({
  ...booking,
  start: booking.start.toISOString(),
  end: booking.end.toISOString(),
})

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
 * Хранилище на `localStorage` с откатом в память. Откат нужен, чтобы приватный
 * режим не превращался в пустое расписание: брони в такой сессии не переживут
 * перезагрузку, но работать будут.
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
            return isStoredBookingList(parsed) ? parsed.map(fromStored) : []
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
          storage.setItem(key, JSON.stringify(bookings.map(toStored)))
        } catch {
          // Квота или приватный режим: запись остаётся в памяти сессии.
        }
      }
    },
  }
}