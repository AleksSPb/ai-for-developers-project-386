import { Card, Group, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router'

import { formatDayWithYear } from '../app/formatDate'
import { formatSlotRange, formatTime } from '../app/formatTime'
import { getGuestTimeZone } from '../app/formatTimeZone'
import { useMeetings } from '../app/useMeetings'
import SourceAlert from '../components/SourceAlert'
import { getDateKey } from '../domain/calendar'

/**
 * Страница встреч — второй экран раздела Владельца.
 *
 * Два источника: встречи и Типы событий, чтобы рядом с интервалом стояло
 * название. Окна приёма не грузятся: Владелец не бронирует и расписание не
 * смотрит.
 *
 * Пустое состояние отличается от гостевого «Записей пока нет»: у Владельца
 * вопрос не в том, есть ли записи, а в том, есть ли встречи. Совпадение текстов
 * заставило бы его читать гостевую страницу вместо своей.
 */
const MeetingsPage = () => {
  const source = useMeetings()
  const timeZone = getGuestTimeZone()

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
        <SourceAlert message={source.message} />
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

  if (source.value.length === 0) {
    return (
      <Stack gap="lg">
        {header}
        <Text size="sm">Встреч пока нет</Text>
      </Stack>
    )
  }

  return (
    <Stack gap="lg">
      {header}
      <Stack gap="sm">
        {source.value.map(({ booking, eventType }) => (
          <Card key={booking.id} withBorder padding="lg" radius="md">
            <Stack gap={4}>
              <Text fw={600}>{eventType?.name ?? 'Тип события больше не заведён'}</Text>
              <Text size="sm">{booking.guestName}</Text>
              <Text size="sm" c="dimmed">
                {booking.guestEmail}
              </Text>
              <Text size="sm">
                {`${formatDayWithYear(getDateKey(booking.start, timeZone))}, ${formatSlotRange(booking, timeZone)}`}
              </Text>
              <Text size="sm" c="dimmed">
                {`Создано: ${formatTime(new Date(booking.createdAt), timeZone)}`}
              </Text>
            </Stack>
          </Card>
        ))}
      </Stack>
    </Stack>
  )
}

export default MeetingsPage