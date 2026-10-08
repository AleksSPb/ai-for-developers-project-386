import { useCallback, useMemo, type ReactNode } from 'react'

import { validateGuest } from '../domain/booking'
import { useBookings } from '../app/useBookings'
import type { CreateOutcome } from './bookingRefusal'
import { useNow } from './useNow'
import { AppContext } from './appContext'

/**
 * Состояние приложения.
 *
 * Брони живут на сервере: провайдер читает их списком и создаёт запросом.
 * Проверки конфликта на клиенте нет **намеренно** — за конфликт отвечает сервер
 * один раз, при создании. Проверка на клиенте была бы второй правдой о том же
 * факте и успела бы состариться: между проверкой и отправкой слот мог занять
 * другой гость.
 */
export interface AppProviderProps {
  children: ReactNode
}

export const AppProvider = ({ children }: AppProviderProps) => {
  const { state, create } = useBookings()
  const now = useNow()

  /**
   * Забронировать Слот.
   *
   * Единственная проверка перед отправкой — форма Гостя: пустое имя или почту
   * сервер тоже отвергнет, но ждать ответа ради заведомо плохих данных незачем.
   *
   * Проверки конфликта здесь нет и не планируется: за конфликт отвечает сервер
   * один раз. Клиентская проверка была бы второй правдой о том же факте.
   */
  const addBooking = useCallback(
    async (
      slot: Parameters<typeof create>[0],
      eventTypeId: string,
      guest: { name: string; email: string },
    ): Promise<CreateOutcome> => {
      const errors = validateGuest(guest)

      if (Object.keys(errors).length > 0) {
        return { kind: 'отказ', refusal: { kind: 'данные', fields: Object.keys(errors) } }
      }

      return create(slot, eventTypeId, guest)
    },
    [create],
  )

  const value = useMemo(
    () => ({
      bookingsState: state,
      bookings: state.kind === 'готов' ? state.value : [],
      now,
      addBooking,
    }),
    [state, now, addBooking],
  )

  return <AppContext value={value}>{children}</AppContext>
}