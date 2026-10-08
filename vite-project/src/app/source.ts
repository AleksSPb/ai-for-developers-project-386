import { useCallback, useEffect, useState } from 'react'

/**
 * Состояние одного источника данных.
 *
 * Три состояния, а не один флаг: «грузятся», «пришли» и «сервер отказал»
 * требуют разных слов на экране. Отказ и пустой список нельзя смешивать —
 * пустой список это «данных нет», а отказ «данные неизвестны».
 *
 * Четвёртое состояние, «нет такого», живёт не здесь, а в источниках, где оно
 * значит что-то конкретное: на странице записи это `404` на одиночном чтении
 * Типа, и гостю полагается совсем другой экран, чем при серверном отказе.
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

/** Источник вместе с действием перечитывания. */
export interface ReloadableSource<T> {
  state: SourceState<T>
  /** Перечитать источник: то, чем его обновляет пятиминутный сторож. */
  reload: () => void
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
 * Один источник данных с чтением при монтировании, по смене ключа и по требованию.
 *
 * Состояние хранится вместе с ключом, а «загрузка» выводится из несовпадения
 * ключей, а не ставится эффектом: `setState` прямо в эффекте означал бы лишний
 * рендер на каждый запуск и запрещён правилом react-hooks.
 *
 * Перечитывание **не** возвращает источник в состояние «загрузка»: иначе
 * пятиминутный сторож стирал бы список встреч у Владельца каждые пять минут и
 * мигал экраном вместо обновления. Прежние данные остаются, пока не пришёл новый
 * ответ; пришедший отказ убирает их совсем.
 *
 * Чтение отменяется на размонтировании, при смене ключа и при новой выгрузке:
 * пришедший позже ответ не должен перезаписать более свежий — иначе переход между
 * страницами показывал бы выдержку из прошлой страницы.
 *
 * Читающая функция в зависимостях не указана намеренно: она должна быть одной и
 * той же для всей жизни источника, иначе эффект перезапускался бы на каждом
 * рендере. Все источники объявляют её на уровне модуля.
 */
export const useSource = <T>(
  read: () => Promise<SourceState<T>>,
  key: string,
): ReloadableSource<T> => {
  const [loaded, setLoaded] = useState<{ key: string; state: SourceState<T> } | null>(null)
  const [version, setVersion] = useState(0)

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
  }, [key, version])

  const reload = useCallback(() => setVersion((current) => current + 1), [])

  return { state: loaded?.key === key ? loaded.state : { kind: 'загрузка' }, reload }
}