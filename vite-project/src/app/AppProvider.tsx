import { useCallback, useEffect, useMemo, useReducer, type ReactNode } from 'react'

import type { Booking } from '../domain/booking'
import { normalizeGuest, validateGuest } from '../domain/booking'
import { intervalsOverlap } from '../domain/range'
import { getSlotStatus } from '../domain/day'
import type { BookingStorage } from '../ports/storage'
import { AppContext, type AddBookingInput, type AddBookingResult } from './appContext'
import { useNow } from './useNow'

type AppAction = { type: 'bookings/add'; booking: Booking }

const initialState = (storage: BookingStorage): readonly Booking[] => storage.read()

const reducer = (state: readonly Booking[], action: AppAction): readonly Booking[] => {
  if (action.type !== 'bookings/add') {
    return state
  }

  const { booking } = action
  // Проверка конфликта в самом редьюсере: правило одно, и оно не должно
  // зависеть от того, нажал Гость кнопку или нет.
  const isTaken = state.some((existing) => intervalsOverlap(existing, booking))

  return isTaken ? state : [...state, booking]
}

export interface AppProviderProps {
  /** Порт хранилища: в приложении реализация на `localStorage`, в тестах — заглушка. */
  storage: BookingStorage
  children: ReactNode
}

/**
 * Порт передаётся пропсом, а не подставляется внутри: так тест выбирает
 * хранилище, не трогая браузерное состояние.
 */
export const AppProvider = ({ storage, children }: AppProviderProps) => {
  const [bookings, dispatch] = useReducer(reducer, undefined, () => initialState(storage))
  const now = useNow()

  useEffect(() => {
    storage.write(bookings)
  }, [storage, bookings])

  const addBooking = useCallback(
    ({ slot, eventTypeId, guest }: AddBookingInput): AddBookingResult => {
      if (getSlotStatus(slot, bookings, now) !== 'свободен') {
        return { ok: false, error: 'Это время уже занято или прошло' }
      }

      if (Object.keys(validateGuest(guest)).length > 0) {
        return { ok: false, error: 'Проверьте имя и почту' }
      }

      const person = normalizeGuest(guest)
      dispatch({
        type: 'bookings/add',
        booking: {
          id: crypto.randomUUID(),
          eventTypeId,
          start: slot.start,
          end: slot.end,
          guestName: person.name,
          guestEmail: person.email,
          createdAt: now.toISOString(),
        },
      })

      return { ok: true }
    },
    [bookings, now],
  )

  const value = useMemo(
    () => ({ bookings, now, addBooking }),
    [bookings, now, addBooking],
  )

  return <AppContext value={value}>{children}</AppContext>
}