import { useMemo, useState } from 'react'
import { Navigate } from 'react-router'

import { Card, Group, Stack, Text, Title } from '@mantine/core'

import { useApp } from '../app/useApp'
import {
  getCalendarBounds,
  getDefaultDate,
  getMonthDayCells,
  getMonthOptions,
} from '../app/calendarView'
import { getGuestTimeZone } from '../app/formatTimeZone'
import { missingSource, sourceLabel, useBookingSources } from '../app/useBookingSources'
import { returnsToCalendar, type BookingRefusal } from '../app/bookingRefusal'
import { usePageSources } from '../app/useApp'
import { getDateKey, getMonthKey, type DateKey, type MonthKey } from '../domain/calendar'
import { getSlotStatus } from '../domain/day'
import type { Slot } from '../domain/slots'
import BookingConfirm from '../components/BookingConfirm'
import BookingHeader from '../components/BookingHeader'
import BookingRefusalAlert from '../components/BookingRefusalAlert'
import BookingSuccess from '../components/BookingSuccess'
import CalendarGrid from '../components/CalendarGrid'
import EventTypeFromUrlCard from '../components/EventTypeFromUrlCard'
import InfoPanel from '../components/InfoPanel'
import SlotList from '../components/SlotList'
import SourceAlert from '../components/SourceAlert'

/**
 * Тип события приходит из адреса: гостевой ссылке его несёт Гость, и страница без
 * него не имеет смысла — показывать нечего.
 *
 * Идентификатор передаётся пропом, а не читается здесь из маршрута: значение и
 * так знает маршрут, а страница, дёргающая `useParams` сама, молча уходила за
 * **список** Типов, когда параметр не дошёл, и рисовала календарь по
 * неопределённой длительности.
 */
interface BookingPageProps {
  eventTypeId: string
}

type Step = 'choose' | 'confirm' | 'done'

/**
 * Страница записи.
 *
 * Частичное состояние не рисуется: календарь без Окон предложил бы выбрать день,
 * где записаться нельзя, и выглядел бы это как «у Владельца нет времени» — то
 * есть как ложь о сервере. Поэтому страница ждёт все источники и называет
 * непришедший: «Загружаем окна приёма…».
 */
/**
 * Типа из адреса нет на сервере.
 *
 * Гость видит **страницу выбора**, а не ошибку про ссылку и не страницу записи с
 * пустым набором Слотов: второе показало бы интерфейс, который не может предложить
 * ничего, и молчал бы, будто записаться нельзя нигде.
 *
 * Отдельного текста про устаревшую ссылку не заводим: на странице выбора уже есть
 * заголовок и пустое состояние, а второе сообщение об одном факте только путало бы.
 *
 * Адрес при этом меняется на `/book` — устаревший идентификатор не должен остаться в
 * истории браузера, иначе «назад» вернёт на ту же мёртвую ссылку.
 */
const StaleTypeLink = () => <Navigate to="/book" replace />

const BookingPage = ({ eventTypeId }: BookingPageProps) => {
  const { bookings, now, reload } = useApp()
  const { sources, reload: reloadSources } = useBookingSources(eventTypeId)
  const timeZone = getGuestTimeZone()

  /**
   * Реестр приложения: кнопка повтора перечитывает все источники страницы.
   *
   * У страницы три источника, и повтор по одному оставил бы остальные старыми —
   * гость нажал бы «Повторить» и не понял бы, почему календарь не изменился.
   */
  usePageSources([reload, reloadSources])

  const [selectedDate, setSelectedDate] = useState<DateKey | null>(null)
  const [month, setMonth] = useState<MonthKey | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [step, setStep] = useState<Step>('choose')
  /**
   * Слот, который только что подтвердили.
   *
   * Хранится отдельно от выбранного: на экране успеха нужен именно тот, на
   * который гость подтвердил, а не «первый доступный» из текущего списка.
   */
  const [confirmedSlot, setConfirmedSlot] = useState<Slot | null>(null)
  /**
   * Отказ записи живёт на странице, а не в форме.
   *
   * Отказ по времени уводит гостя к выбору дня, и форма исчезает вместе с собой —
   * будь отказ её состоянием, текст ушёл бы в никуда вместе с компонентом.
   */
  const [refusal, setRefusal] = useState<BookingRefusal | null>(null)

  // Оба источника пришли — и тогда из них собирается Правило расписания:
  // окна приёма и длительность Типа события. Мемоизировано, потому что от
  // готовности зависят зависимости useMemo ниже, а новая ссылка на каждом
  // рендере пересчитывала бы календарь целиком.
  const ready = useMemo(
    () =>
      sources.windows.kind === 'готов' && sources.eventType.kind === 'готов'
        ? {
            windows: sources.windows.value,
            durationMinutes: sources.eventType.value.durationMinutes,
            eventType: sources.eventType.value,
          }
        : null,
    [sources.windows, sources.eventType],
  )

  const calendar = useMemo(() => {
    if (ready === null) {
      return null
    }

    const input = { windows: ready.windows, durationMinutes: ready.durationMinutes, bookings, now, timeZone }
    const bounds = getCalendarBounds(input)
    const months = getMonthOptions(input)

    return {
      bounds,
      months,
      // Ячейки считаются для открытого месяца; сам месяц выбирается ниже, когда
      // список месяцев уже известен.
      cellsFor: (current: MonthKey) => getMonthDayCells(input, current, bounds),
    }
  }, [ready, bookings, now, timeZone])

  const failed =
    sources.windows.kind === 'отказ' ||
    sources.eventType.kind === 'отказ'

  // Проверка после всех хуков: если Типа нет, ни календаря, ни его пустого
  // состояния показывать нельзя — гость должен попасть на выбор.
  if (sources.eventType.kind === 'нет типа') {
    return <StaleTypeLink />
  }

  // Отказ любого источника останавливает все: половина календаря без Окон выглядела
  // бы как «у Владельца нет времени», то есть как ложь о сервере. Плашка — общая с
  // остальными страницами, иначе один отказ звучал бы по-разному в зависимости от
  // точки входа.
  if (failed) {
    return (
      <Stack gap="lg">
        <Title order={1}>Запись на звонок</Title>
        <SourceAlert />
      </Stack>
    )
  }

  const missing = missingSource(sources)

  // Месяцев нет — значит окон не пришло вовсе, и листать некуда. Это не отказ и
  // не загрузка, а пустое расписание: так и говорим.
  if (missing !== null || ready === null || calendar === null) {
    return (
      <Stack gap="lg">
        <Title order={1}>Запись на звонок</Title>
        {/* Карточка Типа из адреса рисуется сразу: адрес открывают в том числе
            рукой, и пустой экран выглядел бы как сбой. */}
        <EventTypeFromUrlCard eventTypeId={eventTypeId} />
        <Text c="dimmed">Загружаем {sourceLabel[missing ?? 'windows']}…</Text>
      </Stack>
    )
  }

  const currentMonth = month ?? calendar.months[0] ?? getMonthKey(getDateKey(now, timeZone))
  const dayCells = calendar.cellsFor(currentMonth)
  // День открыт по умолчанию: пустой список Слотов при входе выглядел бы как
  // «записаться нельзя», хотя свободные слоты есть.
  const openDate = selectedDate ?? getDefaultDate(dayCells)
  const selected = openDate === null ? undefined : dayCells[openDate]
  const slots = (selected?.slots ?? []).filter((slot) => getSlotStatus(slot, bookings, now) !== 'прошедший')
  const availableCount = selected?.state.kind === 'доступен' ? selected.state.available : 0

  /**
   * Отказ записи.
   *
   * Отказ по времени и «не найдено» возвращают гостя к выбору дня: выбранного
   * Слота больше нет, и оставлять форму с устаревшим интервалом значило бы держать
   * на экране отправку, которая вернёт тот же отказ.
   */
  const handleRefused = (next: BookingRefusal) => {
    setRefusal(next)

    if (returnsToCalendar(next)) {
      setSelectedSlot(null)
      setStep('choose')
    }
  }

  const selectDate = (date: DateKey) => {
    setSelectedDate(date)
    // Слот от прошлой даты на новой не существует, поэтому снимаем выбор.
    setSelectedSlot(null)
    // Отказ прошлой попытки относился к прошлому дню: на новом он неуместен.
    setRefusal(null)
  }

  return (
    <Stack gap="lg">
      <BookingHeader name={ready.eventType.name} description={ready.eventType.description} />

      {/* Отказ записи стоит над тремя блоками, а не внутри формы: отказ по времени
          уводит гостя к календарю, и текст должен остаться видимым после ухода
          формы. */}
      {refusal !== null && <BookingRefusalAlert refusal={refusal} />}

      <Group align="stretch" gap="lg" wrap="wrap">
        <Card withBorder padding="lg" radius="md" style={{ width: 280, flex: '0 0 auto' }}>
          <InfoPanel
            date={openDate}
            slot={selectedSlot}
            availableCount={availableCount}
            timeZone={timeZone}
          />
        </Card>

        {step === 'confirm' && selectedSlot !== null && openDate !== null ? (
          <BookingConfirm
            date={openDate}
            slot={selectedSlot}
            eventTypeId={eventTypeId}
            timeZone={timeZone}
            refusal={refusal}
            onRefused={handleRefused}
            onEdit={() => {
              setRefusal(null)
              setStep('choose')
            }}
            onDone={() => {
              if (selectedSlot !== null) {
                setConfirmedSlot(selectedSlot)
              }
              setRefusal(null)
              setStep('done')
            }}
          />
        ) : (
          <>
            {step === 'done' && confirmedSlot !== null ? (
              <BookingSuccess
                slot={confirmedSlot ?? selectedSlot}
                onAgain={() => {
                  // Слот снимается вместе с успехом: он уже занят этой же Бронью,
                  // и «Продолжить» увело бы Гостя обратно на занятое время.
                  setSelectedSlot(null)
                  setRefusal(null)
                  setStep('choose')
                }}
              />
            ) : (
              <Card withBorder padding="lg" radius="md" style={{ flex: 1, minWidth: 320 }}>
                <CalendarGrid
                  month={currentMonth}
                  months={calendar.months}
                  onMonthChange={setMonth}
                  selectedDate={openDate}
                  onSelectDate={selectDate}
                  cells={dayCells}
                  first={calendar.bounds.first}
                  last={calendar.bounds.last}
                />
              </Card>
            )}

            <Card withBorder padding="lg" radius="md" style={{ width: 340, flex: '0 0 auto' }}>
              <SlotList
                slots={slots}
                bookings={bookings}
                now={now}
                timeZone={timeZone}
                selectedSlot={selectedSlot}
                onSelect={(slot) => {
                  setSelectedSlot(slot)
                  // Отказ относился к прежнему Слоту, а гость выбрал другой.
                  setRefusal(null)
                }}
                onContinue={() => setStep('confirm')}
              />
            </Card>
          </>
        )}
      </Group>
    </Stack>
  )
}

export default BookingPage