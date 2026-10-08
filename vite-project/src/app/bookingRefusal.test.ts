import { describe, expect, it } from 'vitest'

import type { bookingsCreateBookingResponse } from '../api/generated/calendar-api'
import {
  canRetry,
  fieldErrorsFrom,
  parseCreateResponse,
  refusalText,
  returnsToCalendar,
  wasPossiblyCreated,
  type BookingRefusal,
} from './bookingRefusal'

/**
 * Разбор отказа при записи.
 *
 * Здесь проверяется раскладка кодов в виды отказа: разные следствия для Гостя
 * должны получаться из разных видов, иначе интерфейс уведёт его не туда.
 */

/** Ответ произвольного вида: разбирается статус, а не тело. */
const refusalOf = (response: bookingsCreateBookingResponse): BookingRefusal => {
  const outcome = parseCreateResponse(response)

  if (outcome.kind !== 'отказ') {
    throw new Error(`ожидался отказ, а пришёл ${outcome.kind}`)
  }

  return outcome.refusal
}

describe('parseCreateResponse', () => {
  it('успех отличает от отказа', () => {
    expect(
      parseCreateResponse({
        status: 201,
        data: {
          id: 'b1',
          eventTypeId: 'consultation',
          timeRange: { start: '2026-10-08T07:00:00.000Z', end: '2026-10-08T08:00:00.000Z' },
          guestName: 'Гость',
          guestEmail: 'guest@example.com',
          createdAt: '2026-10-07T10:00:00.000Z',
        },
        headers: new Headers(),
      }),
    ).toEqual({ kind: 'создана' })
  })

  it('занятый Слот — это занятость, а не негодные данные', () => {
    // Оба кода несут `message`, и разбор по нему отдавал бы гостю текст сервера.
    expect(
      refusalOf({
        status: 409,
        data: { code: 'slot_taken', message: 'Слот уже занят' },
        headers: new Headers(),
      }),
    ).toEqual({ kind: 'занят' })
  })

  it('время, на которое нельзя, отличается от негодных полей', () => {
    // Один код `422` несёт две модели, и свести их в один отказ значило бы
    // отправить гостя искать негодное поле интервала, которого на форме нет.
    expect(
      refusalOf({
        status: 422,
        data: { code: 'time_not_bookable', message: 'Нельзя', field: 'timeRange' },
        headers: new Headers(),
      }),
    ).toEqual({ kind: 'время' })
  })

  it('негодные поля переводятся в имена полей формы', () => {
    expect(
      refusalOf({
        status: 422,
        data: { code: 'validation_failed', message: 'Проверка не прошла', fields: ['guestName', 'guestEmail'] },
        headers: new Headers(),
      }),
    ).toEqual({ kind: 'данные', fields: ['name', 'email'] })
  })

  it('незнакомое поле контракта не подсвечивает поле формы', () => {
    // Подсветить нечего: такого поля на форме нет, а молча ушедшее имя выглядело
    // бы как «проверка прошла, потому что отмечать было нечего».
    expect(
      refusalOf({
        status: 422,
        data: { code: 'validation_failed', message: 'Проверка не прошла', fields: ['somethingNew'] },
        headers: new Headers(),
      }),
    ).toEqual({ kind: 'данные', fields: [] })
  })

  it('«не найдено» разбирается без сужения по коду', () => {
    // «Слот не найден» и «Тип события не найден» дают один текст и одно действие,
    // и разбирать их по коду было бы разветвлением без свидетеля: второй код при
    // записи недостижим — удаления Типа нет, а идентификатор неизменен.
    //
    // Код «Тип события не найден» поэтому нигде в тестах записи и не даётся.
    expect(
      refusalOf({
        status: 404,
        data: { code: 'slot_not_found', message: 'Слот не найден' },
        headers: new Headers(),
      }),
    ).toEqual({ kind: 'нет такого' })
  })

  it('вида отказа для ненайденного Типа не существует', () => {
    // Отдельного вида «Тип не найден» нет вовсе: значит и своего текста у него не
    // будет, даже если код когда-нибудь станет достижим.
    const kinds = (
      [
        { kind: 'занят' },
        { kind: 'данные', fields: ['name'] },
        { kind: 'время' },
        { kind: 'нет такого' },
        { kind: 'недоступно' },
        { kind: 'сеть' },
      ] as BookingRefusal[]
    ).map((refusal) => refusal.kind)

    expect(new Set(kinds)).toEqual(
      new Set(['занят', 'данные', 'время', 'нет такого', 'недоступно', 'сеть']),
    )
  })

  it('недоступность сервера отличается от оборванной сети', () => {
    // Ответ с телом значит, что запись не создана; оборванный запрос оставляет
    // вопрос открытым, и гость об этом должен узнать.
    expect(
      refusalOf({
        status: 503,
        data: { code: 'service_unavailable', message: 'Сервис временно недоступен' },
        headers: new Headers(),
      }),
    ).toEqual({ kind: 'недоступно' })
  })
})

describe('refusalText', () => {
  it('недоступность и оборванная сеть звучат одинаково', () => {
    // Гость не может знать, где именно оборвалось, и различать формулировкой —
    // значило бы утверждать то, чего он не знает.
    expect(refusalText({ kind: 'недоступно' })).toBe(refusalText({ kind: 'сеть' }))
  })

  it('текст про данные не говорит про время', () => {
    // Время гость только что выбрал и оно было доступно: сказать «выбранное время
    // больше недоступно» на негодное имя — значит сказать неправду.
    const text = refusalText({ kind: 'данные', fields: ['name'] })

    expect(text).not.toMatch(/время|времен/)
    expect(text).toMatch(/имя|почт/i)
  })

  it('текст про время не говорит про поле', () => {
    expect(refusalText({ kind: 'время' })).toMatch(/время/i)
    expect(refusalText({ kind: 'время' })).not.toMatch(/поле|поля/i)
  })

  it('текст отказа не берётся из сообщения контракта', () => {
    // Серверное сообщение — строка для разработчика; попав перед гостем, оно было бы
    // просто чужой фразой на его языке не из его языка.
    const texts = (
      [
        { kind: 'занят' },
        { kind: 'данные', fields: ['name'] },
        { kind: 'время' },
        { kind: 'нет такого' },
        { kind: 'недоступно' },
        { kind: 'сеть' },
      ] as BookingRefusal[]
    ).map(refusalText)

    expect(texts.some((text) => text.includes('Слот уже занят'))).toBe(false)
    expect(texts.some((text) => text.includes('Сервис временно недоступен'))).toBe(false)
  })
})

describe('последствия отказа', () => {
  it('отказ по занятости запрещает повтор, остальные разрешают', () => {
    // Повтор после занятости вернул бы тот же отказ и потерял бы введённое имя и
    // почту второй раз.
    expect(canRetry({ kind: 'занят' })).toBe(false)
    expect(canRetry({ kind: 'данные', fields: ['name'] })).toBe(true)
    expect(canRetry({ kind: 'время' })).toBe(true)
    expect(canRetry({ kind: 'нет такого' })).toBe(true)
    expect(canRetry({ kind: 'недоступно' })).toBe(true)
    expect(canRetry({ kind: 'сеть' })).toBe(true)
  })

  it('к выбору дня возвращают только те, где Слота больше нет', () => {
    // Отказ по занятости оставляет форму с введёнными данными, а ошибка полей —
    // тем более: исправление госта и повтор могут дать успех.
    expect(returnsToCalendar({ kind: 'время' })).toBe(true)
    expect(returnsToCalendar({ kind: 'нет такого' })).toBe(true)
    expect(returnsToCalendar({ kind: 'занят' })).toBe(false)
    expect(returnsToCalendar({ kind: 'данные', fields: ['name'] })).toBe(false)
    expect(returnsToCalendar({ kind: 'недоступно' })).toBe(false)
    expect(returnsToCalendar({ kind: 'сеть' })).toBe(false)
  })

  it('запись могла создаться только при оборванной сети', () => {
    expect(wasPossiblyCreated({ kind: 'сеть' })).toBe(true)
    expect(wasPossiblyCreated({ kind: 'недоступно' })).toBe(false)
    expect(wasPossiblyCreated({ kind: 'занят' })).toBe(false)
  })

  it('подсвечиваются все негодные поля сразу', () => {
    // Форма одна и проверяет всё разом: по одному ждать четыре круга туда-обратно
    // незачем.
    expect(fieldErrorsFrom({ kind: 'данные', fields: ['name', 'email'] })).toEqual({
      name: 'Значение не подходит',
      email: 'Значение не подходит',
    })
  })

  it('отказ без полей не подсвечивает ничего', () => {
    expect(fieldErrorsFrom({ kind: 'данные', fields: [] })).toEqual({})
    expect(fieldErrorsFrom({ kind: 'время' })).toEqual({})
    expect(fieldErrorsFrom({ kind: 'занят' })).toEqual({})
  })
})