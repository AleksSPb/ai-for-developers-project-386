import { useEffect } from 'react'

/**
 * Пятиминутный сторож.
 *
 * Пять минут — потому что встреча появляется от записи Гостя, а не от правки
 * Владельца: без сторожа он узнал бы о ней только после ручного обновления.
 *
 * **Отдельный хук, а не свойство источника:** сторож один на страницу и
 * перечитывает все её источники, а не свой. Страница, которой он не достался,
 * не должна унаследовать чужой опрос, и наоборот.
 *
 * В скрытой вкладке таймер не ходит: браузер, который Владелец закрыл, не должен
 * делать запросы за него. Перечитывание происходит в момент возврата вкладки в
 * фокус, и «сейчас» к тому моменту уже догоняет реальность.
 *
 * Таймер перезапускается вместе с составом источников: сменилась страница —
 * сменилось и то, что он опрашивает.
 */
export const useReloadEvery = (reload: () => void, intervalMs: number): void => {
  useEffect(() => {
    const update = () => {
      if (!document.hidden) {
        reload()
      }
    }

    const timer = window.setInterval(update, intervalMs)
    document.addEventListener('visibilitychange', update)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', update)
    }
  }, [reload, intervalMs])
}