import { useEffect, useState } from 'react'

import { getNow } from './clock'

/**
 * Минута — минимальный сдвиг, который что-то меняет в интерфейсе: в Слотах
 * время хранится минутами, и пересчёт чаще просто перерисовывает то же самое.
 */
const tickMs = 60_000

/**
 * Текущий момент, который сам обновляется.
 *
 * В фоновой вкладке таймер не пишет состояние, иначе браузер, отправив фон на
 * минуту, при возврате отдал бы Гостю устаревшее расписание, но увидел бы
 * свежие счётчики. Пересчёт происходит в момент возврата вкладки в фокус.
 */
export const useNow = (): Date => {
  const [now, setNow] = useState(getNow)

  useEffect(() => {
    const update = () => {
      if (!document.hidden) {
        setNow(getNow())
      }
    }
    const timer = window.setInterval(update, tickMs)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  return now
}