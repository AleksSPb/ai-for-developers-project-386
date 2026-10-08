import { ActionIcon, Box, Group, SimpleGrid, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'

import { formatSlotCount } from '../app/formatTime'
import { getDayNumber, type DateKey, type MonthKey } from '../domain/calendar'
import { dayStateHint, type DayState } from '../domain/day'
import { getMonthCells, getMonthTitleRange } from '../domain/month'
import type { DayCell } from '../app/calendarView'

const weekdayHeaders = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const

interface DayButtonProps {
  cell: DayCell
  selected: boolean
  onSelect: (date: DateKey) => void
}

/**
 * Ячейка дня.
 *
 * Гаснущий день **не показывает числа свободных Слотов**: подпись отвергается
 * вместе с ценой, иначе приглушённое число спорило бы с заголовком. Различие
 * четырёх состояний несут подсказки — в самой ячейке состояния неразличимы, и
 * это осознанно: ячейка одна и гаснет одна.
 */
const DayButton = ({ cell, selected, onSelect }: DayButtonProps) => {
  const selectable = cell.state.kind === 'доступен'
  const hint = dayStateHint(cell.state)
  const day = getDayNumber(cell.date)

  const button = (
    <UnstyledButton
      onClick={() => onSelect(cell.date)}
      disabled={!selectable}
      aria-pressed={selected}
      style={{
        width: '100%',
        padding: '6px 4px',
        borderRadius: 6,
        border: selected ? '1px solid var(--mantine-color-orange-6)' : '1px solid transparent',
        background: selected ? 'var(--mantine-color-orange-0)' : undefined,
        cursor: selectable ? 'pointer' : 'default',
        opacity: selectable ? 1 : 0.4,
      }}
    >
      <Text size="sm" ta="center">
        {day}
      </Text>
      {selectable && (
        <Text size="xs" c="dimmed" ta="center">
          {formatSlotCount((cell.state as { available: number }).available)}
        </Text>
      )}
    </UnstyledButton>
  )

  // Подсказка одна на состояние дня, а не на каждый Слот: четыре причины должны
  // читаться разными словами, иначе они и не различимы.
  return hint === null ? button : <Tooltip label={hint}>{button}</Tooltip>
}

interface CalendarGridProps {
  month: MonthKey
  months: MonthKey[]
  onMonthChange: (month: MonthKey) => void
  selectedDate: DateKey | null
  onSelectDate: (date: DateKey) => void
  cells: Record<DateKey, DayCell>
  first: DateKey
  last: DateKey
}

/**
 * Календарь на месяц, собранный из Окон приёма.
 *
 * Месяц обрезан с двух сторон: слева до сегодня, справа до последнего дня со
 * Слотом. Обрезанные места закрыты заглушками без чисел — приглушённая дата
 * спорила бы с заголовком, а клик по ней ничего бы не дал.
 */
const CalendarGrid = ({
  month,
  months,
  onMonthChange,
  selectedDate,
  onSelectDate,
  cells,
  first,
  last,
}: CalendarGridProps) => {
  const grid = getMonthCells(month, first, last)
  const position = months.indexOf(month)
  const canGoBack = position > 0
  const canGoForward = position >= 0 && position < months.length - 1

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text fw={600}>Календарь</Text>
        <Group gap={4}>
          <ActionIcon
            variant="default"
            disabled={!canGoBack}
            onClick={() => onMonthChange(months[position - 1])}
            aria-label="Предыдущий месяц"
          >
            <IconChevronLeft size={16} />
          </ActionIcon>
          <ActionIcon
            variant="default"
            disabled={!canGoForward}
            onClick={() => onMonthChange(months[position + 1])}
            aria-label="Следующий месяц"
          >
            <IconChevronRight size={16} />
          </ActionIcon>
        </Group>
      </Group>

      <Text>{getMonthTitleRange(first, last, month)}</Text>

      <SimpleGrid cols={7} spacing={4}>
        {weekdayHeaders.map((header) => (
          <Text key={header} size="xs" c="dimmed" ta="center">
            {header}
          </Text>
        ))}
        {grid.map((cell, index) => {
          if (cell === null) {
            // Заглушка: места до 1-го числа и после последнего дня со Слотом.
            // Чисел здесь нет намеренно — см. комментарий к компоненту.
            return <Box key={`empty-${index}`} />
          }

          const dayCell = cells[cell]

          return dayCell === undefined ? (
            <Box key={cell} />
          ) : (
            <DayButton
              key={cell}
              cell={dayCell}
              selected={cell === selectedDate}
              onSelect={onSelectDate}
            />
          )
        })}
      </SimpleGrid>
    </Stack>
  )
}

export default CalendarGrid
export type { DayState }