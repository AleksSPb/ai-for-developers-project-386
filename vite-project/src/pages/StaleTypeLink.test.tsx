import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { AppProvider } from '../app/AppProvider'
import { server } from '../test/server'
import BookingPage from '../pages/BookingPage'
import TypeSelectionPage from './TypeSelectionPage'

/**
 * Устаревшая ссылка ведёт к выбору, а не к пустоте.
 *
 * Гость пришёл по ссылке из чата, Типа по ней больше нет. Показывать ему страницу
 * записи с пустым набором Слотов значило бы показать интерфейс, который не может
 * предложить ничего, — и молчал бы, будто записаться нельзя нигде.
 */

const eventType = {
  id: 'consultation',
  name: 'Консультация',
  description: 'Полчаса о вашем проекте',
  durationMinutes: 60,
  bookingCount: 0,
}

const withType = (status: number) =>
  http.get('/event-types/consultation', () =>
    status === 200
      ? HttpResponse.json(eventType, { status: 200 })
      : HttpResponse.json(
          { code: 'event_type_not_found', message: 'Тип события не найден' },
          { status },
        ),
  )

const withWindows = () =>
  http.get('/windows', () =>
    HttpResponse.json(
      {
        windows: [
          { start: '2026-10-08T06:00:00.000Z', end: '2026-10-08T15:00:00.000Z' },
        ],
      },
      { status: 200 },
    ),
  )

const withTypeList = (...types: unknown[]) =>
  http.get('/event-types', () => HttpResponse.json({ types }, { status: 200 }))

/** Маршруты как в приложении: без них проверить «ведёт к выбору» нельзя. */
/**
 * Ожидание страницы выбора.
 *
 * Таймаут поднят намеренно: к моменту перехода успевают пройти два запроса —
 * одиночное чтение Типа (оно и даёт 404) и список для самой страницы выбора.
 * Под нагрузкой параллельных прогонов стандартной секунды не хватало, и тест
 * мигал, хотя логика была верной.
 */
const findSelection = () =>
  screen.findByRole('heading', { name: 'На что записаться?' }, { timeout: 5000 })

const renderAt = (path: string) =>
  render(
    <MantineProvider>
      <AppProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/book" element={<TypeSelectionPage />} />
            <Route path="/book/:eventTypeId" element={<BookingPage eventTypeId="consultation" />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>
    </MantineProvider>,
  )

beforeEach(() => {
  server.use(withWindows(), withTypeList(eventType))
})

describe('устаревшая ссылка', () => {
  it('открывает страницу выбора, а не страницу записи с пустым набором', async () => {
    server.use(withType(404), withTypeList(eventType))
    renderAt('/book/consultation')

    expect(await findSelection()).toBeTruthy()
    // Главное: календаря на устаревшей ссылке нет вообще.
    expect(screen.queryByText('Календарь')).toBeNull()
    expect(screen.queryByText('Статус слотов')).toBeNull()
  })

  it('не показывает ошибку про ссылку и не красную плашку', async () => {
    server.use(withType(404), withTypeList(eventType))
    renderAt('/book/consultation')
    await findSelection()

    expect(screen.queryByText('Не удалось загрузить расписание')).toBeNull()
    expect(screen.queryByText('Тип события не найден')).toBeNull()
  })

  it('по ссылке на существующий Тип открывает запись, а не выбор', async () => {
    server.use(withType(200), withTypeList(eventType))
    renderAt('/book/consultation')

    expect(await screen.findByText('Календарь')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'На что записаться?' })).toBeNull()
  })

  it('прочий отказ остаётся отказом и говорит текстом приложения', async () => {
    // 503 — это «данные неизвестны», и гостю полагается красная плашка, а не выбор.
    server.use(withType(503), withTypeList(eventType))
    renderAt('/book/consultation')

    expect(await screen.findByText('Не удалось загрузить расписание')).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'На что записаться?' })).toBeNull()
    // Плашка общая со всеми страницами и говорит своим текстом: тот же отказ на
    // странице выбора звучал бы иначе, и гость решил бы, что сломалось только то
    // место, откуда он пришёл.
    expect(screen.getByText('Сервис временно недоступен')).toBeTruthy()
    expect(screen.queryByText('Тип события не найден')).toBeNull()
  })

  it('выбор при устаревшей ссылке показывает настоящие Типы, а не «пусто»', async () => {
    // Страница выбора читает список. Если бы Типа из адреса не было, а список
    // пришёл, гость видит выбор, а не пустоту.
    server.use(withType(404), withTypeList(eventType, { ...eventType, id: 'review', name: 'Разбор' }))
    renderAt('/book/consultation')

    expect(await screen.findByText('Консультация')).toBeTruthy()
    expect(screen.getByText('Разбор')).toBeTruthy()
  })
})

describe('какие операции зовёт каждая страница', () => {
  it('страница записи зовёт чтение одного Типа и не зовёт список', async () => {
    const asked = { single: 0, list: 0 }
    server.use(
      withWindows(),
      http.get('/event-types/consultation', () => {
        asked.single += 1
        return HttpResponse.json(eventType, { status: 200 })
      }),
      http.get('/event-types', () => {
        asked.list += 1
        return HttpResponse.json({ types: [] }, { status: 200 })
      }),
    )
    renderAt('/book/consultation')
    await screen.findByText('Календарь')

    // Гость по прямой ссылке списка не имеет, и тянуть его ради одного Типа —
    // работа без пользы.
    expect(asked.single).toBe(1)
    expect(asked.list).toBe(0)
  })

  it('страница выбора зовёт список и не зовёт одиночное чтение', async () => {
    const asked = { single: 0, list: 0 }
    server.use(
      http.get('/event-types', () => {
        asked.list += 1
        return HttpResponse.json({ types: [eventType] }, { status: 200 })
      }),
      http.get('/event-types/consultation', () => {
        asked.single += 1
        return HttpResponse.json(eventType, { status: 200 })
      }),
    )
    renderAt('/book')
    await screen.findByText('Консультация')

    // Один и тот же Тип не должен приходить двумя разными ответами: иначе
    // расхождение в счётчике обнаружилось бы поздно и негде.
    expect(asked.list).toBe(1)
    expect(asked.single).toBe(0)
  })
})