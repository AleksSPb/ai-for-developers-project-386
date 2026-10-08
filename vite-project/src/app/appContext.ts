import { createContext } from 'react'
import type { Booking, GuestInput } from '../domain/booking'
import type { Slot } from '../domain/slots'

/**
 * Состояние приложения.
 *
 * Брони лежат здесь по-прежнему, но интервал у них теперь пара моментов, а
 * длительность Слота задаёт Тип события, а не константа кода.
 */

export interface AddBookingInput {
  slot: Slot
  eventTypeId: string
  guest: GuestInput
}

export type AddBookingResult = { ok: true } | { ok: false; error: string }

export interface AppContextValue {
  bookings: readonly Booking[]
  /** Момент, на который считается занятость Слотов. */
  now: Date
  addBooking: (input: AddBookingInput) => AddBookingResult
}

/**
 * Контекст живёт отдельно от компонента и хука: файл, который экспортирует и
 * компонент, и что-то ещё, ломает Fast Refresh.
 */
export const AppContext = createContext<AppContextValue | null>(null)