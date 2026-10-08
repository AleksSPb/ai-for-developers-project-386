import { describe, expect, it } from 'vitest'
import { getCalendarBounds, getMonthDayCells, getMonthOptions } from './calendarView'
import type { DateKey } from '../domain/calendar'
import type { TimeRange } from '../domain/range'
import type { Booking } from '../domain/booking'

/**
 * Сборка Календаря из окон: границы, месяцы и ячейки дней.
 *
 * Здесь три решения, которые легко перепутать между собой:
 *
 * - левая граница — сегодня, правая — последний день **со Слотом**;
 * - для окна, кончающегося ровно в полночь, это разные даты, и рисуется
 *   предыдущий день;
 * - день, где окно есть, но Тип в него не помещается, отличается от дня, где
 *   окна нет вовсе, — иначе подсказка вводила бы в заблуждение.
 */

const windowBetween = (startIso: string, endIso: string): TimeRange => ({
  start: new Date(startIso),
  end: new Date(endIso),
})

const nineHourWindow = (date: string): TimeRange =>
  windowBetween(`${date}T06:00:00.000Z`, `${date}T15:00:00.000Z`)

const booking = (range: TimeRange, id = 'b1'): Booking => ({
  id,
  eventTypeId: 'consultation',
  start: range.start,
  end: range.end,
  guestName: 'Гость',
  guestEmail: 'guest@example.com',
  createdAt: '2026-10-01T10:00:00.000Z',
})

const TODAY: DateKey = '2026-10-08'
const NOW = new Date('2026-10-08T06:00:00.000Z')
const ZONE = 'Europe/Moscow'

describe('границы Календаря', () => {
  it('слева сегодня, справа последний день со Слотом', () => {
    const bounds = getCalendarBounds({
      windows: [nineHourWindow('2026-10-08'), nineHourWindow('2026-10-20')],
      durationMinutes: 60,
      now: NOW,
      timeZone: ZONE,
    })

    expect(bounds).toEqual({ first: '2026-10-08', last: '2026-10-20' })
  })

  it('окно, кончающееся в полночь, обрезает месяц предыдущим днём', () => {
    const bounds = getCalendarBounds({
      // 17:00Z–21:00Z — это 20:00–00:00 по Москве, то есть окно, кончающееся
      // ровно в полночь. Финиш в 21:00Z, а не в 00:00Z: по Москве 00:00Z уже
      // третий час следующих суток, и полночью это не было бы.
      windows: [windowBetween('2026-10-08T17:00:00.000Z', '2026-10-08T21:00:00.000Z')],
      durationMinutes: 60,
      now: NOW,
      timeZone: ZONE,
    })

    // Окно 20:00–00:00: последний Слот 23:00–00:00 начался 8-го, поэтому день
    // со Слотом — 8-й, и 9-е в календарь не попадает.
    expect(bounds.last).toBe('2026-10-08')
  })

  it('окно в прошлом не тянет Календарь назад', () => {
    const bounds = getCalendarBounds({
      windows: [nineHourWindow('2026-10-01'), nineHourWindow('2026-10-20')],
      durationMinutes: 60,
      now: NOW,
      timeZone: ZONE,
    })

    expect(bounds.first).toBe('2026-10-08')
  })

  it('без окон правая граница равна сегодняшнему дню', () => {
    const bounds = getCalendarBounds({ windows: [], durationMinutes: 60, now: NOW, timeZone: ZONE })

    expect(bounds).toEqual({ first: TODAY, last: TODAY })
  })
})

describe('месяцы Календаря', () => {
  const months = getMonthOptions({
    windows: [nineHourWindow('2026-10-08'), nineHourWindow('2026-10-20')],
    durationMinutes: 60,
    now: NOW,
    timeZone: ZONE,
  })

  it('открывает месяц с окнами и не предлагает прошедший', () => {
    expect(months).toEqual(['2026-10'])
  })

  it('месяц без окон не предлагается', () => {
    const december = getMonthOptions({
      windows: [nineHourWindow('2026-10-08')],
      durationMinutes: 60,
      now: NOW,
      timeZone: ZONE,
    })

    expect(december).not.toContain('2026-12')
  })
})

describe('ячейки дней', () => {
  const windows = [nineHourWindow('2026-10-08'), nineHourWindow('2026-10-09')]
  const month = '2026-10'
  const bounds = { first: '2026-10-08' as DateKey, last: '2026-10-31' as DateKey }

  const cellOn = (
    date: DateKey,
    overrides: Partial<Parameters<typeof getMonthDayCells>[0]> = {},
  ) =>
    getMonthDayCells(
      { windows, durationMinutes: 60, bookings: [], now: NOW, timeZone: ZONE, ...overrides },
      month,
      bounds,
    )[date]

  it('день без окна даёт состояние «нет окна»', () => {
    expect(cellOn('2026-10-15').state).toEqual({ kind: 'нет окна' })
  })

  it('окно короче длительности даёт «тип не помещается», а не «нет окна»', () => {
    const short = [windowBetween('2026-10-15T09:00:00.000Z', '2026-10-15T09:30:00.000Z')]

    expect(cellOn('2026-10-15', { windows: short }).state).toEqual({ kind: 'тип не помещается' })
  })

  it('полностью занятый день даёт «занято»', () => {
    const allSlotsTaken = Array.from({ length: 9 }, (_, index) =>
      booking(
        {
          start: new Date(Date.UTC(2026, 9, 9, 6 + index)),
          end: new Date(Date.UTC(2026, 9, 9, 7 + index)),
        },
        `b${index}`,
      ),
    )

    expect(cellOn('2026-10-09').state).toEqual({ kind: 'доступен', available: 9 })
    expect(cellOn('2026-10-09', { bookings: allSlotsTaken }).state).toEqual({ kind: 'занято' })
  })

  it('в ячейке гаснущего дня нет подписи, различие несёт подсказка', () => {
    const cell = cellOn('2026-10-15')

    expect(cell.state).not.toEqual({ kind: 'доступен', available: expect.anything() })
    expect(cell.slots).toHaveLength(0)
  })

  it('подсказки четырёх недоступных состояний не совпадают', () => {
    const allSlotsTaken = Array.from({ length: 9 }, (_, index) =>
      booking(
        {
          start: new Date(Date.UTC(2026, 9, 9, 6 + index)),
          end: new Date(Date.UTC(2026, 9, 9, 7 + index)),
        },
        `t${index}`,
      ),
    )

    const noWindow = cellOn('2026-10-15', { windows: [] })
    const tooShort = cellOn('2026-10-15', {
      windows: [windowBetween('2026-10-15T09:00:00.000Z', '2026-10-15T09:30:00.000Z')],
    })
    const fullyTaken = cellOn('2026-10-09', { bookings: allSlotsTaken })
    const allPast = cellOn('2026-10-08', {
      windows: [windowBetween('2026-10-08T03:00:00.000Z', '2026-10-08T04:00:00.000Z')],
    })

    const kinds = [noWindow, tooShort, fullyTaken, allPast].map((cell) => cell.state.kind)
    expect(new Set(kinds).size).toBe(4)
  })

  it('доступный день несёт число свободных Слотов', () => {
    expect(cellOn('2026-10-09').state).toEqual({ kind: 'доступен', available: 9 })
  })
})