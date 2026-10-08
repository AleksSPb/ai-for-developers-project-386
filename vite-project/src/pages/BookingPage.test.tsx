import { MantineProvider } from '@mantine/core'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AppProvider } from '../app/AppProvider'
import type { Booking } from '../domain/booking'
import type { BookingStorage } from '../ports/storage'
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

const createMemoryStorage = (initial: readonly Booking[] = []): BookingStorage => {
  const state = { bookings: [...initial] }
  return {
    read: () => [...state.bookings],
    write: (bookings) => {
      state.bookings = [...bookings]
    },
  }
}

const storageWith = (storage: BookingStorage) => (
  <MantineProvider>
    <AppProvider storage={storage}>
      <MemoryRouter>
        <BookingPage eventTypeId="consultation" />
      </MemoryRouter>
    </AppProvider>
  </MantineProvider>
)

const renderPage = (bookings: readonly Booking[] = []) => render(storageWith(createMemoryStorage(bookings)))

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

  it('сохраняет Бронь и показывает экран успеха', async () => {
    const storage = createMemoryStorage()
    render(storageWith(storage))
    await awaitSources()
    await reachConfirmation()

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: '  Demo User  ' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'Demo@Example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))

    expect(screen.getByText('Бронь подтверждена. До встречи!')).toBeTruthy()
    expect(storage.read()).toHaveLength(1)
    expect(storage.read()[0]).toMatchObject({
      eventTypeId: 'consultation',
      guestName: 'Demo User',
      guestEmail: 'demo@example.com',
    })
    expect(storage.read()[0].start.toISOString()).toBe(`${TODAY}T07:00:00.000Z`)
  })

  it('возвращает к первому шагу с кнопки «Забронировать ещё»', async () => {
    renderPage()
    await awaitSources()
    await reachConfirmation()

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Demo User' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'demo@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))
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

  it('отказывает, если Слот прошёл, пока гость вводил почту', async () => {
    const storage = createMemoryStorage()
    render(storageWith(storage))
    await awaitSources()
    await reachConfirmation()

    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Demo User' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'demo@example.com' } })

    // Гость начал в 09:00, а подтвердил в 12:00: Слот 10:00 уже прошёл.
    act(() => {
      vi.advanceTimersByTime(3 * 60 * 60_000)
    })
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }))

    expect(screen.getByText('Это время уже занято или прошло')).toBeTruthy()
    expect(screen.queryByText('Бронь подтверждена. До встречи!')).toBeNull()
    expect(storage.read()).toHaveLength(0)
  })
})