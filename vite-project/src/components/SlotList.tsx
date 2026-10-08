import { Button, Group, Stack, Text, UnstyledButton } from '@mantine/core'

import { formatSlotRange } from '../app/formatTime'
import { getSlotStatus } from '../domain/day'
import type { Booking } from '../domain/booking'
import type { Slot } from '../domain/slots'

interface SlotListProps {
  slots: readonly Slot[]
  bookings: readonly Booking[]
  now: Date
  timeZone: string
  selectedSlot: Slot | null
  onSelect: (slot: Slot) => void
  onContinue: () => void
}

/**
 * Слоты дня с их статусом.
 *
 * Список плоский, без разделителей и заголовков между окнами: два окна в один
 * день дают два обычных Слота подряд, и Гостю безразлично, где кончилось первое
 * окно. Разделитель означал бы, что это разные сущности, а это не так.
 *
 * Начавшиеся Слоты не показываются: они не входят в свободные, и оставлять их
 * значило бы предлагать время, которого уже нет.
 */
const SlotList = ({
  slots,
  bookings,
  now,
  timeZone,
  selectedSlot,
  onSelect,
  onContinue,
}: SlotListProps) => {
  const visible = slots
    .map((slot) => ({ slot, status: getSlotStatus(slot, bookings, now) }))
    .filter(({ status }) => status !== 'прошедший')

  return (
    <Stack gap="xs">
      <Text fw={600}>Статус слотов</Text>

      {visible.length === 0 ? (
        <Text size="sm" c="dimmed">
          Свободных слотов на этот день нет
        </Text>
      ) : (
        <Stack gap={6}>
          {visible.map(({ slot, status }) => {
            const isSelected = selectedSlot?.start.getTime() === slot.start.getTime()

            return (
              <UnstyledButton
                key={slot.start.toISOString()}
                onClick={() => onSelect(slot)}
                disabled={status === 'занят'}
                aria-pressed={isSelected}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: isSelected
                    ? '1px solid var(--mantine-color-orange-6)'
                    : '1px solid var(--mantine-color-gray-3)',
                  background: isSelected ? 'var(--mantine-color-orange-0)' : undefined,
                  cursor: status === 'занят' ? 'default' : 'pointer',
                  opacity: status === 'занят' ? 0.6 : 1,
                }}
              >
                <Text size="sm">{formatSlotRange(slot, timeZone)}</Text>
                <Text size="sm" fw={500}>
                  {status === 'занят' ? 'Занято' : 'Свободно'}
                </Text>
              </UnstyledButton>
            )
          })}
        </Stack>
      )}

      <Group>
        {/* Кнопки «Назад» нет: первый шаг — начало, и назад от него идти некуда.
            Кнопка без действия хуже её отсутствия. */}
        <Button onClick={onContinue} disabled={selectedSlot === null}>
          Продолжить
        </Button>
      </Group>
    </Stack>
  )
}

export default SlotList