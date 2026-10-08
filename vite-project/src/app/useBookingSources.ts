import { useEffect, useState } from 'react'

import { availabilityGetWindows, eventTypeByIdGetEventType } from '../api/generated/calendar-api'
import type { TimeRange } from '../domain/range'

/**
 * Источники страницы записи.
 *
 * Страница **ждёт все** источники до отрисовки и называет непришедший текстом
 * загрузки: календарь без Окон предложил бы выбрать день, где записаться
 * нельзя, и выглядел бы это как «у Владельца нет времени» — то есть как ложь
 * о сервере.
 *
 * Отдельные состояния, а не один флаг: «грузятся», «пришли» и «сервер отказал»
 * требуют разных слов на экране.
 */

export type SourceState<T> =
  | { kind: 'загрузка' }
  | { kind: 'готов'; value: T }
  | { kind: 'отказ'; message: string }

export interface BookingSources {
  windows: SourceState<TimeRange[]>
  eventType: SourceState<{ id: string; durationMinutes: number }>
}

/** Что именно не пришло: имя источника показывается в тексте загрузки. */
export const sourceLabel: Record<'windows' | 'eventType', string> = {
  windows: 'окна приёма',
  eventType: 'тип события',
}

/** Первый непришедший источник, либо `null`, когда всё готово. */
export const missingSource = (sources: BookingSources): keyof BookingSources | null => {
  if (sources.windows.kind === 'загрузка' || sources.eventType.kind === 'загрузка') {
    return null
  }
  if (sources.windows.kind === 'готов' && sources.eventType.kind === 'готов') {
    return null
  }

  return sources.windows.kind === 'готов' ? 'eventType' : 'windows'
}

const readWindows = async (): Promise<SourceState<TimeRange[]>> => {
  const response = await availabilityGetWindows()

  if (response.status === 200) {
    return {
      kind: 'готов',
      value: response.data.windows.map(({ start, end }) => ({
        start: new Date(start),
        end: new Date(end),
      })),
    }
  }

  return { kind: 'отказ', message: response.data.message }
}

const readEventType = async (
  id: string,
): Promise<SourceState<{ id: string; durationMinutes: number }>> => {
  const response = await eventTypeByIdGetEventType(id)

  if (response.status === 200) {
    return {
      kind: 'готов',
      value: { id: response.data.id, durationMinutes: response.data.durationMinutes },
    }
  }

  return { kind: 'отказ', message: response.data.message }
}

/**
 * Окна приёма и Тип события страницы.
 *
 * Оба источника читаются параллельно, а не по цепочке: загрузка окна и чтение
 * Типа независимы, и по очереди они удвоили бы время до первого ответа.
 */
export const useBookingSources = (eventTypeId: string): BookingSources => {
  const [sources, setSources] = useState<BookingSources>({
    windows: { kind: 'загрузка' },
    eventType: { kind: 'загрузка' },
  })

  useEffect(() => {
    let isCurrent = true

    const load = async () => {
      const [windows, eventType] = await Promise.all([
        readWindows(),
        readEventType(eventTypeId),
      ])

      if (isCurrent) {
        setSources({ windows, eventType })
      }
    }

    void load()

    // Размонтирование и смена Типа обрывают загрузку: пришедший позже ответ
    // не должен перезаписать источники уже другой страницы.
    return () => {
      isCurrent = false
    }
  }, [eventTypeId])

  return sources
}