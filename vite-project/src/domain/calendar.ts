import { getZonedDateTime, zonedDateTimeToDate } from './time'

/**
 * Ключи дней и месяцев Календаря.
 *
 * День — это `ГГГГ-ММ-ДД` в **Местном времени гостя**, то есть в зоне браузера.
 * Постоянной зоны у расписания нет (ADR-0007): окна приходят с сервера со своими
 * смещениями, и Слоты считаются из них, поэтому дни, в которые попадает Слот,
 * определяются зоной того, кто на них смотрит.
 */

export type DateKey = string
export type MonthKey = string

interface DateParts {
  year: number
  month: number
  day: number
}

const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/

const pad = (value: number, length: number): string => String(value).padStart(length, '0')

export const formatDateKey = (parts: DateParts): DateKey =>
  `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`

/** Разбор ключа дня. Части нужны и форматированию, и арифметике дат. */
export const parseDateKey = (date: DateKey): DateParts => {
  const match = dateKeyPattern.exec(date)

  if (match === null) {
    throw new Error(`Некорректный ключ дня: ${date}`)
  }

  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

export const getMonthKey = (date: DateKey): MonthKey => date.slice(0, 7)

export const parseMonthKey = (month: MonthKey): { year: number; month: number } => {
  const [year, number] = month.split('-')
  return { year: Number(year), month: Number(number) }
}

/** Ключ дня момента в зоне: день человека, а не день UTC. */
export const getDateKey = (at: Date, timeZone: string): DateKey =>
  formatDateKey(getZonedDateTime(at, timeZone))

/** Ключ дня указанного календарного дня в зоне. */
export const getDateKeyOf = (
  date: DateKey,
  hour: number,
  minute: number,
  timeZone: string,
): DateKey => getDateKey(zonedDateTimeToDate({ ...parseDateKey(date), hour, minute }, timeZone), timeZone)

export const addDays = (date: DateKey, days: number): DateKey => {
  const parts = parseDateKey(date)
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days))

  return formatDateKey({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  })
}

export const daysBetween = (from: DateKey, to: DateKey): number => {
  const a = parseDateKey(from)
  const b = parseDateKey(to)
  const fromUtc = Date.UTC(a.year, a.month - 1, a.day)
  const toUtc = Date.UTC(b.year, b.month - 1, b.day)

  return Math.round((toUtc - fromUtc) / 86_400_000)
}

export const shiftMonth = (month: MonthKey, delta: number): MonthKey => {
  const { year, month: monthNumber } = parseMonthKey(month)
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + delta, 1))

  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1, 2)}`
}

export const getDaysInMonth = (month: MonthKey): number => {
  const { year, month: monthNumber } = parseMonthKey(month)
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
}

/** Порядковый номер дня в неделе, понедельник — ноль. */
export const getWeekdayIndex = (date: DateKey): number => {
  const parts = parseDateKey(date)
  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()

  // Сдвиг от понедельника, а не от воскресенья, как в `getUTCDay`.
  return (day + 6) % 7
}

/** Число дня для показа: из ключа, без обращения к зоне. */
export const getDayNumber = (date: DateKey): number => parseDateKey(date).day