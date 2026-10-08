import type { Booking as ApiBooking } from './generated/calendar-api'
import type { Booking } from '../domain/booking'

/**
 * Перевод Брони из ответа в доменную.
 *
 * Контракт отдаёт интервал строками, а домен работает моментами. Момент
 * разбирается сразу и им же проверяется: неразобранная строка дала бы
 * `Invalid Date`, и на экране появилось бы «Invalid Date» вместо отказа.
 *
 * Живёт здесь, а не в потребителе: перевод нужен и странице встреч, и списку
 * Броней, и двум разным хукам. Сделанный в двух местах перевод рано или поздно
 * разошёлся бы — как уже разошлись проверки конфликта.
 */
export const toDomainBooking = (api: ApiBooking): Booking | null => {
  const start = new Date(api.timeRange.start)
  const end = new Date(api.timeRange.end)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return null
  }

  return {
    id: api.id,
    eventTypeId: api.eventTypeId,
    start,
    end,
    guestName: api.guestName,
    guestEmail: api.guestEmail,
    createdAt: api.createdAt,
  }
}

/** Список Броней из ответа: неразобранные пропускаются, а не роняют страницу. */
export const toDomainBookings = (api: readonly ApiBooking[]): Booking[] =>
  api.flatMap((entry) => {
    const booking = toDomainBooking(entry)
    return booking === null ? [] : [booking]
  })

/**
 * Обратный перевод: доменная Бронь в форму ответа.
 *
 * Нужен подменам в тестах — они отдают ответ сервера, а не доменную модель, иначе
 * проверяли бы заглушку вместо слоя.
 */
export const toApiBooking = (booking: Booking): ApiBooking => ({
  id: booking.id,
  eventTypeId: booking.eventTypeId,
  timeRange: { start: booking.start.toISOString(), end: booking.end.toISOString() },
  guestName: booking.guestName,
  guestEmail: booking.guestEmail,
  createdAt: booking.createdAt,
})