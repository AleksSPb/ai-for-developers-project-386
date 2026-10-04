import { slotDurationMinutes } from '../domain/config'
import { parseDateKey, type DateKey, type MonthKey, type Slot } from '../domain/schedule'

/**
 * Форматирование для интерфейса. Всё считается в зоне организатора, поэтому
 * ключ дня сначала превращается в полдень по UTC: у полудня нет риска
 * попасть на соседние сутки при форматировании, и weekday тоже верный.
 *
 * «Пн, Вт, Ср» в шапке календаря заданы массивом, а не через `Intl`:
 * `Intl` для русской локали даёт одну букву, а в макете две.
 */

const asCivilDay = (date: DateKey): Date => {
  const parts = parseDateKey(date)
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12))
}

const asCivilMonth = (month: MonthKey): Date => {
  const [year, monthNumber] = month.split('-')
  return new Date(Date.UTC(Number(year), Number(monthNumber) - 1, 1))
}

const dayTitle = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

const dayWithYear = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

const monthTitle = new Intl.DateTimeFormat('ru-RU', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
})

const pad = (value: number): string => String(value).padStart(2, '0')

export const weekdayHeaders = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const

export const formatDayTitle = (date: DateKey): string => dayTitle.format(asCivilDay(date))

export const formatDayWithYear = (date: DateKey): string =>
  dayWithYear.format(asCivilDay(date))

export const formatMonthTitle = (month: MonthKey): string =>
  monthTitle.format(asCivilMonth(month))

export const formatMinutes = (minutes: number): string =>
  `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`

export const formatSlotRange = (slot: Slot): string =>
  `${formatMinutes(slot.startMinutes)} - ${formatMinutes(slot.endMinutes)}`

export const formatSlotDuration = (): string => `${slotDurationMinutes} мин`

export const formatSlotCount = (count: number): string => `${count} св.`

/** Зона браузера Гостя — только для второго времени у выбранного Слота. */
export const getGuestTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone