import { getDateKey, getMonthKey, shiftMonth, type DateKey, type MonthKey } from '../domain/calendar'
import { getDayState, type DayState } from '../domain/day'
import { getMonthCells, getMonthTitleRange, getVisibleDays } from '../domain/month'
import { getSlotsForDay, type Slot } from '../domain/slots'
import type { TimeRange } from '../domain/range'
import type { Booking } from '../domain/booking'

/**
 * Сборка Календаря из Окон приёма.
 *
 * Здесь собирается всё, что до этого держали константы расписания: границы,
 * месяцы, Слоты дня и состояние дня. Правило расписания приходит с сервера
 * (окна) и из Типа события (длительность), а делится на Слоты здесь.
 *
 * День определяется **началом** Слота, поэтому окно через полночь даёт Слоты в
 * обоих днях, а Слот, кончающийся в полночь, остаётся в дне своего начала.
 */

export interface CalendarInput {
  windows: readonly TimeRange[]
  durationMinutes: number
  /**
   * Брони нужны только состоянию дня. Границы и месяцы от них не зависят, поэтому
   * при вызове без Броней поле необязательно — иначе вызывающий, которому они не
   * нужны, всё равно обязан был бы передавать пустой список.
   */
  bookings?: readonly Booking[]
  now: Date
  /** Зона Гостя: дни и «сегодня» считаются в ней. */
  timeZone: string
}

export interface CalendarBounds {
  first: DateKey
  last: DateKey
}

const dayOf = (timeZone: string) => (at: Date): DateKey => getDateKey(at, timeZone)

/** Все Слоты Календаря из всех окон, отсортированные по началу. */
const allSlots = (input: CalendarInput): Slot[] =>
  getSlotsForDay(input.windows, input.durationMinutes, () => true)

/**
 * Границы Календаря: слева сегодня, справа последний день со Слотом.
 *
 * Правая граница — это последний день **начала** Слота. Для окна, кончающегося
 * ровно в полночь, это на сутки раньше даты конца окна, и рисуется именно он.
 *
 * Окна в прошлом не двигают левую границу: Гость не листает вчерашний день.
 */
export const getCalendarBounds = (input: CalendarInput): CalendarBounds => {
  const dayKey = dayOf(input.timeZone)
  const today = dayKey(input.now)
  const slots = allSlots(input).filter((slot) => dayKey(slot.start) >= today)
  const last = slots.length === 0 ? today : dayKey(slots.at(-1)!.start)

  return { first: today, last }
}

/**
 * Месяцы, которые можно листать: от месяца сегодняшнего дня до месяца,
 * последнего дня со Слотом.
 *
 * Прошедшего месяца не существует вовсе, а месяца без окон — тоже: листать
 * некуда, и пустая сетка выглядела бы как «у Владельца нет времени».
 */
export const getMonthOptions = (input: CalendarInput): MonthKey[] => {
  const { first, last } = getCalendarBounds(input)
  const months: MonthKey[] = []
  let month = getMonthKey(first)

  while (month <= getMonthKey(last)) {
    months.push(month)
    month = shiftMonth(month, 1)
  }

  return months
}

export interface DayCell {
  date: DateKey
  slots: Slot[]
  state: DayState
  /** Есть ли в этот день окно приёма, даже если Слотов из него не вышло. */
  hasWindow: boolean
}

/**
 * День, открытый при входе на страницу.
 *
 * Первый доступный день, а не просто сегодня: вечером сегодняшний день может
 * быть уже недоступен, и Гость увидел бы пустой список Слотов и решил, что
 * сервис сломан. Первый день со свободными Слотами всегда существует — иначе
 * границ Календаря не было бы.
 */
export const getDefaultDate = (cells: Record<DateKey, DayCell>): DateKey | null => {
  const available = Object.values(cells)
    .filter((cell) => cell.state.kind === 'доступен')
    .sort((a, b) => (a.date < b.date ? -1 : 1))

  return available[0]?.date ?? null
}

/** Ячейки дней месяца: состояние и Слоты каждого дня по ключу дня. */
export const getDayCells = (input: CalendarInput): Record<DateKey, DayCell> => {
  const dayKey = dayOf(input.timeZone)
  const slots = allSlots(input)
  const byDay = new Map<DateKey, Slot[]>()

  for (const slot of slots) {
    const key = dayKey(slot.start)
    const collected = byDay.get(key)

    if (collected === undefined) {
      byDay.set(key, [slot])
    } else {
      collected.push(slot)
    }
  }

  const days = [...byDay.keys()]

  // Дни, где окно есть, но Слотов не вышло: без них «тип не помещается» не
  // отличилось бы от «окна нет», а это два разных объяснения для Гостя.
  for (const window of input.windows) {
    const key = dayKey(window.start)

    if (!byDay.has(key) && !days.includes(key)) {
      days.push(key)
    }
  }

  const cells: Record<DateKey, DayCell> = {}

  for (const date of days) {
    const daySlots = byDay.get(date) ?? []
    cells[date] = {
      date,
      slots: daySlots,
      hasWindow: input.windows.some((window) => dayKey(window.start) === date),
      state: getDayState({
        slots: daySlots,
        hasWindow: input.windows.some((window) => dayKey(window.start) === date),
        bookings: input.bookings ?? [],
        now: input.now,
      }),
    }
  }

  return cells
}

/**
 * Ячейки всех дней месяца, что попадают в границы Календаря.
 *
 * Дни без окон тоже получают ячейку — со состоянием «нет окна». Без этого день
 * не отличался бы от отсутствующего, и календарь молчал бы там, где на самом деле
 * просто не ведётся приём.
 */
export const getMonthDayCells = (
  input: CalendarInput,
  month: MonthKey,
  bounds: CalendarBounds,
): Record<DateKey, DayCell> => {
  const cells = getDayCells(input)
  const filled: Record<DateKey, DayCell> = { ...cells }

  for (const date of getVisibleDays(
    getMonthCells(month, bounds.first, bounds.last),
  )) {
    filled[date] ??= {
      date,
      slots: [],
      hasWindow: false,
      state: { kind: 'нет окна' },
    }
  }

  return filled
}

export { getMonthCells, getMonthTitleRange }