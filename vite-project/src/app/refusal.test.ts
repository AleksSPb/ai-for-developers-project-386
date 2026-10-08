import { describe, expect, it } from 'vitest'
import { errorsFromRefusal, TAKEN_CODE, type FieldValues } from './refusal'

/**
 * Разбор отказа формы.
 *
 * Различаются три разных отказа, и путать их дорого: «идентификатор занят»,
 * «поля негодны по правилам контракта» и «поле из ответа нам неизвестно» требуют
 * разных слов под полем.
 */

/** Значения полей формы по умолчанию: все годные. */
const values = (overrides: Partial<FieldValues> = {}): FieldValues => ({
  id: 'consultation',
  name: 'Консультация',
  description: 'Полчаса о вашем проекте',
  ...overrides,
})

describe('errorsFromRefusal', () => {
  it('занятый идентификатор подсвечивает поле идентификатора', () => {
    expect(errorsFromRefusal({ code: TAKEN_CODE }, values())).toEqual({
      id: 'Такой идентификатор уже занят',
    })
  })

  it('занятый идентификатор не подсвечивает остальные поля', () => {
    // Код означает «это значение уже занято», а не «это значение негодно»:
    // подсветка названия увела бы Владельца чинить то, что в порядке.
    const errors = errorsFromRefusal(
      { code: TAKEN_CODE, fields: ['id', 'name'] },
      values(),
    )

    expect(Object.keys(errors)).toEqual(['id'])
  })

  it('короткий идентификатор говорит про длину, а не «значение не подходит»', () => {
    // Причина названа по значению поля: сервер прислал только имя, и без знания
    // значения текстом осталось бы «Значение не подходит» — бесполезное сообщение,
    // по которому нечего понять, что делать.
    const errors = errorsFromRefusal(
      { code: 'validation_failed', fields: ['id'] },
      values({ id: 'ab' }),
    )

    expect(errors.id).toBe('Введите не меньше 3 символов')
  })

  it('идентификатор не по образцу говорит про образец', () => {
    const errors = errorsFromRefusal(
      { code: 'validation_failed', fields: ['id'] },
      values({ id: 'Консультация' }),
    )

    expect(errors.id).toBe('Только строчные латинские буквы, цифры и дефис')
  })

  it('пустое поле говорит, что его надо заполнить', () => {
    const errors = errorsFromRefusal(
      { code: 'validation_failed', fields: ['description'] },
      values({ description: '  ' }),
    )

    expect(errors.description).toBe('Заполните это поле')
  })

  it('негодные поля подсвечиваются сразу все', () => {
    const errors = errorsFromRefusal(
      {
        code: 'validation_failed',
        fields: ['name', 'description'],
      },
      values({ name: '', description: '' }),
    )

    // Форма одна и проверяет всё разом: по одному ждать круга туда-обратно незачем.
    expect(Object.keys(errors).sort()).toEqual(['description', 'name'])
  })

  it('поле, которого у формы нет, остаётся с общим текстом', () => {
    // Выдумывать причину, которую никто не проверял, значило бы врать: такого поля
    // на форме нет, и подсветить его нечем.
    const errors = errorsFromRefusal(
      { code: 'validation_failed', fields: ['unknownField'] },
      values(),
    )

    expect(errors.unknownField).toBe('Значение не подходит')
  })

  it('отказ без полей не подсвечивает ничего', () => {
    expect(errorsFromRefusal({  }, values())).toEqual({})
  })

  it('нет отказа — нет ошибок', () => {
    expect(errorsFromRefusal(null, values())).toEqual({})
  })
})