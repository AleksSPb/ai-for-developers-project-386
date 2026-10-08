import { Card, Group, Stack, Text } from '@mantine/core'

/**
 * Карточка Типа события, известного из адреса.
 *
 * Рисуется **до прихода ответа**: адрес открывают в том числе рукой, и пустой экран
 * выглядел бы как сбой. Из адреса известен только идентификатор, поэтому
 * название и описание на их местах — пустые строки заранее не рисуются.
 *
 * Карточка не исчезает, если Типа нет в списке: Гость пришёл по ссылке, и молча
 * убрать то, ради чего он пришёл, хуже, чем показать пустое название.
 */
interface EventTypeFromUrlCardProps {
  eventTypeId: string
  /** Название и описание, когда ответ уже пришёл. */
  name?: string
  description?: string
}

const EventTypeFromUrlCard = ({ eventTypeId, name, description }: EventTypeFromUrlCardProps) => (
  <Card withBorder padding="lg" radius="md">
    <Stack gap={4}>
      <Group justify="space-between" align="baseline">
        <Text fw={600}>{name ?? eventTypeId}</Text>
      </Group>
      {description !== undefined && (
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      )}
      <Text size="sm" c="dimmed">
        {`Тип события: ${eventTypeId}`}
      </Text>
    </Stack>
  </Card>
)

export default EventTypeFromUrlCard