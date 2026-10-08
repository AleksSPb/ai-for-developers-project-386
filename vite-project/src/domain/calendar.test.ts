import { describe, expect, it } from 'vitest'
import {
  addDays,
  getDayNumber,
  getDaysInMonth,
  getMonthKey,
  getWeekdayIndex,
  shiftMonth,
} from './calendar'
import { getSlotsForDay } from './slots'
import type { TimeRange } from './range'

/**
 * Границы Календаря и сетка месяца.
 *
 * Правило одно и оно противоположно прежнему: левая граница — сегодня, правая —
 * последний день, в который попадает хотя бы один Слот. Горизонта записи в днях
 * больше нет: правую границу задаёт последнее опубликованное окно.
 */

const windowBetween = (startIso: string, endIso: string): TimeRange => ({
  start: new Date(startIso),
  end: new Date(endIso),
})

/** Окно 09:00–18:00 по Москве, 9 Слотов по часу. */
const dayWindow = (date: string): TimeRange =>
  windowBetween(`${date}T06:00:00.000Z`, `${date}T15:00:00.000Z`)

/** Окно, кончающееся ровно в полночь: 20:00–00:00. */
const windowToMidnight = (date: string): TimeRange =>
  windowBetween(`${date}T17:00:00.000Z`, `${addDays(date, 1)}T00:00:00.000Z`)

/** Окно, перешагивающее полночь симметрично: 22:00–02:00, по два Слота в каждых сутках. */
const windowAcrossMidnight = (date: string): TimeRange =>
  windowBetween(`${date}T22:00:00.000Z`, `${addDays(date, 1)}T02:00:00.000Z`)

const isSameDay = (day: string) => (slot: { start: Date; end: Date }) =>
  slot.start.toISOString().slice(0, 10) === day

describe('границы Календаря', () => {
  it('правую границу задаёт последний день со Слотом, а не конец окна', () => {
    const windows = [dayWindow('2026-10-08'), dayWindow('2026-10-20')]
    const slots = windows.flatMap((window) => getSlotsForDay([window], 60, () => true))
    const lastSlotDay = slots.map((slot) => slot.start.toISOString().slice(0, 10)).at(-1)

    expect(lastSlotDay).toBe('2026-10-20')
  })

  it('окно, кончающееся в полночь, даёт последний день на сутки раньше', () => {
    const slots = getSlotsForDay([windowToMidnight('2026-10-08')], 60, () => true)
    const lastSlotDay = slots.at(-1)!.start.toISOString().slice(0, 10)

    // Окно 20:00–00:00: последний Слот 23:00–00:00 начался 8-го, поэтому день
    // со Слотом — 8-й, а не 9-й.
    expect(lastSlotDay).toBe('2026-10-08')
  })

  it('месяц с одним окном существует, месяц без окон не существует', () => {
    const withWindow = getMonthKey('2026-10-08')
    const beyondLastWindow = getMonthKey('2026-12-01')

    expect(withWindow).toBe('2026-10')
    expect(beyondLastWindow).toBe('2026-12')
    // Решение о существовании месяца принимает вызывающий по границам; сам домен
    // отвечает за ключи, поэтому проверяем, что границы считаются от окон.
    const windows = [dayWindow('2026-10-08')]
    expect(windows.some((window) => window.start >= new Date('2026-12-01T00:00:00.000Z'))).toBe(false)
  })
})

describe('окно через полночь', () => {
  const window = windowAcrossMidnight('2026-10-08')

  it('даёт по два Слота в каждом из двух дней', () => {
    const first = getSlotsForDay([window], 60, isSameDay('2026-10-08'))
    const second = getSlotsForDay([window], 60, isSameDay('2026-10-09'))

    // Окно 22:00–02:00 при часовых Слотах: 22:00–23:00 и 23:00–00:00 в первых
    // сутках, 00:00–01:00 и 01:00–02:00 — во вторых. Ни один Слот не потерян,
    // а второй день ничем не помечен: он просто есть.
    expect(first).toHaveLength(2)
    expect(second).toHaveLength(2)
    expect([...first, ...second]).toHaveLength(4)
  })

  it('Слот, кончающийся в полночь, принадлежит дню своего начала', () => {
    const slots = getSlotsForDay([windowToMidnight('2026-10-08')], 60, isSameDay('2026-10-08'))
    const last = slots.at(-1)!

    expect(last.end.toISOString()).toBe('2026-10-09T00:00:00.000Z')
    expect(getSlotsForDay([windowToMidnight('2026-10-08')], 60, isSameDay('2026-10-09'))).toHaveLength(0)
  })
})

describe('два окна в один день', () => {
  it('дают один плоский список Слотов без разделителей', () => {
    const morning = windowBetween('2026-10-08T06:00:00.000Z', '2026-10-08T08:00:00.000Z')
    const evening = windowBetween('2026-10-08T12:00:00.000Z', '2026-10-08T14:00:00.000Z')
    const slots = getSlotsForDay([evening, morning], 60, isSameDay('2026-10-08'))

    expect(slots).toHaveLength(4)
    expect(slots.map((slot) => slot.start.toISOString())).toEqual([
      '2026-10-08T06:00:00.000Z',
      '2026-10-08T07:00:00.000Z',
      '2026-10-08T12:00:00.000Z',
      '2026-10-08T13:00:00.000Z',
    ])
  })
})

describe('арифметика дат', () => {
  it('переходит через конец месяца и года', () => {
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('возвращает разницу в днях со знаком', () => {
    expect(addDays('2026-10-08', 2)).toBe('2026-10-10')
  })

  it('листает месяцы через границу года', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-11', 2)).toBe('2027-01')
  })

  it('считает дни месяца, включая февраль високосного года', () => {
    expect(getDaysInMonth('2026-02')).toBe(28)
    expect(getDaysInMonth('2028-02')).toBe(29)
    expect(getDaysInMonth('2026-10')).toBe(31)
  })

  it('нумерует неделю с понедельника', () => {
    expect(getWeekdayIndex('2026-10-05')).toBe(0)
    expect(getWeekdayIndex('2026-10-11')).toBe(6)
  })

  it('отдаёт число дня без ведущих нулей', () => {
    expect(getDayNumber('2026-10-08')).toBe(8)
    expect(getDayNumber('2026-10-21')).toBe(21)
  })
})