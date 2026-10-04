import { describe, expect, it } from 'vitest'

import {
  getTimeZoneOffsetMinutes,
  getZonedDateTime,
  getZonedMinutesOfDay,
  zonedDateTimeToDate,
} from './time'

const moscow = 'Europe/Moscow'

describe('getZonedDateTime', () => {
  it('переводит момент в гражданское время зоны', () => {
    expect(getZonedDateTime(new Date('2026-03-28T06:00:00Z'), moscow)).toEqual({
      year: 2026,
      month: 3,
      day: 28,
      hour: 9,
      minute: 0,
    })
  })

  it('не сдвигает день, когда момент наступает в полночь зоны', () => {
    const parts = getZonedDateTime(new Date('2026-03-27T21:00:00Z'), moscow)
    expect([parts.day, parts.hour, parts.minute]).toEqual([28, 0, 0])
  })
})

describe('getZonedMinutesOfDay', () => {
  it('возвращает минуты от полуночи', () => {
    expect(getZonedMinutesOfDay(new Date('2026-03-28T07:30:00Z'), moscow)).toBe(10 * 60 + 30)
  })
})

describe('getTimeZoneOffsetMinutes', () => {
  it('смещение зоны организатора плюс три часа', () => {
    expect(getTimeZoneOffsetMinutes(new Date('2026-03-28T06:00:00Z'), moscow)).toBe(180)
  })

  it('учитывает переход на летнее время в другой зоне', () => {
    // В Нью-Йорке к марту действует EDT, то есть минус четыре часа.
    expect(getTimeZoneOffsetMinutes(new Date('2026-03-28T12:00:00Z'), 'America/New_York')).toBe(
      -240,
    )
  })

  it('не теряет точность на секундах', () => {
    expect(getTimeZoneOffsetMinutes(new Date('2026-03-28T06:00:37Z'), moscow)).toBe(180)
  })
})

describe('zonedDateTimeToDate', () => {
  it('обратное преобразование сходится в ту же точку', () => {
    const at = new Date('2026-03-28T06:00:00Z')
    const restored = zonedDateTimeToDate(getZonedDateTime(at, moscow), moscow)
    expect(restored.toISOString()).toBe(at.toISOString())
  })

  it('возвращает момент заданного локального времени', () => {
    expect(zonedDateTimeToDate({ year: 2026, month: 3, day: 28, hour: 9, minute: 0 }, moscow)
      .toISOString()).toBe('2026-03-28T06:00:00.000Z')
  })

  it('учитывает смещение зоны, а не только разницу с UTC', () => {
    const at = zonedDateTimeToDate({ year: 2026, month: 3, day: 28, hour: 9, minute: 0 }, moscow)
    expect(getZonedMinutesOfDay(at, moscow)).toBe(9 * 60)
    expect(getZonedMinutesOfDay(at, 'America/New_York')).toBe(2 * 60)
  })
})