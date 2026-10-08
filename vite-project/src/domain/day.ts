import { intervalsOverlap, type TimeRange } from './range'
import type { Slot } from './slots'

/**
 * Статус Слота и состояние дня.
 *
 * Занятость — это вопрос пересечения моментов, а не равенства ключей дней. Бронь,
 * начавшаяся в соседнем дне, не занимает Слот, даже если пришлась на тот же час
 * календаря; и наоборот, бронь, перешагнувшая полночь, занимает оба дня сразу.
 */

export const slotStatuses = ['свободен', 'занят', 'прошедший'] as const
export type SlotStatus = (typeof slotStatuses)[number]

/** Момент, на который считается занятость. Всё будущее — свободно по времени. */
export type Now = Date

/**
 * Статус Слота. Порядок важен: начавшийся Слот нельзя забронировать даже тем, кто
 * пришёл на него раньше, чем он начался, поэтому прошедший проверяется первым.
 */
export const getSlotStatus = (
  slot: Slot,
  bookings: readonly TimeRange[],
  now: Now,
): SlotStatus => {
  if (slot.start.getTime() <= now.getTime()) {
    return 'прошедший'
  }

  return bookings.some((booking) => intervalsOverlap(slot, booking)) ? 'занят' : 'свободен'
}

export const isSlotFree = (slot: Slot, bookings: readonly TimeRange[], now: Now): boolean =>
  getSlotStatus(slot, bookings, now) === 'свободен'

/**
 * Состояние дня.
 *
 * `доступен` несёт число свободных Слотов, недоступные состояния — причину.
 * Отдельного статуса дня в модели нет: состояние выведено из Слотов, а слова
 * «занят» и «прошедший» принадлежат Слоту, откуда день их и заимствует.
 */
export type DayState =
  | { kind: 'доступен'; available: number }
  | { kind: 'нет окна' }
  | { kind: 'тип не помещается' }
  | { kind: 'занято' }
  | { kind: 'прошло' }

export interface DayInput {
  /** Слоты дня, уже посчитанные из окон приёма. */
  slots: readonly Slot[]
  /**
   * Было ли в этот день окно приёма, даже если Слотов из него не вышло.
   *
   * Без этого признака «окна не было» и «окно есть, но Тип в него не помещается»
   * неразличимы, а это два разных объяснения для Гостя.
   */
  hasWindow?: boolean
  bookings: readonly TimeRange[]
  now: Now
}

/**
 * Состояние дня по его Слотам.
 *
 * Порядок проверок и есть правило: сначала отсутствие окон, затем прошедшее
 * время, затем занятость. «Прошло» проверяется раньше «занято» намеренно — в
 * сегодняшнем дне различие не видно, и причина угадывается по порядку.
 */
export const getDayState = ({ slots, hasWindow = false, bookings, now }: DayInput): DayState => {
  if (slots.length === 0) {
    return hasWindow ? { kind: 'тип не помещается' } : { kind: 'нет окна' }
  }

  const available = slots.filter((slot) => isSlotFree(slot, bookings, now))

  if (available.length > 0) {
    return { kind: 'доступен', available: available.length }
  }

  // Ни одного свободного Слота остаться не могло: значит все либо заняты, либо
  // прошли. Различие ищется по тому, заняты ли начавшиеся Слоты.
  const started = slots.filter((slot) => slot.start.getTime() <= now.getTime())
  const startedAreTaken = started.some((slot) =>
    bookings.some((booking) => intervalsOverlap(slot, booking)),
  )

  return started.length === slots.length && !startedAreTaken ? { kind: 'прошло' } : { kind: 'занято' }
}

export const isDaySelectable = (state: DayState): boolean => state.kind === 'доступен'

/** Подсказка дня: различие четырёх состояний держит она, а не ячейка. */
export const dayStateHint = (state: DayState): string | null => {
  switch (state.kind) {
    case 'доступен':
      return null
    case 'нет окна':
      return 'В этот день приём не ведётся'
    case 'тип не помещается':
      return 'Окно приёма короче, чем длительность звонка'
    case 'занято':
      return 'Все слоты заняты'
    case 'прошло':
      return 'Все слоты этого дня уже прошли'
  }
}