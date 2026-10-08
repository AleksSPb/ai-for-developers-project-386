import { bookingsListBookings, eventTypesListEventTypes } from '../api/generated/calendar-api'
import type { EventTypeSummary } from '../api/generated/calendar-api'
import { toDomainBookings } from '../api/bookings'
import type { Booking } from '../domain/booking'
import { useSource, type ReloadableSource, type SourceState } from './source'

/**
 * Встречи страницы Владельца.
 *
 * Два источника, а не один: сами Встречи и Типы событий, чтобы рядом с интервалом
 * стояло название. Тип приходит списком, а не одиночным чтением на каждую Встречу
 * — иначе страница на двадцати Бронях сделала бы двадцать запросов.
 *
 * Типы отдаются наружу вместе со встречами: из них же берётся выпадающий список
 * фильтра. Отдельного запроса на список фильтра нет и не будет — второй ответ со
 * списком Типов расходился бы с первым, если бы между ними кто-то завёл Тип.
 *
 * Окна приёма не грузятся: Владелец не бронирует и расписание не смотрит.
 */
export interface Meeting {
  booking: Booking
  /** Тип события, под который забронировано. */
  eventType: EventTypeSummary | null
}

export interface OwnerMeetings {
  meetings: Meeting[]
  /** Типы для фильтра: из того же ответа, что и встречи. */
  eventTypes: EventTypeSummary[]
}

const readMeetings = async (): Promise<SourceState<OwnerMeetings>> => {
  const [bookings, types] = await Promise.all([bookingsListBookings(), eventTypesListEventTypes()])

  if (bookings.status !== 200 || types.status !== 200) {
    return { kind: 'отказ' }
  }

  const byId = new Map(types.data.types.map((type) => [type.id, type]))

  return {
    kind: 'готов',
    value: {
      // Перевод Брони общий с гостевыми страницами: сделанный в двух местах рано или
      // поздно разошёлся бы, как уже расходились проверки конфликта.
      meetings: toDomainBookings(bookings.data).map((booking) => ({
        booking,
        eventType: byId.get(booking.eventTypeId) ?? null,
      })),
      eventTypes: types.data.types,
    },
  }
}

export const useMeetings = (): ReloadableSource<OwnerMeetings> =>
  useSource<OwnerMeetings>(readMeetings, 'meetings')