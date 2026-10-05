import { Box, Stack, Text } from '@mantine/core'

import { formatDayTitle, formatSlotDuration, formatSlotRange } from '../app/format'
import type { DateKey, Slot } from '../domain/schedule'

interface InfoPanelProps {
  date: DateKey
  slot: Slot | null
  availableCount: number
}

/** Что Гость выбрал и сколько в дне осталось, — четыре строки из макета. */
const InfoPanel = ({ date, slot, availableCount }: InfoPanelProps) => {
  const rows: { label: string; value: string }[] = [
    { label: 'Выбранная дата', value: formatDayTitle(date) },
    { label: 'Выбранное время', value: slot === null ? 'Время не выбрано' : formatSlotRange(slot) },
    { label: 'Свободно', value: String(availableCount) },
    { label: 'Длительность слота', value: formatSlotDuration() },
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