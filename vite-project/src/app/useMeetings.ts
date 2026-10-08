import { bookingsListBookings, eventTypesListEventTypes } from '../api/generated/calendar-api'
import type { Booking as ApiBooking, EventTypeSummary } from '../api/generated/calendar-api'
import type { Booking } from '../domain/booking'
import { useSource, type SourceState } from './source'

/**
 * Встречи страницы Владельца.
 *
 * Два источника, а не один: сами Встречи и Типы событий, чтобы рядом с интервалом
 * стояло название. Тип приходит списком, а не одиночным чтением на каждую
 * Встречу — иначе страница на двадцати Бронях сделала бы двадцать запросов.
 *
 * Окна приёма не грузятся: Владелец не бронирует и расписание не смотрит.
 */
export interface Meeting {
  booking: Booking
  /** Тип события, под который забронировано. */
  eventType: EventTypeSummary | null
}

/**
 * Перевод Брони из ответа в доменную.
 *
 * Контракт отдаёт интервал строками, а домен работает моментами. Момент
 * разбирается сразу и им же проверяется: неразобранная строка дала бы
 * `Invalid Date`, и на экране появилось бы «Invalid Date», а не отказ.
 */
const toDomainBooking = (api: ApiBooking): Booking | null => {
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

const readMeetings = async (): Promise<SourceState<Meeting[]>> => {
  const [bookings, types] = await Promise.all([bookingsListBookings(), eventTypesListEventTypes()])

  if (bookings.status !== 200 || types.status !== 200) {
    const failed = bookings.status !== 200 ? bookings : types
    const message = (failed.data as { message?: string }).message

    return { kind: 'отказ', message: message ?? 'Сервис временно недоступен' }
  }

  const byId = new Map(types.data.types.map((type) => [type.id, type]))

  return {
    kind: 'готов',
    value: bookings.data.flatMap((api) => {
      const booking = toDomainBooking(api)

      // Бронь с неразобранным интервалом пропускается молча: она не ломает
      // страницу, но и показать её нечем.
      return booking === null
        ? []
        : [{ booking, eventType: byId.get(booking.eventTypeId) ?? null }]
    }),
  }
}

export const useMeetings = (): SourceState<Meeting[]> =>
  useSource<Meeting[]>(readMeetings, 'meetings')