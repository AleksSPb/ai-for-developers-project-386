import { useMemo, useState } from 'react'

import { Alert, Card, Group, Stack, Text, Title } from '@mantine/core'

import { useApp } from '../app/useApp'
import {
  getCalendarBounds,
  getDefaultDate,
  getMonthDayCells,
  getMonthOptions,
} from '../app/calendarView'
import { getGuestTimeZone } from '../app/formatTimeZone'
import { missingSource, sourceLabel, useBookingSources } from '../app/useBookingSources'
import { getDateKey, getMonthKey, type DateKey, type MonthKey } from '../domain/calendar'
import { getSlotStatus } from '../domain/day'
import type { Slot } from '../domain/slots'
import BookingConfirm from '../components/BookingConfirm'
import BookingSuccess from '../components/BookingSuccess'
import CalendarGrid from '../components/CalendarGrid'
import InfoPanel from '../components/InfoPanel'
import SlotList from '../components/SlotList'

/**
 * Тип события, под которым открыта страница.
 *
 * Пока страницы выбора Типа нет (#58), идентификатор берётся здесь: гостевая
 * ссылка уже несёт его, а Тип события нужен ради одного числа — длительности
 * Слота.
 */
const eventTypeId = 'consultation'

type Step = 'choose' | 'confirm' | 'done'

/**
 * Страница записи.
 *
 * Частичное состояние не рисуется: календарь без Окон предложил бы выбрать день,
 * где записаться нельзя, и выглядел бы это как «у Владельца нет времени» — то
 * есть как ложь о сервере. Поэтому страница ждёт все источники и называет
 * непришедший: «Загружаем окна приёма…».
 */
const BookingPage = () => {
  const { bookings, now } = useApp()
  const sources = useBookingSources(eventTypeId)
  const timeZone = getGuestTimeZone()

  const [selectedDate, setSelectedDate] = useState<DateKey | null>(null)
  const [month, setMonth] = useState<MonthKey | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [step, setStep] = useState<Step>('choose')

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

  const failure =
    sources.windows.kind === 'отказ'
      ? sources.windows
      : sources.eventType.kind === 'отказ'
        ? sources.eventType
        : null

  if (failure !== null) {
    return (
      <Stack gap="lg">
        <Title order={1}>Запись на звонок</Title>
        <Alert color="red" title="Не удалось загрузить расписание">
          {failure.message}
        </Alert>
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

  const selectDate = (date: DateKey) => {
    setSelectedDate(date)
    // Слот от прошлой даты на новой не существует, поэтому снимаем выбор.
    setSelectedSlot(null)
  }

  return (
    <Stack gap="lg">
      <Title order={1}>Запись на звонок</Title>
      <Group align="stretch" gap="lg" wrap="wrap">
        <Card withBorder padding="lg" radius="md" style={{ width: 280, flex: '0 0 auto' }}>
          <InfoPanel
            date={openDate}
            slot={selectedSlot}
            availableCount={availableCount}
            durationMinutes={ready.durationMinutes}
            timeZone={timeZone}
          />
        </Card>

        {step === 'confirm' && selectedSlot !== null && openDate !== null ? (
          <BookingConfirm
            date={openDate}
            slot={selectedSlot}
            eventTypeId={eventTypeId}
            timeZone={timeZone}
            onEdit={() => setStep('choose')}
            onDone={() => setStep('done')}
          />
        ) : (
          <>
            {step === 'done' ? (
              <BookingSuccess
                onAgain={() => {
                  // Слот снимается вместе с успехом: он уже занят этой же Бронью,
                  // и «Продолжить» увело бы Гостя обратно на занятое время.
                  setSelectedSlot(null)
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
                onSelect={setSelectedSlot}
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