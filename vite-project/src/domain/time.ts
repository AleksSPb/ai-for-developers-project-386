/**
 * Гражданское время: то, что человек видит на часах в своей зоне, и обратное
 * преобразование в момент времени.
 *
 * Все вычисления идут через `Intl` с явной зоной: брать смещение из машины
 * нельзя, иначе Правило расписания переезжает вместе с посетителем.
 */

export interface ZonedDateTime {
  year: number
  /** Месяц 1..12, как его возвращает `Intl`. */
  month: number
  day: number
  hour: number
  minute: number
}

const formatterCache = new Map<string, Intl.DateTimeFormat>()

const getFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const cached = formatterCache.get(timeZone)
  if (cached !== undefined) {
    return cached
  }
  const created = new Intl.DateTimeFormat('en-US', {
    timeZone,
    // h23, а не hour12: без этого в некоторых средах полночь приходит как час 24.
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  formatterCache.set(timeZone, created)
  return created
}

const readPart = (
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPart['type'],
): number => {
  const found = parts.find((part) => part.type === type)
  if (found === undefined) {
    throw new Error(`В зоне не найдена часть даты ${type}`)
  }
  return Number(found.value)
}

export const getZonedDateTime = (at: Date, timeZone: string): ZonedDateTime => {
  const parts = getFormatter(timeZone).formatToParts(at)
  return {
    year: readPart(parts, 'year'),
    month: readPart(parts, 'month'),
    day: readPart(parts, 'day'),
    hour: readPart(parts, 'hour'),
    minute: readPart(parts, 'minute'),
  }
}

/** Минуты от полуночи в указанной зоне. */
export const getZonedMinutesOfDay = (at: Date, timeZone: string): number => {
  const { hour, minute } = getZonedDateTime(at, timeZone)
  return hour * 60 + minute
}

/** Смещение зоны от UTC в минутах на момент `at`, со знаком. */
export const getTimeZoneOffsetMinutes = (at: Date, timeZone: string): number => {
  const zoned = getZonedDateTime(at, timeZone)
  const asIfUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute)
  // Секунды у `at` есть, а у зоны нет, и смещение всегда целое число минут,
  // поэтому обе стороны приводятся к целым минутам. Иначе на 37 секундах
  // округление давало бы 179 вместо 180.
  const atWholeMinute = Math.floor(at.getTime() / 60_000) * 60_000
  return (asIfUtc - atWholeMinute) / 60_000
}

/**
 * Момент времени, который в указанной зоне означает заданные гражданские части.
 *
 * Смещение берётся в предполагаемом моменте, а не в заданном: если сдвинуть
 * civil-время наOffset и сразу пересчитать, зона с переходом на летнее время
 * даст неверный ответ. Двух проходов хватает для зон без перехода; зоны с
 * переходом и несуществующим локальным временем не используются.
 */
export const zonedDateTimeToDate = (zoned: ZonedDateTime, timeZone: string): Date => {
  const asIfUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute)
  let instant = new Date(asIfUtc)
  for (let pass = 0; pass < 2; pass += 1) {
    instant = new Date(asIfUtc - getTimeZoneOffsetMinutes(instant, timeZone) * 60_000)
  }
  return instant
}