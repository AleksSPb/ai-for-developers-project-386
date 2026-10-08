import { useEffect, useState } from 'react'

/**
 * Состояние одного источника данных.
 *
 * Три состояния, а не один флаг: «грузятся», «пришли» и «сервер отказал»
 * требуют разных слов на экране. Отказ и пустой список нельзя смешивать —
 * пустой список это «данных нет», а отказ «данные неизвестны».
 */
export type SourceState<T> =
  | { kind: 'загрузка' }
  | { kind: 'готов'; value: T }
  | { kind: 'отказ'; message: string }

/** Приводит ответ операции к состоянию источника, разбирая статус. */
export const fromResponse = <T>(
  response: { status: number; data: unknown },
  pick: (data: never) => T,
): SourceState<T> => {
  if (response.status >= 200 && response.status < 300) {
    return { kind: 'готов', value: pick(response.data as never) }
  }

  const message = (response.data as { message?: string }).message

  return { kind: 'отказ', message: message ?? 'Сервис временно недоступен' }
}

/** Первый непришедший источник из перечисленных — его и называют на экране. */
export const firstMissing = (
  sources: Record<string, SourceState<unknown>>,
  names: readonly string[],
): string | null => {
  for (const name of names) {
    if (sources[name]?.kind === 'загрузка') {
      return name
    }
  }

  return null
}

/** Отказавший источник, если он есть. */
export const firstFailure = (
  sources: Record<string, SourceState<unknown>>,
): { name: string; message: string } | null => {
  for (const [name, state] of Object.entries(sources)) {
    if (state.kind === 'отказ') {
      return { name, message: state.message }
    }
  }

  return null
}

/**
 * Один источник данных с чтением при монтировании и по смене ключа.
 *
 * Состояние хранится вместе с ключом, а «загрузка» выводится из несовпадения
 * ключей, а не ставится эффектом: `setState` прямо в эффекте означал бы лишний
 * рендер на каждый запуск и запрещён правилом react-hooks.
 *
 * Чтение отменяется на размонтировании и при смене ключа: пришедший позже ответ
 * не должен перезаписать то, что уже показано, — иначе переход между страницами
 * показывал бы выдержку из прошлой страницы.
 */
export const useSource = <T>(
  read: () => Promise<SourceState<T>>,
  key: string,
): SourceState<T> => {
  const [loaded, setLoaded] = useState<{ key: string; state: SourceState<T> } | null>(null)

  useEffect(() => {
    let isCurrent = true

    void read().then((state) => {
      if (isCurrent) {
        setLoaded({ key, state })
      }
    })

    return () => {
      isCurrent = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return loaded?.key === key ? loaded.state : { kind: 'загрузка' }
}