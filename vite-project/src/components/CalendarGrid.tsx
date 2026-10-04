import { ActionIcon, Box, Group, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { useMemo } from 'react'

import { formatMonthTitle, formatSlotCount, weekdayHeaders } from '../app/format'
import type { Booking } from '../domain/booking'
import {
  getAvailableSlotCount,
  getMonthCells,
  isDateSelectable,
  isMonthSelectable,
  shiftMonth,
  type DateKey,
  type MonthKey,
} from '../domain/schedule'

interface CalendarGridProps {
  month: MonthKey
  onMonthChange: (month: MonthKey) => void
  selectedDate: DateKey
  onSelectDate: (date: DateKey) => void
  bookings: readonly Booking[]
  now: Date
}

interface DayCellProps {
  date: DateKey
  selected: boolean
  availableCount: number
  selectable: boolean
  onSelect: (date: DateKey) => void
}

const DayCell = ({ date, selected, availableCount, selectable, onSelect }: DayCellProps) => (
  <UnstyledButton
    onClick={() => onSelect(date)}
    disabled={!selectable}
    aria-pressed={selected}
    style={{
      padding: '6px 4px',
      borderRadius: 6,
      border: selected ? '1px solid var(--mantine-color-orange-6)' : '1px solid transparent',
      background: selected ? 'var(--mantine-color-orange-0)' : undefined,
      cursor: selectable ? 'pointer' : 'default',
      opacity: selectable ? 1 : 0.4,
    }}
  >
    <Text size="sm" ta="center">
      {Number(date.slice(8))}
    </Text>
    {selectable && availableCount > 0 && (
      <Text size="xs" c="dimmed" ta="center">
        {formatSlotCount(availableCount)}
      </Text>
    )}
  </UnstyledButton>
)

const CalendarGrid = ({
  month,
  onMonthChange,
  selectedDate,
  onSelectDate,
  bookings,
  now,
}: CalendarGridProps) => {
  const cells = getMonthCells(month)

  // Считаем один раз на месяц: пересчёт каждой ячейки при каждом рендере
  // стоил бы сотни преобразований времени.
  const availableCounts = useMemo(() => {
    const counts = new Map<DateKey, number>()
    cells.forEach((cell) => {
      if (cell !== null) {
        counts.set(cell, getAvailableSlotCount(cell, bookings, now))
      }
    })
    return counts
  }, [cells, bookings, now])

  const canGoBack = isMonthSelectable(shiftMonth(month, -1), now)
  const canGoForward = isMonthSelectable(shiftMonth(month, 1), now)

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={600}>Календарь</Text>
        <Group gap={4}>
          <ActionIcon
            variant="default"
            disabled={!canGoBack}
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            aria-label="Предыдущий месяц"
          >
            <IconChevronLeft size={16} />
          </ActionIcon>
          <ActionIcon
            variant="default"
            disabled={!canGoForward}
            onClick={() => onMonthChange(shiftMonth(month, 1))}
            aria-label="Следующий месяц"
          >
            <IconChevronRight size={16} />
          </ActionIcon>
        </Group>
      </Group>

      <Text>{formatMonthTitle(month)}</Text>

      <SimpleGrid cols={7} spacing={4}>
        {weekdayHeaders.map((header) => (
          <Text key={header} size="xs" c="dimmed" ta="center">
            {header}
          </Text>
        ))}
        {cells.map((cell, index) =>
          cell === null ? (
            // Ключ по индексу: пустые ячейки не несут данных и не меняются местами.
            <Box key={`empty-${index}`} />
          ) : (
            <DayCell
              key={cell}
              date={cell}
              selected={cell === selectedDate}
              availableCount={availableCounts.get(cell) ?? 0}
              selectable={isDateSelectable(cell, now)}
              onSelect={onSelectDate}
            />
          ),
        )}
      </SimpleGrid>
    </Stack>
  )
}

export default CalendarGrid