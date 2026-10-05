import { Button, Group, Stack, Text, UnstyledButton } from '@mantine/core'

import {
  formatMinutes,
  formatSlotRange,
  getGuestTimeZone,
} from '../app/format'
import type { Booking } from '../domain/booking'
import { organizerTimeZone } from '../domain/config'
import { getDaySlots, getSlotEnd, getSlotStart, getSlotStatus, type DateKey, type Slot } from '../domain/schedule'
import { getZonedMinutesOfDay } from '../domain/time'

interface SlotListProps {
  date: DateKey
  bookings: readonly Booking[]
  now: Date
  selectedSlot: Slot | null
  onSelect: (slot: Slot) => void
  onContinue: () => void
}

/**
 * Слоты дня с их статусом.
 *
 * Начавшиеся Слоты не показываются: они не входят в «Свободно», и оставлять
 * их в списке значило бы предлагать Гостю время, которого уже нет.
 */
const SlotList = ({ date, bookings, now, selectedSlot, onSelect, onContinue }: SlotListProps) => {
  const slots = getDaySlots(date)
    .map((slot) => ({ slot, status: getSlotStatus(slot, bookings, now) }))
    .filter(({ status }) => status !== 'прошедший')

  const guestZone = getGuestTimeZone()
  const showGuestTime = selectedSlot !== null && guestZone !== organizerTimeZone

  return (
    <Stack gap="xs">
      <Text fw={600}>Статус слотов</Text>

      {slots.length === 0 ? (
        <Text size="sm" c="dimmed">
          Свободных слотов на этот день нет
        </Text>
      ) : (
        <Stack gap={6}>
          {slots.map(({ slot, status }) => {
            const isSelected = selectedSlot !== null && selectedSlot.startMinutes === slot.startMinutes
            return (
              <UnstyledButton
                key={slot.startMinutes}
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
                <Text size="sm">{formatSlotRange(slot)}</Text>
                <Text size="sm" fw={500}>
                  {status === 'занят' ? 'Занято' : 'Свободно'}
                </Text>
              </UnstyledButton>
            )
          })}
        </Stack>
      )}

      {showGuestTime && selectedSlot !== null && (
        <Text size="xs" c="dimmed">
          {`По вашему времени (${guestZone}): ${formatMinutes(
            getZonedMinutesOfDay(getSlotStart(selectedSlot), guestZone),
          )} - ${formatMinutes(getZonedMinutesOfDay(getSlotEnd(selectedSlot), guestZone))}`}
        </Text>
      )}

      <Group>
        {/* Кнопки «Назад» нет: первый шаг — начало, и назад от него идти
            некуда. Кнопка без действия хуже её отсутствия. */}
        <Button onClick={onContinue} disabled={selectedSlot === null}>
          Продолжить
        </Button>
      </Group>
    </Stack>
  )
}

export default SlotList