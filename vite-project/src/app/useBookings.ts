import { useCallback, useEffect, useMemo, useState } from 'react'

import { bookingsCreateBooking, bookingsListBookings } from '../api/generated/calendar-api'
import { toDomainBookings } from '../api/bookings'
import type { Booking } from '../domain/booking'
import type { Slot } from '../domain/slots'
import {
  networkRefusal,
  parseCreateResponse,
  type CreateOutcome,
} from './bookingRefusal'

/**
 * Брони на сервере.
 *
 * Клиент больше не решает, свободен Слот или нет: за конфликт отвечает сервер один
 * раз, при создании Брони. Проверка на клиенте была бы второй правдой о том же
 * факте, и она врала бы — слот мог освободиться или занятьcя между проверкой и
 * отправкой.
 */

/**
 * Список Броней: тот же источник, что и у остальных экранов, и те же три состояния.
 *
 * Поля с текстом у отказа нет: текст принадлежит приложению и живёт в
 * `sourceText`. Держать здесь `message` из ответа значило бы дать каждой странице
 * шанс вывести серверную строку, и одна из них рано или поздно её вывела бы.
 */
export type BookingsState =
  | { kind: 'загрузка' }
  | { kind: 'готов'; value: readonly Booking[] }
  | { kind: 'отказ' }

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
            : { kind: 'отказ' },
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
   * Список перечитывается после **любой** попытки — и успешной, и отказанной: он
   * не дополняется на клиенте, потому что между чтением и отправкой Слот мог
   * занять другой гость. Пока список не перечитан, интерфейс предлагал бы занять
   * уже занятое время, а после отказа по занятости не гас бы тот самый Слот, за
   * который гость только что получил отказ.
   */
  const create = useCallback(
    async (
      slot: Slot,
      eventTypeId: string,
      guest: { name: string; email: string },
    ): Promise<CreateOutcome> => {
      /**
       * Единственный `try/catch` в пути записи, и он ловит **отказ запроса**, а не
       * отказ сервера: оборванная сеть не приносит тела, и разбирать нечего. Ответы
       * 4xx и 5xx сюда не попадают — генератор их возвращает.
       *
       * Список перечитывается и после оборванной сети: запись могла создаться, и
       * гость узнает об этом из перечитанного списка, а не из догадки.
       */
      let outcome: CreateOutcome

      try {
        const response = await bookingsCreateBooking({
          eventTypeId,
          timeRange: { start: slot.start.toISOString(), end: slot.end.toISOString() },
          guestName: guest.name.trim(),
          guestEmail: guest.email.trim().toLowerCase(),
        })

        outcome = parseCreateResponse(response)
      } catch {
        outcome = networkRefusal()
      }

      reload()

      return outcome
    },
    [reload],
  )

  return useMemo(() => ({ state, reload, create }), [state, reload, create])
}