import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { server } from '../test/server'
import MeetingsPage from './MeetingsPage'

/**
 * Страница встреч.
 *
 * Смысл проверок — в источниках и в разведении пустых состояний: страница
 * встреч грузит два источника и не грузит окна, а её «Встреч пока нет» не должно
 * совпадать с гостевым «Записей пока нет».
 */

const eventType = { id: 'consultation', name: 'Консультация', description: 'Полчаса', durationMinutes: 30, bookingCount: 1 }

const booking = {
  id: 'b1',
  eventTypeId: 'consultation',
  timeRange: { start: '2026-10-09T07:00:00.000Z', end: '2026-10-09T07:30:00.000Z' },
  guestName: 'Иван',
  guestEmail: 'ivan@example.com',
  createdAt: '2026-10-08T10:00:00.000Z',
}

const withSources = (
  bookings: unknown[] = [],
  types: unknown[] = [eventType],
) => {
  server.use(
    http.get('/bookings', () => HttpResponse.json(bookings, { status: 200 })),
    http.get('/event-types', () => HttpResponse.json({ types }, { status: 200 })),
  )
}

const renderPage = () =>
  render(
    <MantineProvider>
      <MemoryRouter>
        <MeetingsPage />
      </MemoryRouter>
    </MantineProvider>,
  )

beforeEach(() => {
  withSources([booking])
})

describe('страница встреч', () => {
  it('до первого ответа показывает текст загрузки', () => {
    renderPage()
    expect(screen.getByText('Загружаем встречи…')).toBeTruthy()
  })

  it('показывает встречу с названием Типа, гостем и интервалом', async () => {
    renderPage()
    expect(await screen.findByText('Консультация')).toBeTruthy()
    expect(screen.getByText('Иван')).toBeTruthy()
    expect(screen.getByText(/10:00 – 10:30/)).toBeTruthy()
  })

  it('пустое состояние говорит «Встреч пока нет», а не «Записей пока нет»', async () => {
    withSources([])
    renderPage()

    expect(await screen.findByText('Встреч пока нет')).toBeTruthy()
    // Совпадение с гостевой страницей заставило бы Владельца искать записи там.
    expect(screen.queryByText('Записей пока нет')).toBeNull()
  })

  it('при отказе не видно «Встреч пока нет»', async () => {
    server.use(
      http.get('/bookings', () =>
        HttpResponse.json(
          { code: 'service_unavailable', message: 'Сервис временно недоступен' },
          { status: 503 },
        ),
      ),
      http.get('/event-types', () => HttpResponse.json({ types: [] }, { status: 200 })),
    )
    renderPage()

    expect(await screen.findByText('Сервис временно недоступен')).toBeTruthy()
    expect(screen.queryByText('Встреч пока нет')).toBeNull()
  })

  it('грузит два источника и не грузит окна приёма', async () => {
    const asked = { bookings: 0, types: 0, windows: 0 }
    server.use(
      http.get('/bookings', () => {
        asked.bookings += 1
        return HttpResponse.json([booking], { status: 200 })
      }),
      http.get('/event-types', () => {
        asked.types += 1
        return HttpResponse.json({ types: [eventType] }, { status: 200 })
      }),
      http.get('/windows', () => {
        asked.windows += 1
        return HttpResponse.json({ windows: [] }, { status: 200 })
      }),
    )
    renderPage()
    await screen.findByText('Консультация')

    expect(asked.bookings).toBe(1)
    expect(asked.types).toBe(1)
    // Владелец не бронирует и расписание не смотрит.
    expect(asked.windows).toBe(0)
  })

  it('встреча с удалённым Типом не исчезает', async () => {
    withSources([booking], [])
    renderPage()

    // Тип могли удалить, а Встреча всё равно случилась и всё равно заняла время.
    expect(await screen.findByText('Тип события больше не заведён')).toBeTruthy()
    expect(screen.getByText('Иван')).toBeTruthy()
  })

  it('из раздела есть ссылка «Записаться» в гостевую страницу', async () => {
    renderPage()
    const link = await screen.findByText('Записаться')

    expect(link.getAttribute('href')).toBe('/book')
  })
})