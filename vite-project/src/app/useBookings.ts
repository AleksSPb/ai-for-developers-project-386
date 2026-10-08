import { useCallback, useEffect, useMemo, useState } from 'react'

import { bookingsCreateBooking, bookingsListBookings } from '../api/generated/calendar-api'
import { toDomainBookings } from '../api/bookings'
import type { Booking } from '../domain/booking'
import type { Slot } from '../domain/slots'

/**
 * Брони на сервере.
 *
 * Клиент больше не решает, свободен Слот или нет: за конфликт отвечает сервер один
 * раз, при создании Брони. Проверка на клиенте была бы второй правдой о том же
 * факте, и она врала бы — слот мог освободиться или занятьcя между проверкой и
 * отправкой.
 */

export type BookingsState =
  | { kind: 'загрузка' }
  | { kind: 'готов'; value: readonly Booking[] }
  | { kind: 'отказ'; message: string }

export interface CreateResult {
  ok: boolean
  /** Текст отказа сервера, если он был. */
  message?: string
}

interface Loaded {
  /** Номер выгрузки: состояние показывается, только если оно свежее. */
  version: number
  state: BookingsState
}

const emptyState: BookingsState = { kind: 'загрузка' }

export const useBookings = () => {
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [version, setVersion] = useState(0)

  /**
   * «Загрузка» **выводится** из несовпадения номеров, а не ставится эффектом.
   * Так состояние «загрузка» появляется сразу при перечитывании, и лишнего
   * рендера не происходит.
   */
  const state: BookingsState = loaded?.version === version ? loaded.state : emptyState

  useEffect(() => {
    let isCurrent = true

    const load = async () => {
      const response = await bookingsListBookings()

      if (!isCurrent) {
        return
      }

      setLoaded({
        version,
        state:
          response.status === 200
            ? { kind: 'готов', value: toDomainBookings(response.data) }
            : { kind: 'отказ', message: response.data.message },
      })
    }

    void load()

    // Отмена на размонтировании и при новой выгрузке: пришедший позже ответ не
    // должен перезаписать более свежий.
    return () => {
      isCurrent = false
    }
  }, [version])

  const reload = useCallback(() => setVersion((current) => current + 1), [])

  /**
   * Создать Бронь.
   *
   * После успеха список **перечитывается**, а не дополняется на клиенте: иначе в
   * двух вкладках разошлись бы и список, и счётчики занятости.
   */
  const create = useCallback(
    async (slot: Slot, eventTypeId: string, guest: { name: string; email: string }): Promise<CreateResult> => {
      const response = await bookingsCreateBooking({
        eventTypeId,
        timeRange: { start: slot.start.toISOString(), end: slot.end.toISOString() },
        guestName: guest.name.trim(),
        guestEmail: guest.email.trim().toLowerCase(),
      })

      if (response.status === 201) {
        reload()
        return { ok: true }
      }

      return { ok: false, message: response.data.message }
    },
    [reload],
  )

  return useMemo(() => ({ state, reload, create }), [state, reload, create])
}