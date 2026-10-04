import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createTheme, MantineProvider } from '@mantine/core'
import { HashRouter } from 'react-router'
import '@mantine/core/styles.css'
import './index.css'
import { AppProvider } from './app/AppProvider'
import { createBookingStorage } from './ports/storage'
import App from './App.tsx'

const theme = createTheme({
  primaryColor: 'orange',
  defaultRadius: 'md',
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      {/* HashRouter, а не BrowserRouter: адрес вида /#/book работает на любой
          статической раздаче без серверного fallback, а ссылку можно
          отправить Гостю в чат целиком. */}
      <HashRouter>
        {/* Хранилище создаётся один раз: иначе каждое состояние компонента
            читало бы его заново и получало пустые Брони. */}
        <AppProvider storage={createBookingStorage()}>
          <App />
        </AppProvider>
      </HashRouter>
    </MantineProvider>
  </StrictMode>,
)