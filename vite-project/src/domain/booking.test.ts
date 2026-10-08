import { describe, expect, it } from 'vitest'

import { normalizeGuest, validateGuest, type Booking } from './booking'
import { hasConflict, intervalsOverlap, type TimeRange } from './range'

/**
 * Интервалы — парами моментов.
 *
 * Проверки пересечения переехали сюда из `booking`: они про интервалы вообще, а не
 * про Бронь, и Бронь — лишь один из их пользователей.
 */

const at = (iso: string): Date => new Date(iso)

const range = (startIso: string, endIso: string): TimeRange => ({
  start: at(startIso),
  end: at(endIso),
})

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'b1',
  eventTypeId: 'consultation',
  start: at('2026-10-08T06:00:00.000Z'),
  end: at('2026-10-08T06:30:00.000Z'),
  guestName: 'Demo User',
  guestEmail: 'demo@example.com',
  createdAt: '2026-10-07T14:40:00.000Z',
  ...overrides,
})

describe('intervalsOverlap', () => {
  it('границы не пересекаются: следующий Слот начинается в момент конца', () => {
    expect(
      intervalsOverlap(
        range('2026-10-08T06:00:00.000Z', '2026-10-08T06:30:00.000Z'),
        range('2026-10-08T06:30:00.000Z', '2026-10-08T07:00:00.000Z'),
      ),
    ).toBe(false)
  })

  it('пересекается, если один интервал заходит внутрь другого', () => {
    expect(
      intervalsOverlap(
        range('2026-10-08T06:00:00.000Z', '2026-10-08T07:00:00.000Z'),
        range('2026-10-08T06:15:00.000Z', '2026-10-08T06:45:00.000Z'),
      ),
    ).toBe(true)
  })

  it('интервал через полночь пересекает соседние сутки', () => {
    // Моменты, а не минуты от полуночи: бронь, перешагнувшая полночь, занимает
    // Слот следующих суток, и это раньше было невыразимо.
    const overnight = booking({
      start: at('2026-10-08T21:30:00.000Z'),
      end: at('2026-10-09T00:30:00.000Z'),
    })

    expect(
      hasConflict(range('2026-10-09T00:00:00.000Z', '2026-10-09T01:00:00.000Z'), [overnight]),
    ).toBe(true)
  })
})

describe('hasConflict', () => {
  it('находит пересечение среди Броней', () => {
    expect(hasConflict(range('2026-10-08T06:15:00.000Z', '2026-10-08T06:45:00.000Z'), [booking()])).toBe(true)
  })

  it('не находит пересечения, когда интервалы соседствуют', () => {
    expect(hasConflict(range('2026-10-08T06:30:00.000Z', '2026-10-08T07:00:00.000Z'), [booking()])).toBe(false)
  })

  it('пустой список не создаёт конфликта', () => {
    expect(hasConflict(range('2026-10-08T06:00:00.000Z', '2026-10-08T06:30:00.000Z'), [])).toBe(false)
  })
})

describe('normalizeGuest', () => {
  it('обрезает пробелы и приводит регим почты', () => {
    expect(normalizeGuest({ name: '  Demo User  ', email: '  Demo@Example.COM ' })).toEqual({
      name: 'Demo User',
      email: 'demo@example.com',
    })
  })
})

describe('validateGuest', () => {
  it('принимает заполненные поля', () => {
    expect(validateGuest({ name: 'Demo User', email: 'demo@example.com' })).toEqual({})
  })

  it('требует имя', () => {
    expect(validateGuest({ name: '   ', email: 'demo@example.com' }).name).toBeDefined()
  })

  it('требует почту в формате', () => {
    expect(validateGuest({ name: 'Demo', email: 'demo' }).email).toBeDefined()
    expect(validateGuest({ name: 'Demo', email: 'demo@example' }).email).toBeDefined()
  })

  it('отмечает оба поля сразу', () => {
    const errors = validateGuest({ name: '', email: '' })
    expect(Object.keys(errors).sort()).toEqual(['email', 'name'])
  })
})