import { isEmptyRange, type TimeRange } from './range'

/**
 * Деление Окна приёма на Слоты — Правило расписания, досчитанное в коде.
 *
 * Считается от **начала окна**, а не от полуночи дня: сервер не знает правила
 * «начало окна плюс k × длительность», поэтому и привязки к сетке в контракте
 * нет. Каждое окно делится само по себе, и два окна в один день дают два
 * независимых списка.
 *
 * Деление не нацело: хвост короче длительности остаётся ничем и не
 * превращается в Слот, который не помещается в окно.
 */

/**
 * Слот, который занимается целиком.
 *
 * Отдельного интервала у Слота нет: он и есть пара моментов. Имя нужно только
 * затем, чтобы список Слотов читался как список Слотов, а не как список дат.
 */
export type Slot = TimeRange

const minuteMs = 60_000

/**
 * Слоты одного окна приёма.
 *
 * Порядок устойчив: два вызова подряд дают один и тот же список, иначе Слоты
 * прыгали бы под курсором у Гостя.
 */
export const divideWindowIntoSlots = (
  window: TimeRange,
  durationMinutes: number,
): Slot[] => {
  const durationMs = durationMinutes * minuteMs

  if (durationMs <= 0 || isEmptyRange(window)) {
    return []
  }

  const slots: Slot[] = []
  const windowEnd = window.end.getTime()

  // Условие на `end`, а не на `start`: Слот, кончающийся ровно в конце окна,
  // помещается целиком и потому существует.
  for (let start = window.start.getTime(); start + durationMs <= windowEnd; start += durationMs) {
    slots.push({ start: new Date(start), end: new Date(start + durationMs) })
  }

  return slots
}

/**
 * Слоты дня из окон, которые в этот день попадают.
 *
 * Окно через полночь даёт Слоты в **обоих** днях, и ни один не теряется:
 * день определяется началом Слота, поэтому Слот 23:00–00:00 остаётся в первых
 * сутках, а 00:00–01:00 попадает во вторые.
 *
 * Окна сортируются по началу, а ответ идёт по Слотам: два окна в один день дают
 * один плоский список, без разделителей и заголовков.
 */
export const getSlotsForDay = (
  windows: readonly TimeRange[],
  durationMinutes: number,
  isWithinDay: (slot: Slot) => boolean,
): Slot[] => {
  const slots: Slot[] = []

  for (const window of [...windows].sort((a, b) => a.start.getTime() - b.start.getTime())) {
    slots.push(...divideWindowIntoSlots(window, durationMinutes))
  }

  return slots.filter(isWithinDay).sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** Дни, в которые попадает хотя бы один Слот. */
export const getDaysWithSlots = (
  slots: readonly Slot[],
  dayOf: (slot: Slot) => string,
): string[] => [...new Set(slots.map(dayOf))]