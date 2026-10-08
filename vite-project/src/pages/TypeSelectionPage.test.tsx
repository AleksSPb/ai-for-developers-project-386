import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import { TEXT_LIMITS } from '../app/textLimits'
import { server } from '../test/server'
import TypeSelectionPage from './TypeSelectionPage'

/**
 * Страница выбора Типа события.
 *
 * Проверяется, что страница показывает **только** карточки Типов: ни Слота, ни
 * календаря, ни счётчика. Окна приёма ей не нужны — рисовать тут нечего, поэтому
 * лишний запрос был бы и лишним ожиданием.
 */

const eventType = (overrides: Record<string, unknown> = {}) => ({
  id: 'consultation',
  name: 'Консультация',
  description: 'Полчаса о вашем проекте',
  durationMinutes: 45,
  bookingCount: 12,
  ...overrides,
})

const withTypes = (...types: unknown[]) =>
  http.get('/event-types', () => HttpResponse.json({ types }, { status: 200 }))

const renderPage = () =>
  render(
    <MantineProvider>
      <MemoryRouter>
        <TypeSelectionPage />
      </MemoryRouter>
    </MantineProvider>,
  )

/**
 * Готовность страницы — первая карточка на экране.
 *
 * Ссылок «Выбрать» столько же, сколько Типов, поэтому берём их списком: в наборе
 * по умолчанию их две, и `findByRole` спотыкался бы о множественность.
 */
const ready = async () => {
  await screen.findAllByRole('link', { name: 'Выбрать' })
}

beforeEach(() => {
  // Длительности разные: иначе «45 мин» нашлось бы дважды и проверка ничего бы
  // не говорила о конкретной карточке.
  server.use(
    withTypes(eventType(), eventType({ id: 'review', name: 'Разбор', durationMinutes: 60 })),
  )
})

describe('описание на границе', () => {
  it('показывается целиком, а не с многоточием', async () => {
    // Обрезанное описание сделало бы два одинаково названных Типа неразличимыми для
    // Гостя, и он не увидел бы почему. Карточка потому и обязана показать целиком.
    const long = 'я'.repeat(TEXT_LIMITS.description)
    server.use(withTypes(eventType({ description: long })))
    renderPage()
    await ready()

    expect(screen.getByText(long)).toBeTruthy()
  })

  it('два Типа с одинаковым названием остаются различимыми по описанию', async () => {
    // Названия не уникальны: описание — единственное, чем Типы различаются на
    // странице выбора.
    server.use(
      withTypes(
        eventType({ id: 'first', name: 'Консультация', description: 'Полчаса о вашем проекте' }),
        eventType({ id: 'second', name: 'Консультация', description: 'Час о вашем проекте' }),
      ),
    )
    renderPage()
    await ready()

    expect(screen.getByText('Полчаса о вашем проекте')).toBeTruthy()
    expect(screen.getByText('Час о вашем проекте')).toBeTruthy()
  })
})

describe('страница выбора Типа', () => {
  it('до прихода ответа показывает текст загрузки, а не пустой экран', () => {
    renderPage()
    expect(screen.getByText('Загружаем типы событий…')).toBeTruthy()
  })

  it('карточка показывает название, описание и длительность', async () => {
    renderPage()
    await ready()

    expect(screen.getByText('Консультация')).toBeTruthy()
    expect(screen.getAllByText('Полчаса о вашем проекте')).toHaveLength(2)
    // Длительность видна гостю ровно здесь, как обещание до перехода.
    expect(screen.getByText('45 мин')).toBeTruthy()
  })

  it('на странице нет ни календаря, ни Слотов, ни счётчика', async () => {
    renderPage()
    await ready()

    // Число записанвшихся — вопрос Владельца, и на странице выбора оно было бы
    // обещанием, которое сдержится только после перехода.
    expect(screen.queryByText('Записавшихся: 12')).toBeNull()
    expect(screen.queryByText('Календарь')).toBeNull()
    expect(screen.queryByText('Статус слотов')).toBeNull()
  })

  it('не обращается к Окнам приёма', async () => {
    let askedForWindows = false
    server.use(
      http.get('/windows', () => {
        askedForWindows = true
        return HttpResponse.json({ windows: [] }, { status: 200 })
      }),
    )
    renderPage()
    await ready()

    expect(askedForWindows).toBe(false)
  })

  it('Тип без отметки о помещаемости показан как все', async () => {
    // Отмечать нечем: Окон страница не грузит. Скрывать такой Тип отвергнуто —
    // он существует, на него ссылается Владелец, и исчезновение из выбора
    // выглядело бы как сбой.
    server.use(withTypes(eventType({ durationMinutes: 600 })))
    renderPage()
    await ready()

    expect(screen.getByText('Консультация')).toBeTruthy()
    expect(screen.getByText('600 мин')).toBeTruthy()
    expect(screen.queryByText(/не помещается/i)).toBeNull()
  })

  it('каждая карточка ведёт на запись своего Типа', async () => {
    renderPage()
    await ready()

    const links = screen.getAllByRole('link', { name: 'Выбрать' })
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/book/consultation',
      '/book/review',
    ])
  })

  it('пустой список даёт свой текст, не совпадающий с чужими', async () => {
    server.use(withTypes())
    renderPage()

    const empty = await screen.findByText('Доступных для записи типов событий нет')
    expect(empty).toBeTruthy()
    // Три разных вопроса — три разных ответа; совпадение текстов отправляло бы
    // читателя на чужую страницу.
    expect(screen.queryByText('Записей пока нет')).toBeNull()
    expect(screen.queryByText('Типов пока нет')).toBeNull()
  })

  it('отказ показан тем же текстом, что на остальных страницах', async () => {
    server.use(
      http.get('/event-types', () =>
        HttpResponse.json(
          { code: 'service_unavailable', message: 'Сервис временно недоступен' },
          { status: 503 },
        ),
      ),
    )
    renderPage()

    // Один и тот же компонент отказа на всех страницах: один отказ не должен
    // звучать по-разному в зависимости от точки входа.
    expect(await screen.findByText('Сервис временно недоступен')).toBeTruthy()
    expect(screen.getByText('Не удалось загрузить расписание')).toBeTruthy()
    expect(screen.queryByText('Доступных для записи типов событий нет')).toBeNull()
  })
})