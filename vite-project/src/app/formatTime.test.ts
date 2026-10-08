import { describe, expect, it } from 'vitest'
import { formatSlotRange, formatTime } from './formatTime'
import type { Slot } from '../domain/slots'

/**
 * Время в интерфейсе — в зоне Гостя.
 *
 * Проверяем на зоне, отличной от зоны окна: если бы форматирование брало
 * смещение машины, тесты на машине разработчика проходили бы, а у Гостя в
 * другом городе показывалось бы другое время.
 */

const MOSCOW = 'Europe/Moscow'
const LISBON = 'Europe/Lisbon'

const slotAt = (startIso: string, endIso: string): Slot => ({
  start: new Date(startIso),
  end: new Date(endIso),
})

describe('formatTime', () => {
  it('показывает время в указанной зоне', () => {
    // 06:00 UTC — это 09:00 по Москве и 07:00 по Лиссабону.
    const moment = new Date('2026-10-08T06:00:00.000Z')

    expect(formatTime(moment, MOSCOW)).toBe('09:00')
    expect(formatTime(moment, LISBON)).toBe('07:00')
  })

  it('полночь показывает как 00:00, а не как 24:00', () => {
    expect(formatTime(new Date('2026-10-08T21:00:00.000Z'), MOSCOW)).toBe('00:00')
  })
})

describe('formatSlotRange', () => {
  it('показывает начало и конец в зоне Гостя', () => {
    const slot = slotAt('2026-10-08T06:00:00.000Z', '2026-10-08T06:30:00.000Z')

    expect(formatSlotRange(slot, MOSCOW)).toBe('09:00 – 09:30')
  })

  it('Слот, кончающийся в полночь, показывает конец как 00:00', () => {
    const slot = slotAt('2026-10-08T20:00:00.000Z', '2026-10-08T21:00:00.000Z')

    expect(formatSlotRange(slot, MOSCOW)).toBe('23:00 – 00:00')
  })

  it('разные зоны дают разный диапазон одного и того же Слота', () => {
    const slot = slotAt('2026-10-08T06:00:00.000Z', '2026-10-08T07:00:00.000Z')

    expect(formatSlotRange(slot, MOSCOW)).toBe('09:00 – 10:00')
    expect(formatSlotRange(slot, LISBON)).toBe('07:00 – 08:00')
  })
})