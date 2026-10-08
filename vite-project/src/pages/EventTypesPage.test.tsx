import { MantineProvider } from '@mantine/core'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'

import { TEXT_LIMITS } from '../app/textLimits'
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
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-10-08T06:00:00.000Z'))
  server.use(withTypes(eventType()))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('пустые и короткие поля', () => {
  /**
   * Отправка без подмены `POST`: ответ даёт сама заглушка по правилам контракта.
   *
   * Именно так и видна ошибка — заглушка, которая принимает всё подряд, показывает
   * успех там, где настоящий сервер отверг бы. Подменив `POST` своим ответом, такой
   * тест ничего бы не проверял.
   */
  const saveAs = async (values: { id: string; name: string; description: string }) => {
    fireEvent.change(screen.getByLabelText('Идентификатор'), { target: { value: values.id } })
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: values.name } })
    fireEvent.change(screen.getByLabelText('Описание'), { target: { value: values.description } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))
  }

  const isHighlighted = (label: string): boolean =>
    screen.getByLabelText(label).getAttribute('aria-invalid') === 'true'

  beforeEach(() => {
    server.resetHandlers()
  })

  it('пустой идентификатор отвергается и подсвечивает своё поле', async () => {
    renderPage()
    await ready()

    await saveAs({ id: '', name: 'Консультация', description: 'Полчаса о проекте' })

    // Раньше такое заводилось, и Владелец получал Тип без адреса: `/book/` ведёт
    // на выбор, а не на этот Тип.
    await waitFor(() => expect(isHighlighted('Идентификатор')).toBe(true))
    expect(screen.queryByText('Идентификатор: ')).toBeNull()
  })

  it('слишком короткий идентификатор отвергается', async () => {
    renderPage()
    await ready()

    // `/book/ab` не читается, и однобуквенные идентификаторы кончаются первыми же:
    // завести второй Тип, назвав его `b`, Владелец не сможет.
    await saveAs({ id: 'ab', name: 'Консультация', description: 'Полчаса о проекте' })

    await waitFor(() => expect(isHighlighted('Идентификатор')).toBe(true))
  })

  it('идентификатор не по образцу тоже отвергается', async () => {
    renderPage()
    await ready()

    // В адрес попадают строчные латинские буквы, цифры и дефис: кириллица и
    // заглавные превратили бы гостевую ссылку в нерабочую.
    await saveAs({ id: 'Консультация', name: 'Консультация', description: 'Полчаса о проекте' })

    await waitFor(() => expect(isHighlighted('Идентификатор')).toBe(true))
  })

  it('пустые поля подсвечены сразу все', async () => {
    renderPage()
    await ready()

    await saveAs({ id: '', name: '', description: '' })

    // Форма одна и проверяет всё разом: по одному ждать четыре круга туда-обратно
    // незачем.
    await waitFor(() => expect(screen.getAllByText('Заполните это поле')).toHaveLength(3))
  })

  it('негодное поле не мешает годному: подсвечивается ровно одно', async () => {
    renderPage()
    await ready()

    await saveAs({ id: 'ab', name: 'Консультация', description: 'Полчаса о проекте' })

    // Текст называет причину, а не факт: Владелец ничего не менял, и «Значение не
    // подходит» не сказало бы ему, что делать.
    await waitFor(() => expect(screen.getByText('Введите не меньше 3 символов')).toBeTruthy())
    expect(isHighlighted('Название')).toBe(false)
    expect(isHighlighted('Описание')).toBe(false)
  })

  it('годный идентификатор заводится и появляется в списке', async () => {
    renderPage()
    await ready()

    await saveAs({ id: 'walk-in', name: 'Без встречи', description: 'Приходи без записи' })

    // Обратная сторона той же проверки: заглушка, отвергающая лишнее, обязана и
    // пропускать годное, иначе отказ станет единственным ответом на любой ввод.
    await waitFor(() => expect(screen.getByText('Идентификатор: walk-in')).toBeTruthy())
    expect(isHighlighted('Идентификатор')).toBe(false)
  })

  it('подпись об ошибке уходит, как только поле исправлено', async () => {
    renderPage()
    await ready()

    await saveAs({ id: 'ab', name: 'Консультация', description: 'Полчаса о проекте' })
    await waitFor(() => expect(isHighlighted('Идентификатор')).toBe(true))

    fireEvent.change(screen.getByLabelText('Идентификатор'), { target: { value: 'abc' } })

    // Отказ говорил про то, что ушло на сервер. Значение сменилось — отказ больше
    // не про это поле, и держать под ним красную подпись нельзя: Владелец искал бы
    // причину, которой уже нет.
    await waitFor(() => expect(isHighlighted('Идентификатор')).toBe(false))
    expect(screen.queryByText('Введите не меньше 3 символов')).toBeNull()
  })

  it('подпись держится на полях, которые ещё не тронуты', async () => {
    renderPage()
    await ready()

    await saveAs({ id: '', name: 'Консультация', description: '' })
    await waitFor(() => expect(screen.getAllByText('Заполните это поле')).toHaveLength(2))

    fireEvent.change(screen.getByLabelText('Идентификатор'), { target: { value: 'walk-in' } })

    // Исправлено одно поле — исчезла только его подпись. Остальные не тронуты, и их
    // отказ в силе.
    await waitFor(() => expect(screen.getAllByText('Заполните это поле')).toHaveLength(1))
    expect(isHighlighted('Описание')).toBe(true)
  })

  it('занятый идентификатор перестаёт подсвечиваться, когда его сменили', async () => {
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

    await saveAs({ id: 'consultation', name: 'Консультация', description: 'Полчаса о проекте' })
    await waitFor(() => expect(screen.getByText('Такой идентификатор уже занят')).toBeTruthy())

    fireEvent.change(screen.getByLabelText('Идентификатор'), { target: { value: 'walk-in' } })

    // Занят был `consultation`, а в поле уже `walk-in`. Правило то же: отказ
    // относится к отправленному значению, а не к полю на все случаи жизни.
    await waitFor(() => expect(screen.queryByText('Такой идентификатор уже занят')).toBeNull())
  })

  it('название и описание подсвечиваются, только если они действительно пусты', async () => {
    renderPage()
    await ready()

    // Идентификатор годный, а тексты пустые: отказ назовёт все три, и это правда, а
    // не лишняя подсветка. Поэтому подписей ровно две, а не четыре.
    await saveAs({ id: 'walk-in', name: '', description: '' })
    await waitFor(() => expect(screen.getAllByText('Заполните это поле')).toHaveLength(2))
    expect(isHighlighted('Идентификатор')).toBe(false)

    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Без встречи' } })

    // Заполнено одно — осталась одна подпись: описание-то всё ещё пустое.
    await waitFor(() => expect(screen.getAllByText('Заполните это поле')).toHaveLength(1))
    expect(isHighlighted('Описание')).toBe(true)
  })

  it('текст сервера не показывается нигде на форме', async () => {
    server.resetHandlers()
    renderPage()
    await ready()

    // `message` из контракта — строка для разработчика. Перед Владельцем она была
    // бы чужой фразой: «Проверка не прошла» ничего не говорит о том, что делать.
    await saveAs({ id: 'ab', name: 'Консультация', description: 'Полчаса о проекте' })

    await waitFor(() => expect(screen.getByText('Введите не меньше 3 символов')).toBeTruthy())
    expect(screen.queryByText('Проверка не прошла')).toBeNull()
  })

  it('сводный текст есть там, где полей отказа нет', async () => {
    // Отказ без перечисления полей объяснить подписями нечем: сервис недоступен,
    // проверка пришла вовсе без `fields`. Молчать тут хуже, чем сказать своё.
    server.use(
      http.post('/event-types', () =>
        HttpResponse.json(
          { code: 'service_unavailable', message: 'Сервис временно недоступен' },
          { status: 503 },
        ),
      ),
    )
    renderPage()
    await ready()

    await saveAs({ id: 'walk-in', name: 'Без встречи', description: 'Приходи без записи' })

    expect(await screen.findByText('Не удалось сохранить. Попробуйте ещё раз')).toBeTruthy()
    // И даже здесь текст не из ответа сервера, а свой.
    expect(screen.queryByText('Сервис временно недоступен')).toBeNull()
  })

  it('сводный текст уходит, как только что-то поправлено', async () => {
    server.use(
      http.post('/event-types', () =>
        HttpResponse.json(
          { code: 'service_unavailable', message: 'Сервис временно недоступен' },
          { status: 503 },
        ),
      ),
    )
    renderPage()
    await ready()

    await saveAs({ id: 'walk-in', name: 'Без встречи', description: 'Приходи без записи' })
    await screen.findByText('Не удалось сохранить. Попробуйте ещё раз')

    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Другое' } })

    // Пока Владелец ничего не поправил, повод молчать был; поправил — исчезло. Иначе
    // строка висела бы после того, как он всё исправил, и выглядела бы как новая
    // беда.
    await waitFor(() => expect(screen.queryByText('Не удалось сохранить. Попробуйте ещё раз')).toBeNull())
  })
})

describe('границы текстов', () => {
  const atLimit = (length: number, fill = 'я') => fill.repeat(length)

  it('под каждым текстовым полем виден счётчик остатка', async () => {
    renderPage()
    await ready()

    // Счётчик стоит до того, как текст потерян: молчаливое обрезание отнимало бы его
    // без предупреждения.
    expect(screen.getByText(`Осталось символов: ${TEXT_LIMITS.id}`)).toBeTruthy()
    expect(screen.getByText(`Осталось символов: ${TEXT_LIMITS.name}`)).toBeTruthy()
    expect(screen.getByText(`Осталось символов: ${TEXT_LIMITS.description}`)).toBeTruthy()
  })

  it('счётчик убывает по мере ввода', async () => {
    renderPage()
    await ready()

    // Длина считается в коде, а не на глаз: глазомер по кириллице ошибался и
    // выглядел бы как ошибка счётчика.
    const typed = 'Проверка'
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: typed } })

    expect(
      screen.getByText(`Осталось символов: ${TEXT_LIMITS.name - typed.length}`),
    ).toBeTruthy()
  })

  it('лишнее ввести невозможно: поле не примет больше своего предела', async () => {
    renderPage()
    await ready()

    const name = screen.getByLabelText('Название') as HTMLInputElement

    // Границы стоят в контракте; форма берёт их оттуда, иначе она отказывала бы в
    // лишнем по одному правилу, а сервер — по другому.
    expect(name.getAttribute('maxlength')).toBe(String(TEXT_LIMITS.name))
    expect(screen.getByLabelText('Описание').getAttribute('maxlength')).toBe(
      String(TEXT_LIMITS.description),
    )
    expect(screen.getByLabelText('Идентификатор').getAttribute('maxlength')).toBe(
      String(TEXT_LIMITS.id),
    )
  })

  it('текст на пределе вводится и показывается целиком', async () => {
    const long = atLimit(TEXT_LIMITS.description)
    renderPage()
    await ready()

    fireEvent.change(screen.getByLabelText('Описание'), { target: { value: long } })

    // Обрезать нельзя: обрезанное описание сделало бы два одинаково названных Типа
    // неразличимыми для Гостя, и он не увидел бы почему.
    expect((screen.getByLabelText('Описание') as HTMLInputElement).value).toBe(long)
    expect(screen.getByText(`Осталось символов: 0`)).toBeTruthy()
  })

  it('описание на пределе показывается в карточке целиком, а не с многоточием', async () => {
    const long = atLimit(TEXT_LIMITS.description)
    server.use(withTypes(eventType({ description: long })))
    renderPage()
    await ready()

    expect(screen.getByText(long)).toBeTruthy()
    // Многоточие здесь означало бы, что Владелец не видит, что сохранил.
    expect(screen.getByText(long).style.textOverflow).toBe('')
  })

  it('два Типа с одинаковым названием остаются различимыми по описанию', async () => {
    server.use(
      withTypes(
        eventType({ id: 'first', name: 'Консультация', description: 'Полчаса о вашем проекте' }),
        eventType({ id: 'second', name: 'Консультация', description: 'Час о вашем проекте' }),
      ),
    )
    renderPage()
    await ready()

    // Названия не уникальны, поэтому описание — единственное, чем Типы различаются.
    expect(screen.getByText('Полчаса о вашем проекте')).toBeTruthy()
    expect(screen.getByText('Час о вашем проекте')).toBeTruthy()
    expect(screen.getAllByText('Консультация')).toHaveLength(2)
  })

  it('слишком длинное значение, пришедшее мимо формы, называет конкретное поле', async () => {
    // Форма не даст ввести лишнего, но значение может прийти откуда угодно — из
    // скрипта, из старой записи, из будущего клиента. Сервер отвергает и говорит
    // какое поле, и подсветка падает именно на него.
    server.use(
      http.post('/event-types', () =>
        HttpResponse.json(
          { code: 'validation_failed', message: 'Проверка не прошла', fields: ['description'] },
          { status: 422 },
        ),
      ),
    )
    renderPage()
    await ready()

    fireEvent.change(screen.getByLabelText('Идентификатор'), { target: { value: 'consultation' } })
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Консультация' } })
    fireEvent.change(screen.getByLabelText('Описание'), { target: { value: 'Описание' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    // Ровно одно поле подсвечено: код назвал одно, а не «всё подряд».
    expect(await screen.findAllByText('Значение не подходит')).toHaveLength(1)
  })

  it('длина считается в символах, а не в байтах', async () => {
    renderPage()
    await ready()

    const typed = 'яяяя'
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: typed } })

    // Кириллица в UTF-8 занимает по два байта на символ: предел в байтах урезал бы
    // русское название раньше латинского, а Владелец считает написанное символами.
    expect(
      screen.getByText(`Осталось символов: ${TEXT_LIMITS.name - typed.length}`),
    ).toBeTruthy()
  })
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
    expect(await screen.findAllByText('Заполните это поле')).toHaveLength(2)
  })

  it('число записавшихся кликабельно и ведёт на встречи этого Типа', async () => {
    server.use(
      http.get('/bookings', () => HttpResponse.json([], { status: 200 })),
      withTypes(eventType({ bookingCount: 41 })),
    )
    renderPage()
    await ready()

    // Владелец идёт по числу не за самим числом, а посмотреть, кто записался: без
    // ссылки вопрос «а работает ли это» остался бы без ответа.
    const link = screen.getByRole('link', { name: 'Записавшихся: 41' })

    expect(link.getAttribute('href')).toBe('/meetings?eventType=consultation')
  })

  it('сторожа-таймера на странице Типов нет', async () => {
    const asked = { bookings: 0 }
    server.use(
      http.get('/bookings', () => {
        asked.bookings += 1
        return HttpResponse.json([], { status: 200 })
      }),
    )
    renderPage()
    await ready()

    // Свою правку Типа Владелец видит сразу, а встреча появляется от записи Гостя —
    // она на странице встреч. Здесь таймер ходил бы по серверу без причины.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000)
    })

    expect(asked.bookings).toBe(0)
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
    // Подмена списка из beforeEach сброшена: она всегда отдаёт зашитое, и написанное
    // до неё не дошло бы — именно это и делало прежнюю проверку пустой.
    server.resetHandlers()
    renderPage()
    await ready()

    fireEvent.change(screen.getByLabelText('Идентификатор'), { target: { value: 'walk-in' } })
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Без встречи' } })
    fireEvent.change(screen.getByLabelText('Описание'), { target: { value: 'Приходи без записи' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    // Карточка нового Типа появляется без ручного обновления: ждать его Владелец
    // не станет, а молчаливое перечитывание мигнуло бы экраном.
    //
    // Проверяется именно новый Тип, а не любая карточка: прежняя проверка искала
    // «Консультацию», которая была на экране и до клика, и потому проходила, ничего
    // не доказывая.
    await waitFor(() => expect(screen.getByText('Без встречи')).toBeTruthy())
    expect(screen.getByText('Приходи без записи')).toBeTruthy()
    expect(screen.getByText('Идентификатор: walk-in')).toBeTruthy()
  })

  it('переименование меняет название и описание Типа', async () => {
    server.resetHandlers()
    renderPage()
    await ready()

    fireEvent.click(screen.getAllByRole('button', { name: 'Переименовать' })[0])
    fireEvent.change(screen.getByLabelText('Название'), { target: { value: 'Консультация' } })
    fireEvent.change(screen.getByLabelText('Описание'), { target: { value: 'Новый текст' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }))

    // Идентификатор при этом не меняется: он неизменен после создания, и именно он
    // попадает прямо в гостевую ссылку.
    await waitFor(() => expect(screen.getAllByText('Новый текст')).toHaveLength(1))
    expect(screen.getByText('Идентификатор: consultation')).toBeTruthy()
  })
})