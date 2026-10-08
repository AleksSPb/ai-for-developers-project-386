import { Anchor, Card, Group, Stack, Text } from '@mantine/core'
import { Link } from 'react-router'

import { formatSlotDuration } from '../app/formatTime'
import { meetingsPath } from '../app/meetingsFilter'
import type { EventTypeSummary } from '../api/generated/calendar-api'

/**
 * Гостевая ссылка на Тип.
 *
 * Идентификатор написан Владельцем и попадает прямо в ссылку, поэтому ссылка
 * обязательна: раздел открывается ручным набором адреса, и проверка того, что
 * ссылка работает, не должна требовать копирования текста.
 */
const guestLink = (id: string): string => `${window.location.origin}/#/book/${id}`

interface GuestLinkProps {
  id: string
}

/**
 * Ссылка занимает одну строку и не смещает остальное содержимое карточки.
 *
 * Обрезка с многоточием здесь не украшение: без неё длинное название растягивало
 * бы карточку, и соседние карточки в списке разъезжались бы по высоте.
 */
const GuestLink = ({ id }: GuestLinkProps) => (
  <Anchor component={Link} to={`/book/${id}`} size="sm" style={{ display: 'block' }}>
    <Text
      size="sm"
      c="orange.7"
      style={{
        display: 'block',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {guestLink(id)}
    </Text>
  </Anchor>
)

interface EventTypeCardProps {
  eventType: EventTypeSummary
  onRename?: (id: string) => void
  renaming?: boolean
}

/**
 * Карточка Типа события в разделе Владельца.
 *
 * Число записавшихся приходит с сервера и включает прошедшие: оно отвечает на
 * вопрос «а работает ли это». Вопрос «сколько у меня впереди» — на странице
 * встреч, и здесь он был бы вторым источником правды о числе.
 *
 * Число **кликабельно** и ведёт на встречи этого Типа: по вопросу «а работает
 * ли это» Владелец почти всегда идёт посмотреть, кто именно записался. Адрес
 * собирает общий модуль `meetingsFilter`, а не карточка: адрес фильтра должен
 * совпадать у всех ссылок раздела, а собрать его здесь и там значило бы однажды
 * получить два разных адреса для одного фильтра.
 */
const EventTypeCard = ({ eventType, onRename, renaming = false }: EventTypeCardProps) => (
  <Card withBorder padding="lg" radius="md">
    <Group justify="space-between" align="flex-start" wrap="nowrap">
      <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
        <Text fw={600}>{eventType.name}</Text>
        <Text size="sm" c="dimmed">
          {eventType.description}
        </Text>
        <Group gap="xs">
          <Text size="sm" c="dimmed">
            Идентификатор: {eventType.id}
          </Text>
          <Text size="sm" c="dimmed">
            Длительность: {formatSlotDuration(eventType.durationMinutes)}
          </Text>
          <Anchor
            component={Link}
            to={meetingsPath(eventType.id)}
            size="sm"
            c="dimmed"
            title="Встречи этого типа события"
          >
            {`Записавшихся: ${eventType.bookingCount}`}
          </Anchor>
        </Group>
        <GuestLink id={eventType.id} />
      </Stack>

      {onRename !== undefined && (
        <Anchor
          component="button"
          type="button"
          onClick={() => onRename(eventType.id)}
          size="sm"
          c="dimmed"
        >
          {renaming ? 'Сохраняем…' : 'Переименовать'}
        </Anchor>
      )}
    </Group>
  </Card>
)

export default EventTypeCard