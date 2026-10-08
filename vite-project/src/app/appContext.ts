import { createContext } from 'react'
import type { Booking } from '../domain/booking'
import type { Slot } from '../domain/slots'
import type { CreateOutcome } from './bookingRefusal'
import type { BookingsState } from './useBookings'

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
  /** Перечитать список Броней: он источник приложения, а не страницы. */
  reload: () => void
  addBooking: (
    slot: Slot,
    eventTypeId: string,
    guest: { name: string; email: string },
  ) => Promise<CreateOutcome>
  /**
   * Повторить чтение всех источников — по кнопке гостя.
   *
   * Автоматических повторов нет ни одного: они бы долбили сервер без участия
   * человека и выдавали запись за ту, которую кто-то подтвердил.
   */
  retryAll: () => void
  /**
   * Отдать странице способ перечитать **все её источники**.
   *
   * Кнопка повтора одна и живёт в приложении. На странице она перечитывала бы
   * только то, что увидела бы сама, и правило перестало бы выполняться.
   */
  registerSources: (reloadAll: () => void) => void
}

/**
 * Контекст живёт отдельно от компонента и хука: файл, который экспортирует и
 * компонент, и что-то ещё, ломает Fast Refresh.
 */
export const AppContext = createContext<AppContextValue | null>(null)