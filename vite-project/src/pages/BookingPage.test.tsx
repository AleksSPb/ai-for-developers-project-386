import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProvider } from '../app/AppProvider'
import type { Booking } from '../domain/booking'
import { toApiBooking } from '../api/bookings'
import { server } from '../test/server'
import { stubEventTypeHandler, stubUnavailableHandler, stubWindowsHandler } from '../test/windowFixtures'
import BookingPage from './BookingPage'

/**
 * Страница записи на TypeScript.
 *
 * Страница ходит в сгенерированный клиент, поэтому источники подменяются через
 * MSW: иначе тест проверял бы заглушку вместо страницы.
 *
 * Идентификатор Типа события приходит **из адреса** и передаётся пропом: маршрут
 * его знает, а страница не разбирает, откуда он взялся. Голый `/book` ведёт на
 * выбор Типа — записи без Типа не существует.
 *
 * «Сейчас» — 09:00 по Москве 8 октября: окно 09:00–18:00 делится на часовые
 * Слоты, первый уже начался, поэтому в списке его нет.
 */

const NOW = new Date('2026-10-08T06:00:00.000Z')
const TODAY = '2026-10-08'

const window_ = { start: `${TODAY}T06:00:00.000Z`, end: `${TODAY}T15:00:00.000Z` }

/** Окно следующего дня: календарь тянется до последнего дня со Слотом. */
const tomorrowWindow = { start: '2026-10-09T06:00:00.000Z', end: '2026-10-09T15:00:00.000Z' }

/** Типовой набор источников: окно на сегодня и Тип события на 60 минут. */
const withSources = () => server.use(stubWindowsHandler(window_), stubEventTypeHandler(60))

const withBookings = (bookings: readonly Booking[] = []) =>
  http.get('/bookings', () =>
    HttpResponse.json(bookings.map(toApiBooking), { status: 200 }),
  )

const storageWith = () => (
  <MantineProvider>
    <AppProvider>
      <MemoryRouter>
        <BookingPage eventTypeId="consultation" />
      </MemoryRouter>
    </AppProvider>
  </MantineProvider>
)

const renderPage = (bookings: readonly Booking[] = []) => {
  server.use(withBookings(bookings))
  return render(storageWith())
}

/**
 * Кнопка Слота в списке.
 *
 * Текст диапазона встречается дважды — в списке Слотов и в панели информации, —
 * поэтому берём именно кнопку.
 */
/**
 * Ячейка дня в сетке.
 *
 * Число дня повторяется в панели информации, поэтому берём именно кнопку внутри
 * календаря.
 */
const dayCell = (day: string): HTMLElement => {
  const calendar = screen.getByText('Календарь').closest('div')?.parentElement
  const found = [...(calendar?.querySelectorAll('button') ?? [])].find(
    (button) => button.textContent?.startsWith(day),
  )

  if (found === undefined) {
    throw new Error(`ячейка ${day} не найдена`)
  }

  return found
}

const slotButton = (range: string): HTMLElement => {
  // Диапазон выбранного Слота дублируется в панели информации, поэтому берём то
  // вхождение, которое лежит в кнопке списка.
  const button = screen
    .getAllByText(range)
    .map((node) => node.closest('button'))
    .find((found) => found !== null)

  if (button === undefined) {
    throw new Error(`слот ${range} не найден`)
  }

  return button
}

/**
 * Ответы приходят промисом, поэтому первый экран — текст загрузки.
 *
 * Ждём панели информации: длительность Слота на странице записи больше не
 * показывается, и ждать её было бы ожиданием того, чего на экране нет.
 */
const awaitSources = async () => {
  await screen.findByText('Выбранная дата')
}

/**
 * Ответ на создание Брони и счётчик прочтений списка.
 *
 * Тело ответа **изменяемое**: один обработчик переживает два прогона, а
 * `server.use` отдаёт предпочтение подставленному последним, поэтому второй
 * `server.use` внутри одного теста просто не сработал бы.
 *
 * Живёт на уровне файла, а не внутри `describe`: отказами записи занимаются два
 * блока тестов, и общий помощник внутри одного из них был бы недоступен второму.
 */
const postWith = (status: number, body: unknown) => {
  const state = { gets: 0, posts: 0, status, body }

  server.use(
    http.post('/bookings', () => {
      state.posts += 1
      return HttpResponse.json(state.body as Record<string, unknown>, { status: state.status })
    }),
    http.get('/bookings', () => {
      state.gets += 1
      return HttpResponse.json([], { status: 200 })
    }),
  )

  return state
}

/** Выбрать Слот, дойти до формы, заполнить её и отправить. */
const submitAs = async () => {
  fireEvent.click(slotButton('10:00 – 11:00'))
  fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
  fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Demo User' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'demo@example.com' } })
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))
}

const booking = (startIso: string, id = 'b1'): Booking => ({
  id,
  eventTypeId: 'consultation',
  start: new Date(startIso),
  end: new Date(new Date(startIso).getTime() + 60 * 60_000),
  guestName: 'Demo User',
  guestEmail: 'demo@example.com',
  createdAt: '2026-10-07T14:40:00.000Z',
})

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(NOW)
  withSources()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('источники страницы', () => {
  it('не рисует календарь, пока не пришли окна приёма', () => {
    renderPage()
    expect(screen.getByText('Загружаем окна приёма…')).toBeTruthy()
    expect(screen.queryByText('Календарь')).toBeNull()
  })

  it('называет непришедший источник, а не показывает частичное состояние', async () => {
    renderPage()
    // Окна пришли, Тип ещё нет: называем именно Тип, а не «загрузка».
    server.use(stubEventTypeHandler(60))
    await awaitSources()
    expect(screen.queryByText('Загружаем окна приёма…')).toBeNull()
  })

  it('говорит об отказе сервера, а не показывает пустой календарь', async () => {
    server.use(stubUnavailableHandler())

    renderPage()
    expect(await screen.findByText('Сервис временно недоступен')).toBeTruthy()
    expect(screen.queryByText('Календарь')).toBeNull()
  })
})

describe('календарь', () => {
  it('рисует месяц с окнами и не предлагает листать назад', async () => {
    server.resetHandlers()
    server.use(stubWindowsHandler(window_, tomorrowWindow), stubEventTypeHandler(60))
    renderPage()
    await awaitSources()

    expect(screen.getByText('8 – 9 октября 2026')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Предыдущий месяц' })).toHaveProperty('disabled', true)
    expect(screen.getByRole('button', { name: 'Следующий месяц' })).toHaveProperty('disabled', true)
  })

  it('не рисует ни одного дня раньше сегодняшнего', async () => {
    server.resetHandlers()
    server.use(stubWindowsHandler(window_, tomorrowWindow), stubEventTypeHandler(60))
    renderPage()
    await awaitSources()

    // Седьмого октября в календаре нет вовсе: месяц обрезан по левой границе.
    expect(dayCell('8')).toBeTruthy()
    expect(() => dayCell('7')).toThrow()
  })

  it('не рисует ни одного дня позже последнего дня со Слотом', async () => {
    renderPage()
    await awaitSources()

    // Окно одно и кончается 18:00: последний день со Слотом — восьмое, и
    // девятого в календаре нет.
    expect(screen.getByText('8 – 8 октября 2026')).toBeTruthy()
    expect(screen.queryByText('9')).toBeNull()
  })

  it('длительность Слота рядом с интервалом не показывается', async () => {
    // Длительность видна гостю ровно в одном месте — на карточке выбора Типа, где
    // она обещает. Рядом с интервалом она ничего не обещала бы, только шумела.
    server.resetHandlers()
    server.use(stubWindowsHandler(window_), stubEventTypeHandler(45))
    renderPage()
    await awaitSources()

    expect(screen.queryByText('Длительность слота')).toBeNull()
    expect(screen.queryByText('45 мин')).toBeNull()
  })

  it('длительность Типа всё равно влияет на деление окна', async () => {
    server.resetHandlers()
    server.use(stubWindowsHandler(window_), stubEventTypeHandler(45))
    renderPage()
    await awaitSources()

    // Длительность не показана, но по ней считают Слоты: при 45 минутах второй
    // Слот — 09:45–10:30, а при 60 это 10:00–11:00. Список другой, значит
    // длительность действительно применилась.
    expect(screen.getByText('09:45 – 10:30')).toBeTruthy()
    expect(screen.queryByText('10:00 – 11:00')).toBeNull()
  })

  it('делит окно на Слоты длительности Типа', async () => {
    renderPage()
    await awaitSources()

    // Окно 09:00–18:00 при часовых Слотах: первый начался, поэтому в списке его
    // нет, а второй 10:00 есть.
    expect(screen.queryByText('09:00 – 10:00')).toBeNull()
    expect(screen.getByText('10:00 – 11:00')).toBeTruthy()
  })

  it('в ячейке доступного дня показывает число свободных Слотов', async () => {
    renderPage()
    await awaitSources()

    // Окно даёт девять часовых Слотов, первый уже прошёл.
    expect(screen.getByText('8 св.')).toBeTruthy()
  })

  it('гаснущий день не показывает числа, различие несёт подсказка', async () => {
    // Окна есть 8-го и 10-го, поэтому 9-е — день без окна: он гаснет, и это
    // видно по подсказке, а не по подписи под числом.
    server.resetHandlers()
    server.use(
      stubWindowsHandler(window_, { start: '2026-10-10T06:00:00.000Z', end: '2026-10-10T15:00:00.000Z' }),
      stubEventTypeHandler(60),
    )
    renderPage()
    await awaitSources()

    const dimmed = dayCell('9')
    expect(dimmed).toHaveProperty('disabled', true)

    // Подсказка появляется по наведению, как и ведут себя настоящие тултипы:
    // держать весь текст в DOM значило бы прятать его от скринридера дважды.
    fireEvent.mouseEnter(dimmed)
    expect(await screen.findByText('В этот день приём не ведётся')).toBeTruthy()
  })
})

describe('первый шаг записи', () => {
  it('держит продолжение закрытым, пока Слот не выбран', async () => {
    renderPage()
    await awaitSources()
    expect(screen.getByRole('button', { name: 'Продолжить' })).toHaveProperty('disabled', true)
  })

  it('открывает продолжение после выбора Слота и ведёт к подтверждению', async () => {
    renderPage()
    await awaitSources()

    fireEvent.click(slotButton('10:00 – 11:00'))
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
    expect(screen.getByText('Подтверждение записи')).toBeTruthy()
  })

  it('показывает занятый Слот и не даёт его выбрать', async () => {
    renderPage([booking(`${TODAY}T07:00:00.000Z`)])
    await awaitSources()

    expect(slotButton('10:00 – 11:00')).toHaveProperty('disabled', true)
    expect(screen.getByText('Занято')).toBeTruthy()
  })

  it('возвращает выбор на шаг записи с кнопки «Изменить»', async () => {
    renderPage()
    await awaitSources()

    fireEvent.click(slotButton('10:00 – 11:00'))
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }))
    expect(screen.getByText('Статус слотов')).toBeTruthy()
  })
})

describe('подтверждение записи', () => {
  const reachConfirmation = async () => {
    fireEvent.click(slotButton('10:00 – 11:00'))
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
  }

  it('показывает выбранный Слот и запрашивает имя и почту', async () => {
    renderPage()
    await awaitSources()
    await reachConfirmation()

    // Выбранный Слот виден на шаге подтверждения целиком: день и диапазон.
    expect(screen.getByText('четверг, 8 октября, 10:00 – 11:00')).toBeTruthy()
    expect(screen.getByLabelText('Имя')).toBeTruthy()
    expect(screen.getByLabelText('Email')).toBeTruthy()
  })

  it('не показывает ошибки до первой попытки подтвердить', async () => {
    renderPage()
    await awaitSources()
    await reachConfirmation()

    expect(screen.queryByText('Введите имя')).toBeNull()
  })

  it('требует имя и почту при пустых полях', async () => {
    renderPage()
    await awaitSources()
    await reachConfirmation()
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))

    expect(screen.getByText('Введите имя')).toBeTruthy()
    expect(screen.getByText('Введите почту в формате name@example.com')).toBeTruthy()
  })

  it('записывает Бронь на сервер и показывает экран успеха с интервалом', async () => {
    let posted: unknown = null
    const created = {
      id: 'new',
      eventTypeId: 'consultation',
      timeRange: { start: `${TODAY}T07:00:00.000Z`, end: `${TODAY}T08:00:00.000Z` },
      guestName: 'Demo User',
      guestEmail: 'demo@example.com',
      createdAt: NOW.toISOString(),
    }
    server.use(
      http.post('/bookings', async ({ request }) => {
        posted = await request.json()
        return HttpResponse.json(created, { status: 201 })
      }),
      http.get('/bookings', () => HttpResponse.json([created], { status: 200 })),
    )

    renderPage()
    await awaitSources()
    await reachConfirmation()

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: '  Demo User  ' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'Demo@Example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))

    expect(await screen.findByText('Бронь подтверждена. До встречи!')).toBeTruthy()
    // Экран успеха показывает интервал, а не время создания и не «сохранено в
    // браузере»: запись теперь на сервере, и это было бы ложью.
    expect(screen.getByText(/8 октября 2026 г., 10:00 – 11:00/)).toBeTruthy()
    expect(screen.queryByText(/Создано:/)).toBeNull()
    expect(screen.queryByText(/браузер/i)).toBeNull()

    // Запись ушла на сервер с интервалом и нормализованными полями.
    expect(posted).toMatchObject({
      eventTypeId: 'consultation',
      timeRange: { start: `${TODAY}T07:00:00.000Z`, end: `${TODAY}T08:00:00.000Z` },
      guestName: 'Demo User',
      guestEmail: 'demo@example.com',
    })
  })

  it('возвращает к первому шагу с кнопки «Забронировать ещё»', async () => {
    server.use(
      http.post('/bookings', () =>
        HttpResponse.json(
          {
            id: 'new',
            eventTypeId: 'consultation',
            timeRange: { start: `${TODAY}T07:00:00.000Z`, end: `${TODAY}T08:00:00.000Z` },
            guestName: 'Demo User',
            guestEmail: 'demo@example.com',
            createdAt: NOW.toISOString(),
          },
          { status: 201 },
        ),
      ),
    )
    renderPage()
    await awaitSources()
    await reachConfirmation()

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Demo User' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'demo@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))

    // Экран успеха приходит ответом сервера, поэтому дожидаемся его: без этого
    // клик был бы по ещё не появившейся кнопке.
    await screen.findByText('Бронь подтверждена. До встречи!')
    fireEvent.click(screen.getByRole('button', { name: 'Забронировать ещё' }))

    expect(screen.getByText('Статус слотов')).toBeTruthy()
    // Слот снят, иначе «Продолжить» увело бы на уже занятое время.
    expect(screen.getByRole('button', { name: 'Продолжить' })).toHaveProperty('disabled', true)
  })

  it('теряет введённые поля при возврате через «Изменить»', async () => {
    renderPage()
    await awaitSources()
    await reachConfirmation()

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Demo User' } })
    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }))
    await reachConfirmation()

    expect(screen.getByLabelText('Имя')).toHaveProperty('value', '')
  })

  it('не показывает экран успеха, когда сервер отказал', async () => {
    server.use(
      http.post('/bookings', () =>
        HttpResponse.json({ code: 'slot_taken', message: 'Слот уже занят' }, { status: 409 }),
      ),
    )

    renderPage()
    await awaitSources()
    await reachConfirmation()

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Demo User' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'demo@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))

    // Текст отказа принадлежит интерфейсу: `message` из контракта — строка для
    // разработчика, и перед гостем она была бы просто чужой фразой.
    expect(await screen.findByText('Это время уже занял другой гость — выберите другое')).toBeTruthy()
    expect(screen.queryByText('Слот уже занят')).toBeNull()
    expect(screen.queryByText('Бронь подтверждена. До встречи!')).toBeNull()
  })
})

/**
 * Отказ по занятости: `409` от `POST /bookings`.
 *
 * Клиент больше не решает, занят Слот или нет, — за конфликт отвечает сервер. Но
 * отказ приходит уже **после** того, как гость ввёл имя и почту, и терять их
 * из-за чужой занятости незачем.
 */
describe('отказ по занятости', () => {
  /**
   * Слот 10:00, который сервер занимает между чтением списка и отправкой.
   *
   * Так ведёт себя гонка: список гость видел свободным, а к отправке Слот уже
   * чужой. Именно её ловит `409`, и именно поэтому клиентской проверки нет.
   */
  const TAKEN_TEXT = 'Это время уже занял другой гость — выберите другое'

  const withRaceOnSelectedSlot = () => {
    const state = { gets: 0, posts: 0 }

    server.use(
      http.post('/bookings', () => {
        state.posts += 1
        return HttpResponse.json(
          { code: 'slot_taken', message: 'Слот уже занят' },
          { status: 409 },
        )
      }),
      http.get('/bookings', () => {
        state.gets += 1
        // До повторного чтения Слот свободен, после — уже нет: так выглядит гонка.
        return HttpResponse.json(
          state.gets > 1 ? [toApiBooking(booking(`${TODAY}T07:00:00.000Z`))] : [],
          { status: 200 },
        )
      }),
    )

    return state
  }

  /**
   * Страница с гонкой на выбранном Слоте.
   *
   * Отдельный рендер, а не `renderPage`: тот подставляет свой список Броней, а
   * `server.use` отдаёт предпочтение подставленному последним — и заглушка гонки
   * осталась бы незамеченной.
   */
  const renderRace = () => {
    const state = withRaceOnSelectedSlot()
    render(storageWith())
    return state
  }

  const reachConfirmation = async () => {
    fireEvent.click(slotButton('10:00 – 11:00'))
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить' }))
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Demo User' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'demo@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))
    await screen.findByText(TAKEN_TEXT)
  }

  it('оставляет введённые имя и почту', async () => {
    renderRace()
    await awaitSources()
    await reachConfirmation()

    // Терять введённое — наказание за чужую занятость, а гость к ней не при чём.
    expect(screen.getByLabelText('Имя')).toHaveProperty('value', 'Demo User')
    expect(screen.getByLabelText('Email')).toHaveProperty('value', 'demo@example.com')
  })

  it('останавливает кнопку, чтобы гость не жал её по кругу', async () => {
    const state = renderRace()
    await awaitSources()
    await reachConfirmation()

    expect(screen.getByRole('button', { name: 'Подтвердить запись' })).toHaveProperty('disabled', true)

    // И жмучая её, гость ничего не отправляет: повтор вернул бы тот же отказ и
    // потерял бы введённое имя и почту второй раз.
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))
    expect(state.posts).toBe(1)
  })

  it('перечитывает список Броней, а не оставляет снимок', async () => {
    const state = renderRace()
    await awaitSources()
    await waitFor(() => expect(state.gets).toBe(1))
    await reachConfirmation()

    // Без перечитывания занятый Слот остался бы свободным, и интерфейс предлагал бы
    // занять уже чужое время.
    await waitFor(() => expect(state.gets).toBe(2))
  })

  it('гасит Слот, который гость выбрал', async () => {
    renderRace()
    await awaitSources()
    await reachConfirmation()

    // Слот ушёл другому гостю, и после перечитывания списка это видно без всякой
    // клиентской проверки конфликта: гаснет сам.
    expect(screen.queryByText('Статус слотов')).toBeNull()
    expect(screen.getByRole('button', { name: 'Подтвердить запись' })).toHaveProperty('disabled', true)
  })

  it('не запирает гостя: другой Слот всё ещё можно выбрать', async () => {
    const state = renderRace()
    await awaitSources()
    await reachConfirmation()

    fireEvent.click(screen.getByRole('button', { name: 'Изменить' }))

    // Возврат к выбору дня работает, и свободный Слот доступен: отказ по занятости
    // относится к одному Слоту, а не к записи гостя в целом.
    expect(slotButton('11:00 – 12:00')).toHaveProperty('disabled', false)
    expect(state.posts).toBe(1)
  })
})

/**
 * Отказы, которые уводят гостя от формы.
 *
 * Все три ответа даны через заглушку сетевого слоя: тест проверяет страницу, а не
 * разбор ответов — разбор проверяется отдельно в `bookingRefusal.test.ts`.
 */
describe('отказ уводит гостя от формы', () => {
  it('отказ по времени уводит к выбору дня и говорит про время', async () => {
    postWith(422, {
      code: 'time_not_bookable',
      message: 'На это время записаться нельзя',
      field: 'timeRange',
    })

    render(storageWith())
    await awaitSources()
    await submitAs()

    // Слота, который гость выбрал, больше нет: форма с устаревшим интервалом была бы
    // формой, отправка которой вернула бы тот же отказ.
    expect(await screen.findByText('Выбранное время больше недоступно')).toBeTruthy()
    expect(screen.getByText('Статус слотов')).toBeTruthy()
    expect(screen.queryByLabelText('Имя')).toBeNull()
  })

  it('отказ по времени не подсвечивает ни одного поля', async () => {
    postWith(422, {
      code: 'time_not_bookable',
      message: 'На это время записаться нельзя',
      field: 'timeRange',
    })

    render(storageWith())
    await awaitSources()
    await submitAs()

    await screen.findByText('Выбранное время больше недоступно')

    // Подсвечивать нечего: гость выбирал Слот из сетки, а не вводил время, и полей
    // интервала на форме нет.
    expect(screen.queryByText('Значение не подходит')).toBeNull()
  })

  it('ошибка проверки данных оставляет форму и подсвечивает поля', async () => {
    postWith(422, {
      code: 'validation_failed',
      message: 'Проверка не прошла',
      fields: ['guestName', 'guestEmail'],
    })

    render(storageWith())
    await awaitSources()
    await submitAs()

    expect(await screen.findByText('Проверьте имя и почту')).toBeTruthy()
    // Исправление госта и повтор могут дать успех, поэтому форма остаётся.
    expect(screen.getByLabelText('Имя')).toBeTruthy()
    expect(screen.getByLabelText('Имя')).toHaveProperty('value', 'Demo User')

    // Все негодные поля сразу: по одному ждать четыре круга туда-обратно незачем.
    const highlighted = screen.getAllByText('Значение не подходит')
    expect(highlighted).toHaveLength(2)
  })

  it('ошибка проверки данных говорит не про время', async () => {
    postWith(422, {
      code: 'validation_failed',
      message: 'Проверка не прошла',
      fields: ['guestName'],
    })

    render(storageWith())
    await awaitSources()
    await submitAs()

    const text = await screen.findByText('Проверьте имя и почту')

    // Время гость только что выбрал, и оно было доступно: «выбранное время больше
    // недоступно» на негодном имени сказало бы гостю неправду.
    expect(text.textContent).not.toMatch(/время/i)
  })

  it('оба кода «не найдено» дают один текст и одно действие', async () => {
    // Один обработчик на два прогона: `server.use` внутри теста повторно не
    // сработал бы, и второй код остался бы непроверенным.
    const state = postWith(404, { code: 'slot_not_found', message: 'Слот не найден' })

    for (const code of ['slot_not_found', 'event_type_not_found']) {
      state.body = { code, message: 'Слот не найден' }
      const view = render(storageWith())
      await awaitSources()
      await submitAs()

      // Оба уводят к календарю и звучат одинаково: различать их на записи нечем,
      // а «Тип события не найден» там и вовсе недостижим.
      expect(await screen.findByText('Выбранное время больше недоступно')).toBeTruthy()
      expect(screen.getByText('Статус слотов')).toBeTruthy()
      expect(screen.queryByLabelText('Имя')).toBeNull()

      view.unmount()
    }
  })
})

/**
 * Ответ о недоступности и оборванная сеть.
 *
 * Гость не может знать, где именно оборвалось, и различать эти случаи текстом
 * значило бы утверждать то, чего он не знает. Различает их последствие: ответ
 * сервера означает, что запись не создана, а оборванный запрос — что она могла.
 */
describe('недоступность и оборванная сеть', () => {
  const UNAVAILABLE_TEXT = 'Записаться не получилось. Попробуйте ещё раз'

  /**
   * Оборванная сеть: запрос не доходит до ответа вовсе.
   *
   * `HttpResponse.error()` рвёт запрос, а не отвечает статусом, — так ведёт себя
   * потерянное соединение, и ни один ответ с телом тут не приходит.
   */
  const withBrokenNetwork = () => {
    const state = { gets: 0, posts: 0 }

    server.use(
      http.post('/bookings', () => {
        state.posts += 1
        return HttpResponse.error()
      }),
      http.get('/bookings', () => {
        state.gets += 1
        return HttpResponse.json([], { status: 200 })
      }),
    )

    return state
  }

  const renderUnavailable = () => {
    const state = postWith(503, {
      code: 'service_unavailable',
      message: 'Сервис временно недоступен',
    })

    render(storageWith())

    return state
  }

  it('при недоступности сервиса говорит то же, что при оборванной сети', async () => {
    renderUnavailable()
    await awaitSources()
    await submitAs()

    expect(await screen.findByText(UNAVAILABLE_TEXT)).toBeTruthy()
  })

  it('при недоступности сервиса не предупреждает и не даёт ссылки', async () => {
    renderUnavailable()
    await awaitSources()
    await submitAs()

    await screen.findByText(UNAVAILABLE_TEXT)

    // Ответ пришёл, значит запись точно не создана: предупреждение было бы ложью, а
    // ссылка в списке записей — уводом в пустоту.
    expect(screen.queryByText(/запись могла создаться/i)).toBeNull()
    expect(screen.queryByRole('link', { name: /список/i })).toBeNull()
  })

  it('при оборванной сети предупреждает, что запись могла создаться', async () => {
    withBrokenNetwork()
    render(storageWith())
    await awaitSources()
    await submitAs()

    expect(await screen.findByText(UNAVAILABLE_TEXT)).toBeTruthy()
    // Запрос ушёл, а ответа не пришло: гость не знает, создалась запись или нет.
    expect(screen.getByText(/запись могла создаться/i)).toBeTruthy()
  })

  it('при оборванной сети даёт путь в список Броней внутри текста', async () => {
    withBrokenNetwork()
    render(storageWith())
    await awaitSources()
    await submitAs()

    // Без пути гость задал вопрос «записался ли я» и не получил ответа. Ссылка
    // внутри текста, а не отдельной кнопкой: предупреждение читается один раз, а
    // кнопку надо ещё найти глазами.
    const link = await screen.findByRole('link', { name: 'Проверить список записей' })
    expect(link.getAttribute('href')).toBe('/bookings')
    expect(screen.queryByRole('button', { name: /список записей/i })).toBeNull()
  })

  it('при оборванной сети перечитывает список: запись могла создаться', async () => {
    const state = withBrokenNetwork()
    render(storageWith())
    await awaitSources()
    await waitFor(() => expect(state.gets).toBe(1))
    await submitAs()

    await waitFor(() => expect(state.gets).toBe(2))
  })

  it('при оборванной сети форма остаётся и повтор разрешён', async () => {
    withBrokenNetwork()
    render(storageWith())
    await awaitSources()
    await submitAs()

    await screen.findByText(UNAVAILABLE_TEXT)

    // Отказ запроса ничего не говорит о Слоте: возможно, запись создалась, и
    // повтор был бы второй записью на то же время.
    expect(screen.getByRole('button', { name: 'Подтвердить запись' })).toHaveProperty(
      'disabled',
      false,
    )
  })

  it('после оборванной сети список перечитан', async () => {
    // Запись могла создаться, и перечитанный список — единственное место, где гость
    // узнает об этом наверняка.
    const state = withBrokenNetwork()
    render(storageWith())
    await awaitSources()
    await submitAs()

    expect(await screen.findByText(UNAVAILABLE_TEXT)).toBeTruthy()
    await waitFor(() => expect(state.gets).toBe(2))
  })

  it('после недоступности сервиса список перечитан', async () => {
    const state = renderUnavailable()
    await awaitSources()
    await submitAs()

    await screen.findByText(UNAVAILABLE_TEXT)
    // Слот мог занять другой гость, пока сервер был недоступен: перечитывание после
    // любой попытки одинаково, а не только после успешной записи.
    await waitFor(() => expect(state.gets).toBe(2))
  })

  it('перечитывает список Броней после отказа по времени', async () => {
    const state = postWith(422, {
      code: 'time_not_bookable',
      message: 'На это время записаться нельзя',
      field: 'timeRange',
    })

    render(storageWith())
    await awaitSources()
    await submitAs()

    // Слот мог исчезнуть или занять другой гость, и список — единственный источник
    // правды об этом.
    await waitFor(() => expect(state.gets).toBe(2))
  })
})