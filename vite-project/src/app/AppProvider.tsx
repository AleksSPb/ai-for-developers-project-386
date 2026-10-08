import { useCallback, useMemo, useRef, type ReactNode } from 'react'

import { validateGuest } from '../domain/booking'
import { useBookings } from '../app/useBookings'
import type { CreateOutcome, GuestField } from './bookingRefusal'
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
  const { state, create, reload } = useBookings()
  const now = useNow()

  /**
   * Перечитывание всех источников страницы.
   *
   * Реестр, а не список поимённо: страница переходит с экрана на экран, и её набор
   * источников меняется. Список в состоянии тащил бы за собой мёртвые перечитывания
   * ушедшей страницы, и кнопка повтора дёргала бы их после возврата.
   *
   * Последняя зарегистрированная страница и есть текущая: реакции идут строго по
   * одной, и замена реакции происходит на размонтировании предыдущей страницы.
   */
  const reloadPageSources = useRef<(() => void) | null>(null)

  const registerSources = useCallback((reloadAll: () => void) => {
    reloadPageSources.current = reloadAll
  }, [])

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
        return {
          kind: 'отказ',
          refusal: { kind: 'данные', fields: Object.keys(errors) as GuestField[] },
        }
      }

      return create(slot, eventTypeId, guest)
    },
    [create],
  )

  /**
   * Повторить чтение всех источников страницы.
   *
   * Единственный повтор в приложении, и он только по действию гостя: автоматических
   * повторов нет ни одного, иначе приложение долбило бы сервер без участия
   * человека и выдавало бы запись за то, что её кто-то подтвердил.
   */
  const retryAll = useCallback(() => {
    reload()
    reloadPageSources.current?.()
  }, [reload])

  const value = useMemo(
    () => ({
      bookingsState: state,
      bookings: state.kind === 'готов' ? state.value : [],
      now,
      reload,
      addBooking,
      retryAll,
      registerSources,
    }),
    [state, now, reload, addBooking, retryAll, registerSources],
  )

  return <AppContext value={value}>{children}</AppContext>
}