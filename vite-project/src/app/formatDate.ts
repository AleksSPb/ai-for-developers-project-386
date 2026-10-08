import { parseDateKey } from '../domain/calendar'

/**
 * Даты в интерфейсе.
 *
 * Ключ дня превращается в полдень по UTC: у полудня нет риска попасть на
 * соседние сутки при форматировании, и день недели тоже верный. Зона здесь не
 * участвует — дата календаря не зависит от того, кто на неё смотрит.
 */

const dayTitle = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const dayWithYear = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** Полдень по UTC из ключа дня: безопасная точка для форматирования. */
export const asCivilDay = (date: string): Date => {
  const { year, month, day } = parseDateKey(date)
  return new Date(Date.UTC(year, month - 1, day, 12))
}

/** «понедельник, 8 октября». */
export const formatDayTitle = (date: string): string => dayTitle.format(asCivilDay(date))

/** «8 октября 2026 г.». */
export const formatDayWithYear = (date: string): string => dayWithYear.format(asCivilDay(date))