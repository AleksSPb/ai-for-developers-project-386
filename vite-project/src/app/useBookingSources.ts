import { useEffect, useState } from 'react'

import { availabilityGetWindows, eventTypeByIdGetEventType } from '../api/generated/calendar-api'
import type { TimeRange } from '../domain/range'
import type { SourceState } from './source'

/**
 * Источники страницы записи.
 *
 * Страница **ждёт все** источники до отрисовки и называет непришедший текстом
 * загрузки: календарь без Окон предложил бы выбрать день, где записаться
 * нельзя, и выглядел бы это как «у Владельца нет времени» — то есть как ложь
 * о сервере.
 */

/**
 * Тип события из адреса.
 *
 * `нет типа` — отдельное состояние, а не отказ. Отказ значит «данные неизвестны»,
 * и про него гость должен узнать вместе с текстом сервера; а вот «Типа по адресу
 * больше нет» — это факт о ссылке, и гостю полагается страница выбора, а не
 * красная плашка.
 */
export type EventTypeSource =
  | { kind: 'загрузка' }
  | { kind: 'готов'; value: { id: string; durationMinutes: number } }
  | { kind: 'нет типа' }
  | { kind: 'отказ'; message: string }

export interface BookingSources {
  windows: SourceState<TimeRange[]>
  eventType: EventTypeSource
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

const readEventType = async (id: string): Promise<EventTypeSource> => {
  const response = await eventTypeByIdGetEventType(id)

  if (response.status === 200) {
    return {
      kind: 'готов',
      value: { id: response.data.id, durationMinutes: response.data.durationMinutes },
    }
  }

  // 404 — это не поломка сервера, а факт: Типа по ссылке больше нет. Гость
  // пришёл по старой ссылке из чата, и показывать ему красную плашку значило бы
  // сказать, что сервер недоступен.
  if (response.status === 404) {
    return { kind: 'нет типа' }
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