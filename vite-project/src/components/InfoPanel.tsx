import { Box, Stack, Text } from '@mantine/core'

import { formatDayTitle } from '../app/formatDate'
import { formatSlotRange } from '../app/formatTime'
import type { Slot } from '../domain/slots'

interface InfoPanelProps {
  date: string | null
  slot: Slot | null
  availableCount: number
  timeZone: string
}

/**
 * Что Гость выбрал и сколько в дне осталось.
 *
 * Длительности Слота здесь нет намеренно: рядом с интервалом она ничего не
 * обещает, а видна гостю ровно в одном месте — на карточке выбора Типа, как
 * обещание до перехода.
 */
const InfoPanel = ({ date, slot, availableCount, timeZone }: InfoPanelProps) => {
  const rows: { label: string; value: string }[] = [
    { label: 'Выбранная дата', value: date === null ? 'Дата не выбрана' : formatDayTitle(date) },
    {
      label: 'Выбранное время',
      value: slot === null ? 'Время не выбрано' : formatSlotRange(slot, timeZone),
    },
    { label: 'Свободно', value: String(availableCount) },
  ]

  return (
    <Stack gap="xs">
      <Text fw={600}>Информация</Text>
      {rows.map(({ label, value }) => (
        <Box key={label} p="xs" bg="gray.1" style={{ borderRadius: 4 }}>
          <Text size="xs" c="dimmed">
            {label}
          </Text>
          <Text>{value}</Text>
        </Box>
      ))}
    </Stack>
  )
}

export default InfoPanel