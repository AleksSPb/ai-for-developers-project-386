import { intervalsOverlap, type Booking, type Interval } from './booking'
import {
  backMonths,
  dayEndMinutes,
  dayStartMinutes,
  horizonDays,
  organizerTimeZone,
  slotDurationMinutes,
} from './config'
import { getZonedDateTime, zonedDateTimeToDate } from './time'

/**
 * Ключ дня календаря, 'ГГГГ-ММ-ДД' в Таймзоне организатора. В сутках
 * организатора, а не посетителя: см. docs/adr/0003-organizer-timezone-is-a-constant.md.
 */
export type DateKey = string

/** Ключ месяца календаря, 'ГГГГ-ММ'. */
export type MonthKey = string

/** Интервал окна приёма, который Гость занимает целиком. */
export interface Slot extends Interval {
  date: DateKey
}

export const slotStatuses = ['свободен', 'занят', 'прошедший'] as const
export type SlotStatus = (typeof slotStatuses)[number]

const pad = (value: number, length: number): string => String(value).padStart(length, '0')

const dateKeyPattern = /^(\d{4})-(\d{2})-(\d{2})$/

const parseDateKey = (date: DateKey): ZonedDateParts => {
  const match = dateKeyPattern.exec(date)
  if (match === null) {
    throw new Error(`Некорректный ключ дня: ${date}`)
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

interface ZonedDateParts {
  year: number
  month: number
  day: number
}

const formatDateKey = (parts: ZonedDateParts): DateKey =>
  `${pad(parts.year, 4)}-${pad(parts.month, 2)}-${pad(parts.day, 2)}`

/** Ключи с нулями дополнены, поэтому сравниваются как строки. */
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

export const getMonthKey = (date: DateKey): MonthKey => date.slice(0, 7)

export const shiftMonth = (month: MonthKey, delta: number): MonthKey => {
  const [year, number] = month.split('-')
  const shifted = new Date(Date.UTC(Number(year), Number(number) - 1 + delta, 1))
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1, 2)}`
}

/** Сегодняшний день Гостя — в Таймзоне организатора, а не в зоне браузера. */
export const getToday = (now: Date): DateKey =>
  formatDateKey(getZonedDateTime(now, organizerTimeZone))

const slotToDate = (slot: Slot, minutes: number): Date => {
  const parts = parseDateKey(slot.date)
  return zonedDateTimeToDate(
    {
      ...parts,
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
    },
    organizerTimeZone,
  )
}

export const getSlotStart = (slot: Slot): Date => slotToDate(slot, slot.startMinutes)
export const getSlotEnd = (slot: Slot): Date => slotToDate(slot, slot.endMinutes)

/**
 * Все Слоты дня по Правилу расписания, без учёта занятости. Последний Слот
 * заканчивается ровно в конце окна, поэтому слотов ровно
 * `slotsPerDay`, а не на один больше.
 */
export const getDaySlots = (date: DateKey): Slot[] => {
  const slots: Slot[] = []
  for (
    let start = dayStartMinutes;
    start + slotDurationMinutes <= dayEndMinutes;
    start += slotDurationMinutes
  ) {
    slots.push({ date, startMinutes: start, endMinutes: start + slotDurationMinutes })
  }
  return slots
}

/**
 * Статус Слота. Порядок важен: начавшийся Слот нельзя забронировать даже
 * тем, кто пришёл на него раньше, чем он начался.
 */
export const getSlotStatus = (
  slot: Slot,
  bookings: readonly Booking[],
  now: Date,
): SlotStatus => {
  if (getSlotStart(slot).getTime() <= now.getTime()) {
    return 'прошедший'
  }
  const isTaken = bookings.some(
    (booking) => booking.date === slot.date && intervalsOverlap(slot, booking),
  )
  return isTaken ? 'занят' : 'свободен'
}

/** Слоты дня, которые ещё можно забронировать. */
export const getAvailableSlots = (
  date: DateKey,
  bookings: readonly Booking[],
  now: Date,
): Slot[] =>
  getDaySlots(date).filter((slot) => getSlotStatus(slot, bookings, now) === 'свободен')

export const getAvailableSlotCount = (
  date: DateKey,
  bookings: readonly Booking[],
  now: Date,
): number => getAvailableSlots(date, bookings, now).length

/** День внутри горизонта записи: не прошедший и не за его пределами. */
export const isDateSelectable = (date: DateKey, now: Date): boolean => {
  const distance = daysBetween(getToday(now), date)
  return distance >= 0 && distance <= horizonDays
}

/**
 * Месяцы, по которым можно листать: назад `backMonths`, вперёд — до месяца,
 * в котором заканчивается Горизонт записи.
 */
export const getMonthRange = (now: Date): { first: MonthKey; last: MonthKey } => {
  const today = getToday(now)
  return {
    first: shiftMonth(getMonthKey(today), -backMonths),
    last: getMonthKey(addDays(today, horizonDays)),
  }
}

export const isMonthSelectable = (month: MonthKey, now: Date): boolean => {
  const range = getMonthRange(now)
  return month >= range.first && month <= range.last
}

/**
 * День, открытый при входе на страницу записи. Сегодня, если в нём есть
 * свободные Слоты, иначе ближайший следующий, где они есть: вечером иначе
 * Гость увидит пустое место и решит, что сервис сломан.
 */
export const getDefaultDate = (bookings: readonly Booking[], now: Date): DateKey => {
  const today = getToday(now)
  if (getAvailableSlotCount(today, bookings, now) > 0) {
    return today
  }
  for (let offset = 1; offset <= horizonDays; offset += 1) {
    const candidate = addDays(today, offset)
    if (getAvailableSlotCount(candidate, bookings, now) > 0) {
      return candidate
    }
  }
  return today
}