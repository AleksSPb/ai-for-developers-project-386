import { useState } from 'react'
import { Button, Card, Group, NativeSelect, Stack, Text, Title } from '@mantine/core'
import { Link, useSearchParams } from 'react-router'

import { formatDayWithYear } from '../app/formatDate'
import { formatSlotRange, formatTime } from '../app/formatTime'
import { getGuestTimeZone } from '../app/formatTimeZone'
import { eventTypeFromAddress, MEETINGS_FILTER_PARAM } from '../app/meetingsFilter'
import { usePageSources } from '../app/useApp'
import { useMeetings, type Meeting } from '../app/useMeetings'
import { useNow } from '../app/useNow'
import { useReloadEvery } from '../app/useReloadEvery'
import SourceAlert from '../components/SourceAlert'
import { getDateKey } from '../domain/calendar'

/** Пять минут: встреча появляется от записи Гостя, а не от правки Владельца. */
const WATCH_INTERVAL_MS = 5 * 60_000

const byStart = (a: Meeting, b: Meeting): number =>
  a.booking.start.getTime() - b.booking.start.getTime()

/**
 * Встречей считается та, что ещё не началась.
 *
 * Граница — начало интервала, а не конец: звонок, который уже идёт, не должен
 * висеть среди будущих, и Владельцу он сейчас не предстоит.
 */
const isUpcoming = (meeting: Meeting, now: Date): boolean =>
  meeting.booking.start.getTime() > now.getTime()

/**
 * Страница встреч — второй экран раздела Владельца.
 *
 * Два источника: встречи и Типы событий, чтобы рядом с интервалом стояло
 * название. Окна приёма не грузятся: Владелец не бронирует и расписание не
 * смотрит.
 *
 * Фильтр по Типу события живёт в адресе: ссылкой можно поделиться, кнопка «назад»
 * возвращает предыдущий фильтр, а перезагрузка не теряет его.
 *
 * Пустое состояние отличается от гостевого «Записей пока нет»: у Владельца
 * вопрос не в том, есть ли записи, а в том, есть ли встречи. Совпадение текстов
 * заставило бы его читать гостевую страницу вместо своей.
 */
const MeetingsPage = () => {
  const { state: source, reload } = useMeetings()
  const [searchParams, setSearchParams] = useSearchParams()
  const timeZone = getGuestTimeZone()
  const now = useNow()

  // Реестр приложения: кнопка повтора перечитывает все источники страницы, а не
  // один — см. `usePageSources`.
  usePageSources([reload])

  useReloadEvery(reload, WATCH_INTERVAL_MS, source.kind === 'отказ')

  const [isPastOpen, setIsPastOpen] = useState(false)

  /** Фильтр из адреса. Неизвестный Тип — тоже значение: он даёт пустой список. */
  const filter = eventTypeFromAddress(searchParams)

  const header = (
    <Group justify="space-between">
      <Title order={1}>Встречи</Title>
      <Text component={Link} to="/book" size="sm">
        Записаться
      </Text>
    </Group>
  )

  if (source.kind === 'отказ') {
    return (
      <Stack gap="lg">
        {header}
        <SourceAlert />
      </Stack>
    )
  }

  if (source.kind === 'загрузка') {
    return (
      <Stack gap="lg">
        {header}
        <Text c="dimmed">Загружаем встречи…</Text>
      </Stack>
    )
  }

  const { meetings, eventTypes } = source.value
  const filtered = filter === null ? meetings : meetings.filter((m) => m.booking.eventTypeId === filter)

  const upcoming = filtered.filter((meeting) => isUpcoming(meeting, now)).sort(byStart)
  // Прошедшие идут свежими сверху: за ними Владелец заглядывает чаще.
  const past = filtered.filter((meeting) => !isUpcoming(meeting, now)).sort(byStart).reverse()

  /**
   * Выбранный Тип для выпадающего списка.
   *
   * Неизвестный из адреса не выбирается: показать его в списке негде, а молча
   * оставить выбранным значило бы утверждать, что такой Тип есть.
   */
  const selected = eventTypes.some((type) => type.id === filter) ? (filter ?? '') : ''

  const selectFilter = (value: string) => {
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)

        if (value === '') {
          next.delete(MEETINGS_FILTER_PARAM)
        } else {
          next.set(MEETINGS_FILTER_PARAM, value)
        }

        return next
      },
      { replace: false },
    )
  }

  return (
    <Stack gap="lg">
      {header}

      <NativeSelect
        label="Тип события"
        description="Пусто — все типы событий"
        value={selected}
        onChange={(event) => selectFilter(event.currentTarget.value)}
        data={[
          { value: '', label: 'Все типы событий' },
          ...eventTypes.map((type) => ({ value: type.id, label: type.name })),
        ]}
      />

      {filtered.length === 0 ? (
        <Text size="sm">Встреч пока нет</Text>
      ) : (
        <Stack gap="sm">
          {upcoming.length === 0 ? (
            <Text size="sm">Предстоящих встреч нет</Text>
          ) : (
            upcoming.map((meeting) => <MeetingCard key={meeting.booking.id} meeting={meeting} timeZone={timeZone} />)
          )}

          {past.length > 0 && (
            <>
              <Button variant="subtle" onClick={() => setIsPastOpen(!isPastOpen)}>
                {isPastOpen ? 'Скрыть прошедшие' : `Показать прошедшие (${past.length})`}
              </Button>
              {/* Прошедшие не рисуются, пока их не попросили: держать их в дереве
                  значит держать в ноду лишние карточки и мешать Владельцу читать
                  список предстоящих. */}
              {isPastOpen &&
                past.map((meeting) => <MeetingCard key={meeting.booking.id} meeting={meeting} timeZone={timeZone} />)}
            </>
          )}
        </Stack>
      )}
    </Stack>
  )
}

interface MeetingCardProps {
  meeting: Meeting
  timeZone: string
}

/**
 * Одна встреча: Тип, Гость и интервал.
 *
 * Время создания остаётся в строке: у Владельца это ответ на вопрос «кто занял
 * время раньше», и его нечем заменить — в Брони счётчик и дата создания приходят
 * с сервера.
 */
const MeetingCard = ({ meeting, timeZone }: MeetingCardProps) => (
  <Card withBorder padding="lg" radius="md">
    <Stack gap={4}>
      <Text fw={600}>{meeting.eventType?.name ?? 'Тип события больше не заведён'}</Text>
      <Text size="sm">{meeting.booking.guestName}</Text>
      <Text size="sm" c="dimmed">
        {meeting.booking.guestEmail}
      </Text>
      <Text size="sm">
        {`${formatDayWithYear(getDateKey(meeting.booking.start, timeZone))}, ${formatSlotRange(meeting.booking, timeZone)}`}
      </Text>
      <Text size="sm" c="dimmed">
        {`Создано: ${formatTime(new Date(meeting.booking.createdAt), timeZone)}`}
      </Text>
    </Stack>
  </Card>
)

export default MeetingsPage