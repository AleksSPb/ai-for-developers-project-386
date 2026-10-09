import { describe, expect, it } from 'vitest'

import { eventTypesCreateEventType } from '../api/generated/calendar-api'
import { TEXT_LIMITS } from '../app/textLimits'
import './server'

/**
 * Заглушка обязана отвергать негодное, иначе она врёт.
 *
 * Проверка идёт через сгенерированный клиент, а не через форму: форма лишнего не
 * даст ввести по замыслу, и сквозной путь «значение пришло мимо формы — сервер
 * отверг и назвал поле» через неё не пройти. Источник такого значения — скрипт,
 * старая запись, будущий клиент.
 *
 * Ответ здесь — то, что видит приложение: `422` и перечисление конкретных полей.
 * Подсветку формы по этому перечислению проверяет тест страницы.
 */

const at = (field: 'id' | 'name' | 'description', over = 1): string =>
  'я'.repeat(TEXT_LIMITS[field] + over)

/**
 * Создать Тип события.
 *
 * Идентификатор уникален на каждый вызов: хранилище заглушки живёт до конца теста, а
 * тот же `id` с другим текстом вернул бы `409` — занято, а не создано. Ровно тот отказ,
 * из-за которого тест про длину и писался бы вхолостую.
 */
let created = 0

const create = async (overrides: Record<string, string> = {}) =>
  eventTypesCreateEventType({
    id: `type-${(created += 1)}`,
    name: 'Консультация',
    description: 'Полчаса о вашем проекте',
    durationMinutes: 30,
    ...overrides,
  })

describe('заглушка отвергает слишком длинное значение', () => {
  it.each(['id', 'name', 'description'] as const)(
    'превышение предела %s отвергается и называет именно это поле',
    async (field) => {
      const response = await create({ [field]: at(field) })

      expect(response.status).toBe(422)
      // Ровно одно поле: код называет конкретное негодное, а не «всё подряд» —
      // иначе форма подсветила бы годные поля и Владелец искал бы не там.
      expect((response.data as { fields?: string[] }).fields).toEqual([field])
    },
  )

  it('на пределе значение принимается', async () => {
    const response = await create({ description: 'я'.repeat(TEXT_LIMITS.description) })

    // Проверка на самой границе обязана проходить: иначе форма приняла бы текст,
    // который сервер не примет, и Владелец узнал бы об этом отказом.
    expect(response.status).toBe(201)
  })

  it('длина в эмодзи считается так же, как в контракте', async () => {
    // Эмодзи стоит две кодовые единицы UTF-16 и одна точка кода. Заглушка, считающая
    // `String.length`, отвергла бы сотню эмодзи как две сотни символов — и отвергла
    // бы текст, который контракт разрешает.
    const hundred = '👍'.repeat(TEXT_LIMITS.name)
    const allowed = await create({ name: hundred })

    expect(allowed.status).toBe(201)
    expect((await create({ name: `${hundred}👍` })).status).toBe(422)
  })
})
