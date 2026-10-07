import { baseUrl } from './config'

/**
 * Мутатор orval: единственное место, где собирается запрос.
 *
 * Сгенерированный код зовёт `customInstance` и получает `{ status, data, headers }`
 * — ровно ту форму, которую дальше разбирает вызывающий. Разбор отказа здесь
 * намеренно **не** делается: что считать ошибкой решает вызывающая сторона, а не
 * сгенерированный слой.
 *
 * Возвращаемое значение приведено к `T`, потому что orval описывает мутатор
 * обобщённым параметром и не знает, что внутри `{ status, data, headers }`.
 */
export const customInstance = async <T>(
  path: string,
  options: {
    method?: string
    headers?: Record<string, string>
    body?: string
    query?: Record<string, unknown>
  } = {},
): Promise<T> => {
  const query = new URLSearchParams()

  for (const [name, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== null) {
      query.set(name, String(value))
    }
  }

  const suffix = query.toString()
  const address = `${baseUrl}${path}${suffix ? `?${suffix}` : ''}`

  const response = await fetch(address, {
    method: options.method ?? 'GET',
    headers: options.headers,
    body: options.body,
  })

  return {
    status: response.status,
    data: (await response.json()) as unknown,
    headers: response.headers,
  } as T
}