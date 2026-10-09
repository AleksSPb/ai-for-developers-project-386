import { MantineProvider } from '@mantine/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProvider } from '../app/AppProvider'
import { SOURCE_FAILURE_TEXT } from '../app/sourceText'
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

/** Отказ на чтении: то, что страница обязана показать плашкой, а не пустотой. */
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
      <AppProvider>
        <MemoryRouter>
          <TypeSelectionPage />
        </MemoryRouter>
      </AppProvider>
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
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-10-08T06:00:00.000Z'))
  // Длительности разные: иначе «45 мин» нашлось бы дважды и проверка ничего бы
  // не говорила о конкретной карточке.
  server.use(
    withTypes(eventType(), eventType({ id: 'review', name: 'Разбор', durationMinutes: 60 })),
  )
})

afterEach(() => {
  vi.useRealTimers()
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

describe('отказ и повтор', () => {
  it('тот же отказ звучит так же, как на странице записи', async () => {
    server.use(withFailure())
    renderPage()

    // Плашка и текст общие со страницей записи. Расхождение означало бы, что гость,
    // увидевший отказ на выборе, решит: на записи-то работает.
    expect(await screen.findByText('Не удалось загрузить расписание')).toBeTruthy()
    expect(screen.getByText(SOURCE_FAILURE_TEXT)).toBeTruthy()
    expect(screen.queryByText('Сервис временно недоступен')).not.toBeNull()
  })

  it('ждёт один источник и называет один, а не три', () => {
    renderPage()

    // У страницы выбора один источник: называть надо его, а не весь набор приложения.
    // Иначе текст обещал бы ожидание того, чего страница не ждёт.
    expect(screen.getByText('Загружаем типы событий…')).toBeTruthy()
  })

  it('повтор перечитывает источник и показывает данные', async () => {
    const asked = { types: 0 }

    server.use(
      http.get('/event-types', () => {
        asked.types += 1
        return asked.types > 1
          ? HttpResponse.json({ types: [eventType()] }, { status: 200 })
          : HttpResponse.json(
              { code: 'service_unavailable', message: 'Сервис временно недоступен' },
              { status: 503 },
            )
      }),
    )
    renderPage()
    await screen.findByText('Не удалось загрузить расписание')

    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }))

    // Повтор — действие гостя, а не автоматика: до клика страница молчала.
    expect(await screen.findByText('Консультация')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Повторить' })).toBeNull()
  })

  it('ни одного автоматического повтора без действия гостя', async () => {
    const asked = { types: 0 }

    server.use(
      http.get('/event-types', () => {
        asked.types += 1
        return HttpResponse.json(
          { code: 'service_unavailable', message: 'Сервис временно недоступен' },
          { status: 503 },
        )
      }),
    )
    renderPage()
    await screen.findByText('Не удалось загрузить расписание')

    // Живой экран молчит: страница не долбит сервер, который только что сказал, что
    // не отвечает, и не выдаёт повтор за что-то, гость которого ждал.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })

    expect(asked.types).toBe(1)
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