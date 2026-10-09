import { describe, expect, it } from 'vitest'
import { dayStateHint, getDayState, getSlotStatus, type DayState } from './day'
import type { TimeRange } from './range'
import type { Slot } from './slots'

/**
 * Состояние дня и статус Слота.
 *
 * Слова «занят» и «прошедший» принадлежат Слоту, а день заимствует их: отдельного
 * статуса дня в модели нет. Четыре состояния дня различаются только подсказкой —
 * в самой ячейке они неразличимы, потому что ячейка гаснет, а подпись в ней
 * отвергается вместе с ценой.
 */

/** 09:00 по Москве. Первый Слот дня к этому моменту уже начался. */
const NOW = new Date('2026-10-08T06:00:00.000Z')

const slot = (startIso: string, minutes = 60): Slot => ({
  start: new Date(startIso),
  end: new Date(new Date(startIso).getTime() + minutes * 60_000),
})

const bookingOver = (range: TimeRange): TimeRange & { id: string } => ({
  id: 'booking-1',
  start: range.start,
  end: range.end,
})

describe('getSlotStatus', () => {
  it('начавшийся Слот прошедший, даже когда свободен', () => {
    expect(getSlotStatus(slot('2026-10-08T06:00:00.000Z'), [], NOW)).toBe('прошедший')
  })

  it('будущий Слот свободен', () => {
    expect(getSlotStatus(slot('2026-10-08T09:00:00.000Z'), [], NOW)).toBe('свободен')
  })

  it('пересекающийся интервал делает Слот занятым', () => {
    const target = slot('2026-10-08T09:00:00.000Z')

    expect(getSlotStatus(target, [bookingOver(slot('2026-10-08T09:30:00.000Z'))], NOW)).toBe('занят')
  })

  it('интервал в соседнем дне Слот не занимает', () => {
    // Тот же час следующего дня: моменты разные, значит и пересечения нет.
    // Раньше здесь сравнивались ключи дней, и правило «бронь соседнего дня не
    // занимает Слот» держалось только потому, что ключи различались.
    const target = slot('2026-10-08T09:00:00.000Z')

    expect(getSlotStatus(target, [bookingOver(slot('2026-10-09T09:00:00.000Z'))], NOW)).toBe('свободен')
  })

  it('интервал, заканчивающийся ровно в начале Слота, его не занимает', () => {
    const target = slot('2026-10-08T09:00:00.000Z')
    const before = { start: new Date('2026-10-08T08:00:00.000Z'), end: new Date('2026-10-08T09:00:00.000Z') }

    expect(getSlotStatus(target, [bookingOver(before)], NOW)).toBe('свободен')
  })

  it('начавшийся Слот прошедший даже тогда, когда занят', () => {
    expect(getSlotStatus(slot('2026-10-08T06:00:00.000Z'), [bookingOver(slot('2026-10-08T06:30:00.000Z'))], NOW)).toBe('прошедший')
  })
})

describe('getDayState', () => {
  const openSlot = (hour: number): Slot => slot(`2026-10-08T${String(hour).padStart(2, '0')}:00:00.000Z`)

  it('день с окном и свободными Слотами доступен', () => {
    expect(getDayState({ slots: [openSlot(9), openSlot(10)], bookings: [], now: NOW })).toEqual({
      kind: 'доступен',
      available: 2,
    })
  })

  it('день без Окна недоступен', () => {
    expect(getDayState({ slots: [], bookings: [], now: NOW })).toEqual({
      kind: 'нет окна',
    })
  })

  it('день, где окно короче длительности Типа, недоступен как «не подходит Тип»', () => {
    // Слотов нет, хотя окно было: отличить «окна не было» от «окно есть, но Тип
    // в него не помещается» можно только по наличию окна в этот день.
    expect(
      getDayState({ slots: [], hasWindow: true, bookings: [], now: NOW }),
    ).toEqual({ kind: 'тип не помещается' })
  })

  it('полностью занятый день отличается от дня без окна', () => {
    const slots = [openSlot(9), openSlot(10)]
    const bookings = slots.map((target) => bookingOver(target))

    expect(getDayState({ slots, bookings, now: NOW })).toEqual({ kind: 'занято' })
  })

  it('сегодняшний день, где начались все Слоты, отличается от занятого', () => {
    // Тот же внешний вид, но причина другая: Слоты не заняты, они прошли.
    expect(getDayState({ slots: [openSlot(5), openSlot(6)], bookings: [], now: NOW })).toEqual({
      kind: 'прошло',
    })
  })

  it('подсказки четырёх недоступных состояний различаются', () => {
    const states: DayState[] = [
      getDayState({ slots: [], bookings: [], now: NOW }),
      getDayState({ slots: [], hasWindow: true, bookings: [], now: NOW }),
      getDayState({ slots: [openSlot(9)], bookings: [bookingOver(openSlot(9))], now: NOW }),
      getDayState({ slots: [openSlot(5)], bookings: [], now: NOW }),
    ]

    expect(new Set(states.map((state) => state.kind)).size).toBe(4)
  })

  it('начавшийся Слот вычитается из числа свободных', () => {
    expect(getDayState({ slots: [openSlot(6), openSlot(9)], bookings: [], now: NOW })).toEqual({
      kind: 'доступен',
      available: 1,
    })
  })
})

describe('dayStateHint', () => {
  it('подсказка про неподходящий Тип говорит гостевым языком, а не владельческим', () => {
    // Одно и то же состояние описывается двумя сторонами по-разному, и это
    // намеренно. Гость исправить ничего не может, и его текст говорит, что дело в
    // его Типе. У Владельца два исправления — и «не помещается ни в одно окно
    // приёма» отправляет его чинить то, что придётся чинить Владельцу.
    expect(dayStateHint({ kind: 'тип не помещается' })).toBe(
      'Окно приёма короче, чем длительность звонка',
    )
  })

  it('владельская формулировка не подмешалась в гостевую подсказку', () => {
    // Сведение текстов в один выглядело бы аккуратно и стоило бы Владельцу лишнего
    // круга: следствие отправляет чинить не причину.
    expect(dayStateHint({ kind: 'тип не помещается' })).not.toMatch(/ни в одно/i)
  })

  it('у доступного дня подсказки нет: ячейка и так говорит своим видом', () => {
    expect(dayStateHint({ kind: 'доступен', available: 3 })).toBeNull()
  })
})