import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createTheme, MantineProvider } from '@mantine/core'
import { HashRouter } from 'react-router'
import '@mantine/core/styles.css'
import './index.css'
import { AppProvider } from './app/AppProvider'
import { usesStubs } from './api/config'
import App from './App.tsx'

const theme = createTheme({
  primaryColor: 'orange',
  defaultRadius: 'md',
})

/**
 * Отрисовка ждёт готовности заглушки: иначе приложение успело бы спросить
 * сервер раньше, чем заглушка на него ответит, и показало бы пустоту.
 *
 * Заглушка поднимается только когда адрес сервера не задан: с настоящим сервером
 * она была бы ложью поверх его ответов. Воркер тянется динамическим импортом,
 * чтобы в сборку с сервером он не попал вовсе.
 */
const start = async () => {
  if (usesStubs) {
    const { worker } = await import('./api/worker')
    await worker.start({ onUnhandledRequest: 'error' })
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MantineProvider theme={theme}>
        {/* HashRouter, а не BrowserRouter: адрес вида /#/book работает на любой
            статической раздаче без серверного fallback, а ссылку можно
            отправить Гостю в чат целиком. */}
        <HashRouter>
            <AppProvider>
            <App />
          </AppProvider>
        </HashRouter>
      </MantineProvider>
    </StrictMode>,
  )
}

void start()