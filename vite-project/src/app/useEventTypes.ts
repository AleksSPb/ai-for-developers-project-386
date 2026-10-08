import { eventTypesListEventTypes } from '../api/generated/calendar-api'
import type { EventTypeSummary } from '../api/generated/calendar-api'
import { fromResponse, useSource, type SourceState } from './source'

/**
 * Типы событий для страницы Владельца.
 *
 * Ровно один источник: Типов достаточно, чтобы показать карточки. Окна приёма
 * разделу не нужны — Владелец не бронирует, а «помещается ли Тип в окно» сервер
 * в контракте не отдаёт.
 */
export const readEventTypes = async (): Promise<SourceState<EventTypeSummary[]>> =>
  fromResponse(await eventTypesListEventTypes(), (data: { types: EventTypeSummary[] }) => data.types)

export const useEventTypes = (): SourceState<EventTypeSummary[]> =>
  useSource<EventTypeSummary[]>(readEventTypes, 'event-types')