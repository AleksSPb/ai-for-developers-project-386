import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { handlers, resetStubStore } from './handlers'

/**
 * Сетевой слой в тестах отвечает заглушками.
 *
 * `onUnhandledRequest: 'error'` — не украшение, а ловушка: запрос к операции,
 * для которой заглушки нет, валит тест вместо тихого `undefined` в данных.
 * Так пропущенный отказ всплывает на тесте, а не на живом интерфейсе.
 */
export const server = setupServer(...handlers)

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' })
})

afterEach(() => {
  // Заглушка, поставленная на один тест через server.use, не должна достаться
  // следующему: сброс возвращает исходный набор обработчиков.
  server.resetHandlers()
  // И написанное за тест тоже: хранилище помнит, и без сброса тесты начали бы
  // зависеть от порядка — падение одного тянуло бы за собой чужие.
  resetStubStore()
})

afterAll(() => {
  server.close()
})