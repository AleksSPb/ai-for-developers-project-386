/**
 * Отрезок времени — пара моментов.
 *
 * Не минуты от полуночи: минуты от полуночи не выражают окно, перешагнувшее
 * полночь, и привязывают Слоты к таймзоне, которая больше не задана константой.
 * Момент сам несёт своё смещение, поэтому переход на летнее время не требует
 * ничего.
 */
export interface TimeRange {
  start: Date
  end: Date
}

/**
 * Полуоткрытые интервалы: 09:00–09:30 и 09:30–10:00 не пересекаются.
 *
 * Границы не делятся, потому что каждый Слот занимается целиком. Сравнение идёт
 * по моментам, а не по ключам дня: бронь соседнего дня не может пересечься с
 * Слотом просто потому, что оказалась в другой строке таблицы.
 */
export const intervalsOverlap = (a: TimeRange, b: TimeRange): boolean =>
  a.start.getTime() < b.end.getTime() && b.start.getTime() < a.end.getTime()

/** Есть ли среди интервалов пересекающийся с данным. */
export const hasConflict = (candidate: TimeRange, others: readonly TimeRange[]): boolean =>
  others.some((other) => intervalsOverlap(candidate, other))

export const isEmptyRange = (range: TimeRange): boolean =>
  range.end.getTime() <= range.start.getTime()

export const rangeDurationMinutes = (range: TimeRange): number =>
  (range.end.getTime() - range.start.getTime()) / 60_000