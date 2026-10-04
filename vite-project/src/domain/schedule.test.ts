import { describe, expect, it } from 'vitest'

import type { Booking } from './booking'
import { slotsPerDay, slotDurationMinutes } from './config'
import {
  addDays,
  daysBetween,
  getAvailableSlotCount,
  getAvailableSlots,
  getDaySlots,
  getDefaultDate,
  getMonthRange,
  getSlotEnd,
  getSlotStart,
  getSlotStatus,
  getToday,
  getBookingSlot,
  getBookingStart,
  isBookingUpcoming,
  isDateSelectable,
  isMonthSelectable,
  shiftMonth,
  type DateKey,
} from './schedule'

/**
 * Фиксируем «сейчас» в 09:00 по Москве: слот 09:00 к этому моменту уже
 * начался и потому недоступен, весь день впереди. Моменты передаются
 * аргументом, поэтому поддевать часы не нужно.
 */
const NOW = new Date('2026-03-28T06:00:00.000Z')
const TODAY: DateKey = '2026-03-28'

const bookingOn = (date: DateKey, startMinutes: number): Booking => ({
  id: `${date}-${startMinutes}`,
  date,
  startMinutes,
  endMinutes: startMinutes + slotDurationMinutes,
  guestName: 'Demo User',
  guestEmail: 'demo@example.com',
  createdAt: '2026-03-27T14:40:00.000Z',
})

describe('getDaySlots', () => {
  const slots = getDaySlots(TODAY)

  it('даёт столько Слотов, сколько обещает Правило расписания', () => {
    expect(slots).toHaveLength(slotsPerDay)
  })

  it('начинается в начале окна приёма', () => {
    expect(slots[0]).toEqual({ date: TODAY, startMinutes: 540, endMinutes: 570 })
  })

  it('заканчивается последним Слотом ровно в конце окна', () => {
    // Окно 09:00–18:00 при шаге 30 минут: последний Слот 17:30–18:00,
    // а не 18:00–18:30, которого в окне уже нет.
    expect(slots.at(-1)).toEqual({ date: TODAY, startMinutes: 1050, endMinutes: 1080 })
  })

  it('не оставляет щелей между Слотами', () => {
    slots.slice(1).forEach((slot, index) => {
      expect(slot.startMinutes).toBe(slots[index].endMinutes)
    })
  })
})

describe('getSlotStart и getSlotEnd', () => {
  it('переводит минуты окна в момент времени зоны организатора', () => {
    const slot = getDaySlots(TODAY)[0]
    expect(getSlotStart(slot).toISOString()).toBe('2026-03-28T06:00:00.000Z')
    expect(getSlotEnd(slot).toISOString()).toBe('2026-03-28T06:30:00.000Z')
  })
})

describe('getSlotStatus', () => {
  it('начавшийся Слот прошедший, даже если свободен', () => {
    const [firstSlot] = getDaySlots(TODAY)
    expect(getSlotStatus(firstSlot, [], NOW)).toBe('прошедший')
  })

  it('занятый Слот не прошедший, пока не начался', () => {
    const tenOClock = getDaySlots(TODAY)[2]
    expect(getSlotStatus(tenOClock, [bookingOn(TODAY, 600)], NOW)).toBe('занят')
  })

  it('Слот занят даже при частичном пересечении', () => {
    const slot = getDaySlots(TODAY)[2]
    const overlapping = bookingOn(TODAY, 615)
    expect(getSlotStatus(slot, [overlapping], NOW)).toBe('занят')
  })

  it('бронь соседнего дня не занимает Слот', () => {
    const slot = getDaySlots(TODAY)[2]
    expect(getSlotStatus(slot, [bookingOn('2026-03-29', 600)], NOW)).toBe('свободен')
  })

  it('будущий Слот свободен', () => {
    const elevenOClock = getDaySlots(TODAY)[4]
    expect(getSlotStatus(elevenOClock, [], NOW)).toBe('свободен')
  })
})

describe('getAvailableSlotCount', () => {
  it('вычитает начавшийся Слот из доступных', () => {
    expect(getAvailableSlotCount(TODAY, [], NOW)).toBe(slotsPerDay - 1)
  })

  it('вычитает и занятый, и прошедший', () => {
    expect(getAvailableSlotCount(TODAY, [bookingOn(TODAY, 600)], NOW)).toBe(slotsPerDay - 2)
  })

  it('в дне без прошедших Слотов доступны все', () => {
    expect(getAvailableSlotCount('2026-03-29', [], NOW)).toBe(slotsPerDay)
  })

  it('занятые Слоты не попадают в список доступных', () => {
    const available = getAvailableSlots(TODAY, [bookingOn(TODAY, 600)], NOW)
    expect(available.some((slot) => slot.startMinutes === 600)).toBe(false)
  })
})

describe('addDays и daysBetween', () => {
  it('переходит через конец месяца', () => {
    expect(addDays('2026-03-31', 1)).toBe('2026-04-01')
  })

  it('переходит через конец года', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('возвращает разницу в днях со знаком', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-03-30', '2026-03-28')).toBe(-2)
  })

  it('переживает переход через февраль високосного года', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('isDateSelectable', () => {
  it('сегодняшний день доступен', () => {
    expect(isDateSelectable(TODAY, NOW)).toBe(true)
  })

  it('прошедшие дни недоступны', () => {
    expect(isDateSelectable('2026-03-27', NOW)).toBe(false)
  })

  it('последний день горизонта доступен, следующий за ним нет', () => {
    expect(isDateSelectable(addDays(TODAY, 30), NOW)).toBe(true)
    expect(isDateSelectable(addDays(TODAY, 31), NOW)).toBe(false)
  })

  it('суббота и воскресенье ничем не отличаются от будних', () => {
    // Выходные не вычеркнуты из Правила расписания.
    expect(isDateSelectable('2026-03-28', NOW)).toBe(true)
    expect(isDateSelectable('2026-03-29', NOW)).toBe(true)
  })
})

describe('getMonthRange', () => {
  it('открывает три месяца назад и месяц горизонта', () => {
    expect(getMonthRange(NOW)).toEqual({ first: '2025-12', last: '2026-04' })
  })

  it('проверяет месяц по границам окна', () => {
    expect(isMonthSelectable('2025-12', NOW)).toBe(true)
    expect(isMonthSelectable('2026-04', NOW)).toBe(true)
    expect(isMonthSelectable('2025-11', NOW)).toBe(false)
    expect(isMonthSelectable('2026-05', NOW)).toBe(false)
  })

  it('листает месяцы через границу года', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-11', 2)).toBe('2027-01')
  })
})

describe('getDefaultDate', () => {
  it('открывает сегодня, пока в нём есть свободные Слоты', () => {
    expect(getDefaultDate([], NOW)).toBe(TODAY)
  })

  it('перескакивает на следующий день, когда сегодня всё занято', () => {
    const allTaken = getDaySlots(TODAY).map((slot) => bookingOn(TODAY, slot.startMinutes))
    expect(getDefaultDate(allTaken, NOW)).toBe('2026-03-29')
  })

  it('перескакивает дальше, если следующий день тоже занят', () => {
    const busy = [
      ...getDaySlots(TODAY).map((slot) => bookingOn(TODAY, slot.startMinutes)),
      ...getDaySlots('2026-03-29').map((slot) => bookingOn('2026-03-29', slot.startMinutes)),
    ]
    expect(getDefaultDate(busy, NOW)).toBe('2026-03-30')
  })

  it('остаётся на сегодня, когда в горизонте нет ни одного свободного Слота', () => {
    const everywhere = Array.from({ length: 31 }, (_, offset) =>
      getDaySlots(addDays(TODAY, offset)).map((slot) => bookingOn(addDays(TODAY, offset), slot.startMinutes)),
    ).flat()
    expect(getDefaultDate(everywhere, NOW)).toBe(TODAY)
  })
})

describe('Брони во времени', () => {
  const atTen = bookingOn(TODAY, 600)

  it('Слот Брони совпадает с записанным интервалом', () => {
    expect(getBookingSlot(atTen)).toEqual({
      date: TODAY,
      startMinutes: 600,
      endMinutes: 630,
    })
  })

  it('начало Брони — момент из таймзоны организатора', () => {
    expect(getBookingStart(atTen).toISOString()).toBe('2026-03-28T07:00:00.000Z')
  })

  it('Бронь, начинающаяся позже, считается предстоящей', () => {
    expect(isBookingUpcoming(atTen, NOW)).toBe(true)
  })

  it('идущий звонок не висит в предстоящих', () => {
    // Граница — начало Слота, а не его конец.
    expect(isBookingUpcoming(atTen, new Date('2026-03-28T07:00:00.000Z'))).toBe(false)
  })

  it('прошедшая Бронь не предстоящая', () => {
    expect(isBookingUpcoming(atTen, new Date('2026-03-28T08:00:00.000Z'))).toBe(false)
  })

  it('Бронь в другой день не влияет на классификацию', () => {
    const tomorrow = bookingOn('2026-03-29', 540)
    expect(isBookingUpcoming(tomorrow, NOW)).toBe(true)
  })
})

describe('getToday', () => {
  it('берёт сегодняшний день в таймзоне организатора, а не в UTC', () => {
    // 21:30 UTC — это уже 00:30 следующих суток по Москве.
    expect(getToday(new Date('2026-03-28T21:30:00.000Z'))).toBe('2026-03-29')
  })

  it('уже следующие сутки, когда в UTC ещё вчера', () => {
    expect(getToday(new Date('2026-03-27T22:30:00.000Z'))).toBe('2026-03-28')
  })
})