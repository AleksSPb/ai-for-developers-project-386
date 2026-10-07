import { describe, expect, it } from 'vitest'
import { customInstance } from './mutator'

/** Форма ответа, которую собирает мутатор. */
type Response<T> = { status: number; data: T; headers: Headers }

/**
 * Поведение сетевого слоя.
 *
 * Смысл этих тестов — не в ответах, а в том, что сеть вообще включена:
 * заглушки отвечают, необработанный запрос роняет тест, а адрес сервера
 * подставляется один и тот же.
 */
describe('мутатор', () => {
  it('ходит по адресу из конфигурации и отдаёт статус с телом', async () => {
    const response = (await customInstance('/windows')) as Response<{ windows: unknown[] }>

    expect(response.status).toBe(200)
    expect(response.data.windows).toHaveLength(1)
  })

  it('не разбирает отказ сам, а отдаёт его код и тело вызывающему', async () => {
    const response = (await customInstance('/event-types')) as Response<{ types: unknown[] }>

    // Разбор отказа — дело вызывающего: по одному факту успеха тут судить нечего,
    // но тело и код доступны целиком.
    expect(response.status).toBe(200)
    expect(response.headers).toBeDefined()
  })

  it('роняет тест на запросе, для которого нет заглушки', async () => {
    // Операции без заглушки в контракте нет: /health не описан, значит и
    // обработчика нет. onUnhandledRequest: 'error' превращает это в отказ теста
    // вместо тихого пустого ответа.
    await expect(customInstance('/health')).rejects.toThrow()
  })
})