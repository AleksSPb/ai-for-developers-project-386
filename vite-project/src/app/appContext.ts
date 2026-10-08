import { createContext } from 'react'
import type { Booking } from '../domain/booking'
import type { Slot } from '../domain/slots'
import type { BookingsState, CreateResult } from './useBookings'

export interface AppContextValue {
  /**
   * Состояние списка Броней.
   *
   * Отдаётся вместе с самими Бронями не из удобства, а чтобы страница могла
   * отличить «записей нет» от «список не пришёл». Показывать при отказе пустое
   * состояние — значило бы сказать гостю, что записей нет, хотя сеть не ответила.
   */
  bookingsState: BookingsState
  bookings: readonly Booking[]
  /** Момент, на который считается занятость Слотов. */
  now: Date
  addBooking: (
    slot: Slot,
    eventTypeId: string,
    guest: { name: string; email: string },
  ) => Promise<CreateResult>
}

/**
 * Контекст живёт отдельно от компонента и хука: файл, который экспортирует и
 * компонент, и что-то ещё, ломает Fast Refresh.
 */
export const AppContext = createContext<AppContextValue | null>(null)