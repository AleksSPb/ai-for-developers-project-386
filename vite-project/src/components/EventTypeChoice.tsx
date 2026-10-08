import { Anchor, Card, Group, Stack, Text } from '@mantine/core'
import { Link } from 'react-router'

import { formatSlotDuration } from '../app/formatTime'
import type { EventTypeSummary } from '../api/generated/calendar-api'

/**
 * Карточка Типа события на странице выбора.
 *
 * Показывает название, описание и длительность — **и больше ничего**: ни Слота, ни
 * календаря, ни счётчика. Длинности гостю здесь делать нечего, а лишнее на
 * странице выбора выглядело бы как обещание, которое потом не сдержится.
 *
 * Описание обязательно: два Типа с одинаковым названием различимы только им.
 *
 * Тип, не помещающийся ни в одно Окно приёма, показывается **как все, без отметки**:
 * Окон страница не грузит и пометку считать не из чего. Скрывать его отвергнуто —
 * Тип существует, на него ссылается Владелец, и его исчезновение из выбора
 * выглядело бы как сбой. Цена названа: Гость выберет Тип, перейдёт на запись и
 * обнаружит, что Слотов нет.
 */
interface EventTypeChoiceProps {
  eventType: EventTypeSummary
}

const EventTypeChoice = ({ eventType }: EventTypeChoiceProps) => (
  <Card withBorder padding="lg" radius="md">
    <Stack gap={4}>
      <Group justify="space-between" align="baseline">
        {/* Длительность видна гостю ровно здесь, как обещание: на странице записи
            её нет, потому что там она стояла бы рядом с интервалом и ничего не
            обещала бы. */}
        <Text fw={600}>{eventType.name}</Text>
        <Anchor component={Link} to={`/book/${eventType.id}`} size="sm">
          Выбрать
        </Anchor>
      </Group>

      <Text size="sm" c="dimmed">
        {eventType.description}
      </Text>

      <Text size="sm" c="dimmed">
        {formatSlotDuration(eventType.durationMinutes)}
      </Text>
    </Stack>
  </Card>
)

export default EventTypeChoice