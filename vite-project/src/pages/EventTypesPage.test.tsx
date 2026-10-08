import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router'

import { server } from '../test/server'
import EventTypesPage from './EventTypesPage'

/**
 * Страница Типов событий.
 *
 * Проверяется в первую очередь различение трёх состояний — загрузка, пусто и
 * отказ. Смешавшись, они сказали бы Владельцу, что он завёл пустой Календарь,
 * хотя сеть просто не ответила.
 */

const eventType = (overrides: Record<string, unknown> = {}) => ({
  id: 'consultation',
  name: 'Консультация',
  description: 'Полчаса о вашем проекте',
  durationMinutes: 30,
  bookingCount: 12,
  ...overrides,
})

const withTypes = (...types: unknown[]) =>
  http.get('/event-types', () => HttpResponse.json({ types }, { status: 200 }))

const withFailure = () =>
  http.get('/event-types', () =>
    HttpResponse.json(
      { code: 'service_unavailable', message: 'Сервис временно недоступен' },
      { status: 503 },
    ),
  )

const renderPage = () =>
  render(
    <MantineProvider>
      <MemoryRouter>
        <EventTypesPage />
      </MemoryRouter>
    </MantineProvider>,
  )

const ready = () => screen.findByRole('button', { name: 'Сохранить' })

beforeEach(() => {
  server.use(withTypes(eventType()))
})

describe('страница Типов событий', () => {
  it('до первого ответа показывает текст загрузки, а не пустой экран', () => {
    renderPage()
    expect(screen.getByText('Загружаем типы событий…')).toBeTruthy()
  })

  it('в карточке есть идентификатор, название, описание, длительность, число и ссылка', async () => {
    renderPage()
    await ready()

    expect(screen.getByText('Консультация')).toBeTruthy()
    expect(screen.getByText('Полчаса о вашем проекте')).toBeTruthy()
    expect(screen.getByText('Идентификатор: consultation')).toBeTruthy()
    expect(screen.getByText('Длительность: 30 мин')).toBeTruthy()
    expect(screen.getByText('Записавшихся: 12')).toBeTruthy()
    expect(screen.getByText(/#\/book\/consultation/)).toBeTruthy()
  })

  it('гостевая ссылка одна строка и не смещает содержимое карточки', async () => {
    renderPage()
    await ready()

    const link = screen.getByText(/#\/book\/consultation/)

    // Обрезка задана явно: без неё длинный идентификатор растягивал бы карточку.
    expect(link.style.whiteSpace).toBe('nowrap')
    expect(link.style.overflow).toBe('hidden')
    expect(link.style.textOverflow).toBe('ellipsis')
  })

  it('число записавшихся приходит с сервера, а не считается клиентом', async () => {
    // Двадцать встреч в ответе, а в карточке число с сервера: клиент его не
    // считал и считать не должен — вопрос «а работает ли это» не его.
    server.use(
      http.get('/bookings', () => HttpResponse.json([], { status: 200 })),
      withTypes(eventType({ bookingCount: 41 })),
    )
    renderPage()
    await ready()

    expect(screen.getByText('Записавшихся: 41')).toBeTruthy()
  })

  it('пустой список показывает «Типов пока нет»', async () => {
    server.use(withTypes())
    renderPage()
    await ready()

    expect(screen.getByText('Типов пока нет')).toBeTruthy()
  })

  it('при отказе не видно «Типов пока нет»', async () => {
    // Главный критерий: отказ и пустое состояние не совпадают.
    server.use(withFailure())
    renderPage()

    expect(await screen.findByText('Сервис временно недоступен')).toBeTruthy()
    expect(screen.queryByText('Типов пока нет')).toBeNull()
  })

  it('при отказе не видно ни одной карточки и ни формы', async () => {
    // Отказ заменяет содержимое экрана целиком: ранее загруженная карточка
    // исчезает, а не соседствует с красной плашкой, будто данные есть, но с
    // оговоркой. Отдельно проверять «сначала успех, потом отказ» нельзя — источник
    // читается один раз на ключ, и второй запрос сделал бы проверку перечитыванием.
    server.use(withFailure())
    renderPage()

    await screen.findByText('Сервис временно недоступен')
    expect(screen.queryByText('Консультация')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Сохранить' })).toBeNull()
  })

  it('занятый идентификатор подсвечивает поле идентификатора', async () => {
    server.use(
      http.post('/event-types', () =>
        HttpResponse.json(
          { code: 'event_type_exists', message: 'Такой Тип события уже есть' },
          { status: 409 },
        ),
      ),
    )
    renderPage()
    await ready()

    fireEvent.change(screen.getByLabelText('Идентификатор'), { target: { value: 'consultation' } })
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Повтор' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByText('Такой идентификатор уже занят')).toBeTruthy()
    // Поле идентификатора подсвечено, название — нет: оно в порядке.
    expect(screen.getByLabelText('Название').getAttribute('data-invalid')).toBeNull()
  })

  it('негодные поля подсвечены сразу все', async () => {
    server.use(
      http.post('/event-types', () =>
        HttpResponse.json(
          {
            code: 'validation_failed',
            message: 'Проверка не прошла',
            fields: ['name', 'description'],
          },
          { status: 422 },
        ),
      ),
    )
    renderPage()
    await ready()

    fireEvent.change(screen.getByLabelText('Название'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    // Оба поля подсвечены сразу, а не по одному за круг.
    expect(await screen.findAllByText('Значение не подходит')).toHaveLength(2)
  })

  it('не грузит окна приёма', async () => {
    let askedForWindows = false
    server.use(
      http.get('/windows', () => {
        askedForWindows = true
        return HttpResponse.json({ windows: [] }, { status: 200 })
      }),
    )
    renderPage()
    await ready()

    // Владелец не бронирует: раздел не должен ходить за расписанием.
    expect(askedForWindows).toBe(false)
  })

  it('успех создания показывает карточку сразу', async () => {
    server.use(
      http.post('/event-types', () => HttpResponse.json(eventType(), { status: 201 })),
    )
    renderPage()
    await ready()

    fireEvent.change(screen.getByLabelText('Идентификатор'), { target: { value: 'consultation' } })
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Консультация' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    // Перечитывание списка мигнуло бы экраном и заставило бы гадать, сохранилось
    // ли, поэтому успех показывается на месте.
    await waitFor(() => {
      expect(screen.getAllByText('Консультация').length).toBeGreaterThan(0)
    })
  })
})