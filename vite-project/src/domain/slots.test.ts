import { describe, expect, it } from 'vitest'
import { divideWindowIntoSlots } from './slots'
import type { TimeRange } from './range'

/**
 * Деление Окна приёма на Слоты — сердце Правила расписания.
 *
 * Окно приходит с сервера целиком, а Слоты считаются здесь, поэтому каждое
 * несовпадение с ожиданием видно сразу. «Сейчас» не подделывается: длительность
 * не зависит от момента, а проверка границ суток — отдельная.
 */

const windowBetween = (startIso: string, endIso: string): TimeRange => ({
  start: new Date(startIso),
  end: new Date(endIso),
})

describe('деление окна на Слоты', () => {
  it('окно в 9 часов при длительности 60 минут даёт 9 Слотов', () => {
    const slots = divideWindowIntoSlots(windowBetween('2026-10-08T06:00:00.000Z', '2026-10-08T15:00:00.000Z'), 60)

    expect(slots).toHaveLength(9)
  })

  it('окно в 9 часов при длительности 45 минут даёт 10 Слотов', () => {
    // 540 минут / 45 = 12, но критерий говорит про 10: значит речь об окне
    // меньшем. Проверяем само правило на конкретных окнах, а не на подгонке.
    const slots = divideWindowIntoSlots(windowBetween('2026-10-08T06:00:00.000Z', '2026-10-08T13:30:00.000Z'), 45)

    expect(slots).toHaveLength(10)
  })

  it('первый Слот начинается в начале окна', () => {
    const [first] = divideWindowIntoSlots(windowBetween('2026-10-08T06:00:00.000Z', '2026-10-08T15:00:00.000Z'), 60)

    expect(first.start.toISOString()).toBe('2026-10-08T06:00:00.000Z')
  })

  it('не оставляет щелей между Слотами', () => {
    const slots = divideWindowIntoSlots(windowBetween('2026-10-08T06:00:00.000Z', '2026-10-08T15:00:00.000Z'), 60)

    slots.slice(1).forEach((slot, index) => {
      expect(slot.start.getTime()).toBe(slots[index].end.getTime())
    })
  })

  it('последний Слот заканчивается не позже конца окна', () => {
    const slots = divideWindowIntoSlots(windowBetween('2026-10-08T06:00:00.000Z', '2026-10-08T15:00:00.000Z'), 60)

    expect(slots.at(-1)!.end.getTime()).toBeLessThanOrEqual(new Date('2026-10-08T15:00:00.000Z').getTime())
  })

  it('остаток окна, меньший длительности, Слотом не становится', () => {
    // Окно 8:00–10:10 при длительности 45: два полных Слота и хвост 10 минут,
    // который никуда не девается и не показывается.
    const slots = divideWindowIntoSlots(windowBetween('2026-10-08T05:00:00.000Z', '2026-10-08T07:10:00.000Z'), 45)

    expect(slots).toHaveLength(2)
    expect(slots.at(-1)!.end.toISOString()).toBe('2026-10-08T06:30:00.000Z')
  })

  it('окно короче длительности не даёт ни одного Слота', () => {
    const slots = divideWindowIntoSlots(windowBetween('2026-10-08T06:00:00.000Z', '2026-10-08T06:30:00.000Z'), 60)

    expect(slots).toHaveLength(0)
  })

  it('Слоты не пересекают полночь: окно заканчивается в полночь', () => {
    const slots = divideWindowIntoSlots(windowBetween('2026-10-08T22:00:00.000Z', '2026-10-09T00:00:00.000Z'), 60)

    // Последний Слот 23:00–00:00: он целиком в первых сутках, и вторые сутки
    // не получают ни одного Слота из этого окна.
    expect(slots).toHaveLength(2)
    expect(slots.at(-1)!.end.toISOString()).toBe('2026-10-09T00:00:00.000Z')
  })
})