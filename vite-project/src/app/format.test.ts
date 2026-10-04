import { describe, expect, it } from 'vitest'

import { getDaySlots } from '../domain/schedule'
import {
  formatDayTitle,
  formatDayWithYear,
  formatMinutes,
  formatMonthTitle,
  formatSlotCount,
  formatSlotDuration,
  formatSlotRange,
  weekdayHeaders,
} from './format'

describe('форматирование дат', () => {
  it('называет день так же, как в макете', () => {
    expect(formatDayTitle('2026-03-28')).toBe('суббота, 28 марта')
  })

  it('различает дни одной недели', () => {
    expect(formatDayTitle('2026-03-23')).toBe('понедельник, 23 марта')
  })

  it('добавляет год, когда он нужен', () => {
    expect(formatDayWithYear('2026-03-28')).toBe('28 марта 2026 г.')
  })

  it('называет месяц вместе с годом', () => {
    expect(formatMonthTitle('2026-03')).toBe('март 2026 г.')
  })

  it('не путает месяцы на границе года', () => {
    expect(formatMonthTitle('2027-01')).toBe('январь 2027 г.')
  })

  it('начинает неделю с понедельника', () => {
    expect(weekdayHeaders[0]).toBe('Пн')
    expect(weekdayHeaders).toHaveLength(7)
  })
})

describe('форматирование времени', () => {
  it('дополняет часы и минуты нулём', () => {
    expect(formatMinutes(9 * 60)).toBe('09:00')
    expect(formatMinutes(9 * 60 + 5)).toBe('09:05')
  })

  it('показывает интервал Слота', () => {
    expect(formatSlotRange(getDaySlots('2026-03-28')[0])).toBe('09:00 - 09:30')
  })

  it('называет длительность Слота, а не дня', () => {
    // В макете подпись была «Длительность в дне», но значение — это
    // длительность Слота, и подпись вводила в заблуждение.
    expect(formatSlotDuration()).toBe('30 мин')
  })

  it('подписывает число свободных Слотов', () => {
    expect(formatSlotCount(17)).toBe('17 св.')
    expect(formatSlotCount(0)).toBe('0 св.')
  })
})