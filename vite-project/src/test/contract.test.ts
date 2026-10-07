import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import specSource from '../../contract/openapi.yaml?raw'
import { stubbedResponses } from './handlers'

/**
 * Сверка заглушек со спецификацией контракта.
 *
 * Правило карты: тест падает, если у любой операции не разобран хотя бы один код
 * ответа. Сверять вручную двадцать с лишним ответов смысла нет — источником
 * правды тут `contract/openapi.yaml`, и этот тест сравнивает его с таблицей
 * заглушек.
 *
 * Спецификация читается импортом `?raw`: файл приезжает строкой через
 * преобразователь Vite, и тесту не нужны ни `node:fs`, ни типы Node в
 * tsconfig приложения.
 *
 * Ключ сравнения — пара «код и модель», а не один код: `404` у `POST /bookings`
 * описывает сразу две модели, и заглушка только на одну из них прошла бы мимо
 * второй половины контракта.
 */

type Schema = { $ref?: string; anyOf?: Schema[]; items?: Schema }

type ResponseObject = { content?: Record<string, { schema?: Schema }> }

type OperationObject = { responses?: Record<string, ResponseObject> }

type Spec = {
  paths?: Record<string, Record<string, OperationObject | undefined>>
}

/**
 * Модели из `$ref`, `anyOf` и `items`: у одного кода их может быть несколько.
 *
 * `items` нужен для `GET /bookings`: там ответ — массив, и схема элемента
 * инлайнова, а не `$ref` на верхнем уровне.
 */
const modelsOf = (schema: Schema | undefined): string[] => {
  if (schema === undefined) {
    return []
  }

  if (schema.$ref !== undefined) {
    return [schema.$ref.split('/').pop() ?? '']
  }

  return [...(schema.anyOf ?? []).flatMap(modelsOf), ...modelsOf(schema.items)]
}

/** Пары «код и модель» каждой операции контракта. */
const fromSpec = (): Map<string, Set<string>> => {
  const { paths } = parse(specSource) as Spec
  const result = new Map<string, Set<string>>()

  for (const [path, methods] of Object.entries(paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      if (operation === undefined) {
        continue
      }

      const pairs = new Set<string>()

      for (const [code, response] of Object.entries(operation.responses ?? {})) {
        for (const model of modelsOf(response.content?.['application/json']?.schema)) {
          pairs.add(`${code}/${model}`)
        }
      }

      result.set(`${method.toUpperCase()} ${path}`, pairs)
    }
  }

  return result
}

/** Пары «код и модель», описанные в заглушках. */
const fromStubs = (): Map<string, Set<string>> =>
  new Map(
    Object.entries(stubbedResponses).map(([operation, described]) => [
      operation,
      new Set(described.map(({ status, model }) => `${status}/${model}`)),
    ]),
  )

const responsesInSpec = fromSpec()

describe('заглушки против контракта', () => {
  it('описывает каждую операцию контракта', () => {
    expect([...fromStubs().keys()].sort()).toEqual([...responsesInSpec.keys()].sort())
  })

  it.each([...responsesInSpec.keys()].sort())(
    'разбирает каждый код ответа %s',
    (operation) => {
      const described = fromStubs().get(operation)

      expect(described).toBeDefined()
      expect([...(described ?? [])].sort()).toEqual(
        [...(responsesInSpec.get(operation) ?? [])].sort(),
      )
    },
  )

  it('не описывает ответа, которых нет в контракте', () => {
    for (const [operation, described] of fromStubs()) {
      expect([...described].sort(), operation).toEqual(
        [...(responsesInSpec.get(operation) ?? [])].sort(),
      )
    }
  })
})