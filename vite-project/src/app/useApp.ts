import { use } from 'react'

import { AppContext, type AppContextValue } from './appContext'

/** Состояние приложения вне компонента: сколько Броней, что за «сейчас», как забронировать. */
export const useApp = (): AppContextValue => {
  const value = use(AppContext)
  if (value === null) {
    throw new Error('useApp вызван вне AppProvider')
  }
  return value
}