import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from './test/server'
import { AppProvider } from './app/AppProvider'
import App from './App'


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
      <AppProvider>
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

  it('голый адрес без Типа ведёт на страницу выбора', async () => {
    server.use(
      http.get('/event-types', () =>
        HttpResponse.json(
          {
            types: [
              {
                id: 'consultation',
                name: 'Консультация',
                description: 'Полчаса',
                durationMinutes: 60,
                bookingCount: 0,
              },
            ],
          },
          { status: 200 },
        ),
      ),
    )
    renderAt('/book')

    expect(await screen.findByRole('heading', { name: 'На что записаться?' })).toBeTruthy()
    // Записи без Типа не существует: календаря на голом адресе быть не должно.
    expect(screen.queryByText('Календарь')).toBeNull()
  })

  it('адрес с Типом открывает запись, а не выбор', async () => {
    server.use(
      http.get('/windows', () =>
        HttpResponse.json(
          { windows: [{ start: '2026-10-08T06:00:00.000Z', end: '2026-10-08T15:00:00.000Z' }] },
          { status: 200 },
        ),
      ),
      http.get('/event-types/consultation', () =>
        HttpResponse.json(
          {
            id: 'consultation',
            name: 'Консультация',
            description: 'Полчаса',
            durationMinutes: 60,
            bookingCount: 0,
          },
          { status: 200 },
        ),
      ),
      http.get('/event-types', () =>
        HttpResponse.json(
          {
            types: [
              {
                id: 'consultation',
                name: 'Консультация',
                description: 'Полчаса',
                durationMinutes: 60,
                bookingCount: 0,
              },
            ],
          },
          { status: 200 },
        ),
      ),
    )
    renderAt('/book/consultation')

    expect(await screen.findByText('Календарь')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'На что записаться?' })).toBeNull()
  })
})