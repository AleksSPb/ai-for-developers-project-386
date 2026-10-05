import { describe, expect, it } from 'vitest'

import { hasConflict, intervalsOverlap, normalizeGuest, validateGuest } from './booking'
import type { Booking } from './booking'

const interval = (startMinutes: number, endMinutes: number) => ({ startMinutes, endMinutes })

const booking = (overrides: Partial<Booking> = {}): Booking => ({
  id: 'b1',
  date: '2026-03-28',
  startMinutes: 9 * 60,
  endMinutes: 9 * 60 + 30,
  guestName: 'Demo User',
  guestEmail: 'demo@example.com',
  createdAt: '2026-03-27T14:40:00.000Z',
  ...overrides,
})

describe('intervalsOverlap', () => {
  it('границы не пересекаются: следующий слот начинается в момент конца', () => {
    expect(intervalsOverlap(interval(540, 570), interval(570, 600))).toBe(false)
  })

  it('пересекается, если один интервал заходит внутрь другого', () => {
    expect(intervalsOverlap(interval(540, 570), interval(555, 585))).toBe(true)
  })

  it('полностью вложенный интервал тоже пересекается', () => {
    expect(intervalsOverlap(interval(540, 600), interval(555, 585))).toBe(true)
  })
})

describe('hasConflict', () => {
  it('находит пересечение среди броней', () => {
    expect(hasConflict(interval(555, 585), [booking()])).toBe(true)
  })

  it('не находит пересечения, когда интервалы соседствуют', () => {
    expect(hasConflict(interval(570, 600), [booking()])).toBe(false)
  })

  it('пустой список не создаёт конфликта', () => {
    expect(hasConflict(interval(540, 570), [])).toBe(false)
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