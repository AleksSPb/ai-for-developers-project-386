import { Box, Stack, Text } from '@mantine/core'

import { formatDayTitle } from '../app/formatDate'
import { formatSlotDuration, formatSlotRange } from '../app/formatTime'
import type { Slot } from '../domain/slots'

interface InfoPanelProps {
  date: string | null
  slot: Slot | null
  availableCount: number
  durationMinutes: number
  timeZone: string
}

/** Что Гость выбрал и сколько в дне осталось. */
const InfoPanel = ({ date, slot, availableCount, durationMinutes, timeZone }: InfoPanelProps) => {
  const rows: { label: string; value: string }[] = [
    { label: 'Выбранная дата', value: date === null ? 'Дата не выбрана' : formatDayTitle(date) },
    {
      label: 'Выбранное время',
      value: slot === null ? 'Время не выбрано' : formatSlotRange(slot, timeZone),
    },
    { label: 'Свободно', value: String(availableCount) },
    { label: 'Длительность слота', value: formatSlotDuration(durationMinutes) },
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