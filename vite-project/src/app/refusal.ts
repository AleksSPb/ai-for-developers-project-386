/**
 * Разбор отказа формы.
 *
 * Живёт отдельно от компонента: файл, который экспортирует и компонент, и
 * функции, ломает Fast Refresh — при правке одного модуля перезагружается вся
 * страница.
 */

/** Ошибки полей формы: ключ — имя поля из контракта. */
export type FieldErrors = Record<string, string>

/** Код отказа, который означает «это значение уже занято». */
export const TAKEN_CODE = 'event_type_exists'

export interface Refusal {
  message: string
  code?: string
  fields?: string[]
}

/**
 * Ошибки полей из отказа.
 *
 * Занятый идентификатор подсвечивает **именно поле идентификатора**: код
 * `event_type_exists` означает «это значение уже занято», а не «это значение
 * негодно», и подсветка всего набора сбила бы Владельца с толку.
 *
 * Остальные негодные поля подсвечиваются сразу все: форма одна и проверяет всё
 * разом, а по одному ждать четыре круга туда-обратно незачем.
 */
export const errorsFromRefusal = (error: Refusal | null): FieldErrors => {
  if (error === null) {
    return {}
  }

  if (error.code === TAKEN_CODE) {
    return { id: 'Такой идентификатор уже занят' }
  }

  return (error.fields ?? []).reduce<FieldErrors>((accumulator, field) => {
    accumulator[field] = 'Значение не подходит'
    return accumulator
  }, {})
}