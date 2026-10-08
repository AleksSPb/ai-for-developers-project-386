/**
 * Фильтр встреч по Типу события — **в адресе**.
 *
 * Адрес, а не состояние страницы: ссылкой можно поделиться, кнопка «назад»
 * возвращает предыдущий фильтр, а перезагрузка не теряет его. Состояние в памяти
 * дала бы все три потери за раз.
 *
 * Правило одно на весь раздел: карточка Типа ведёт по этому же адресу, и
 * собирать ссылку в двух местах значило бы однажды получить разные адреса для
 * одного и того же фильтра.
 */

/** Имя параметра адреса. Объявлено здесь, потому что его читают и пишут двое. */
export const MEETINGS_FILTER_PARAM = 'eventType'

/** Адрес списка встреч, отфильтрованного по Типу события. */
export const meetingsPath = (eventTypeId: string | null): string =>
  eventTypeId === null
    ? '/meetings'
    : `/meetings?${MEETINGS_FILTER_PARAM}=${encodeURIComponent(eventTypeId)}`

/** Идентификатор Типа события из адреса; без фильтра — `null`. */
export const eventTypeFromAddress = (params: URLSearchParams): string | null =>
  params.get(MEETINGS_FILTER_PARAM)