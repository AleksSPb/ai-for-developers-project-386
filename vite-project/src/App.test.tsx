import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from './test/server'
import { AppProvider } from './app/AppProvider'
import type { BookingStorage } from './ports/storage'
import App from './App'

/** Хранилище-заглушка: гостевой странице провайдер нужен, данные тут ни при чём. */
const storage: BookingStorage = { read: () => [], write: () => {} }

/**
 * Раздел Владельца разведён с гостевой частью по адресам.
 *
 * Типы событий и Встречи — разные адреса, а не один экран: у страниц разный
 * состав источников. И гостевую шапку нельзя засорять ссылкой на раздел —
 * единственный вход в него ручной, и Гость про Владельца не знает.
 */

const withSources = () => {
  server.use(
    http.get('/bookings', () => HttpResponse.json([], { status: 200 })),
    http.get('/event-types', () =>
      HttpResponse.json({ types: [] }, { status: 200 }),
    ),
  )
}

const renderAt = (path: string) =>
  render(
    <MantineProvider>
      <AppProvider storage={storage}>
        <MemoryRouter initialEntries={[path]}>
          <App />
        </MemoryRouter>
      </AppProvider>
    </MantineProvider>,
  )

beforeEach(() => {
  withSources()
})

describe('раздел Владельца', () => {
  it('Типы событий и Встречи живут на разных адресах', async () => {
    renderAt('/event-types')
    expect(await screen.findByRole('heading', { name: 'Типы событий' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Встречи' })).toBeNull()
  })

  it('по адресу встреч открывается страница встреч, а не типов', async () => {
    renderAt('/meetings')
    expect(await screen.findByRole('heading', { name: 'Встречи' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Типы событий' })).toBeNull()
  })

  it('в гостевой шапке нет ссылки на раздел Владельца', async () => {
    renderAt('/book')
    await screen.findByRole('heading', { name: 'Запись на звонок' })

    // Гость про Владельца не знает, и ссылка в шапке спросила бы его об этом.
    expect(screen.queryByRole('link', { name: 'Типы событий' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Встречи' })).toBeNull()
  })

  it('в шапке раздела есть ссылки на оба экрана и выход в гостевую страницу', async () => {
    renderAt('/event-types')
    await screen.findByRole('heading', { name: 'Типы событий' })

    expect(screen.getByRole('link', { name: 'Типы событий' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Встречи' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Записаться' })).toBeTruthy()
  })

  it('гостевая страница записи по-прежнему открывается', async () => {
    renderAt('/book')
    expect(await screen.findByRole('heading', { name: 'Запись на звонок' })).toBeTruthy()
  })
})