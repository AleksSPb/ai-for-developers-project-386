import { createContext } from 'react'

import type { Booking, GuestInput } from '../domain/booking'
import type { Slot } from '../domain/schedule'

export interface AddBookingInput {
  slot: Slot
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
 * Контекст лежит отдельно от компонента и хука: файл, который экспортирует
 * и компонент, и что-то ещё, ломает Fast Refresh.
 */
export const AppContext = createContext<AppContextValue | null>(null)