import { getZonedDateTime } from '../domain/time'
import type { Slot } from '../domain/slots'

/**
 * Время в интерфейсе — в Местном времени гостя, то есть в зоне браузера.
 *
 * Гость смотрит на своё местное время, и называть ему чужую зону не о чем: если
 * он в Лиссабоне, то «09:00» у него и есть 09:00. Зона организатора в интерфейсе
 * не показывается вовсе, о ней сообщают там, где это касается Владельца.
 *
 * Имя зоны берётся из `Intl`, а не из смещения машины: смещение одно, а зона
 * одна — и именно зона переживает переход на летнее время.
 */

const pad = (value: number): string => String(value).padStart(2, '0')

/** «09:30» в указанной зоне. */
export const formatTime = (at: Date, timeZone: string): string => {
  const { hour, minute } = getZonedDateTime(at, timeZone)
  return `${pad(hour)}:${pad(minute)}`
}

/**
 * Диапазон Слота: «09:30 – 10:30».
 *
 * Конец Слота, кончающегося ровно в полночь, показывается как `00:00`, а не как
 * пустота и не как «24:00»: сутки, в которые Слот начался, кончились, но Слот
 * целиком в них помещается.
 */
export const formatSlotRange = (slot: Slot, timeZone: string): string =>
  `${formatTime(slot.start, timeZone)} – ${formatTime(slot.end, timeZone)}`

export const formatSlotDuration = (durationMinutes: number): string =>
  `${durationMinutes} мин`

export const formatSlotCount = (count: number): string => `${count} св.`