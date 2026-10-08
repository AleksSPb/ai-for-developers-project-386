import { describe, expect, it } from 'vitest'
import { errorsFromRefusal, TAKEN_CODE } from './refusal'

/**
 * Разбор отказа формы.
 *
 * Различаются два разных отказа, и путать их дорого: «идентификатор занят» и
 * «поля негодны» требуют разных подсветок и разных действий от Владельца.
 */

describe('errorsFromRefusal', () => {
  it('занятый идентификатор подсвечивает поле идентификатора', () => {
    expect(errorsFromRefusal({ message: 'Есть', code: TAKEN_CODE })).toEqual({
      id: 'Такой идентификатор уже занят',
    })
  })

  it('занятый идентификатор не подсвечивает остальные поля', () => {
    // Код означает «это значение уже занято», а не «это значение негодно»:
    // подсветка названия увела бы Владельца чинить то, что в порядке.
    const errors = errorsFromRefusal({ message: 'Есть', code: TAKEN_CODE, fields: ['id', 'name'] })

    expect(Object.keys(errors)).toEqual(['id'])
  })

  it('негодные поля подсвечиваются сразу все', () => {
    const errors = errorsFromRefusal({
      message: 'Проверка не прошла',
      code: 'validation_failed',
      fields: ['name', 'description'],
    })

    expect(Object.keys(errors).sort()).toEqual(['description', 'name'])
  })

  it('отказ без полей не подсвечивает ничего', () => {
    expect(errorsFromRefusal({ message: 'Отказ' })).toEqual({})
  })

  it('нет отказа — нет ошибок', () => {
    expect(errorsFromRefusal(null)).toEqual({})
  })

  it('неизвестный код отказа с полями подсвечивает именно их', () => {
    const errors = errorsFromRefusal({ message: 'Отказ', code: 'что-то ещё', fields: ['description'] })

    expect(Object.keys(errors)).toEqual(['description'])
  })
})