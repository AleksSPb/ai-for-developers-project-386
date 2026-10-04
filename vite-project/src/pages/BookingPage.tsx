import { Button, Card, Group, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'

import { useApp } from '../app/useApp'
import {
  getAvailableSlotCount,
  getDefaultDate,
  getMonthKey,
  type DateKey,
  type MonthKey,
  type Slot,
} from '../domain/schedule'
import CalendarGrid from '../components/CalendarGrid'
import InfoPanel from '../components/InfoPanel'
import SlotList from '../components/SlotList'

const BookingPage = () => {
  const { bookings, now } = useApp()
  const [selectedDate, setSelectedDate] = useState<DateKey>(() => getDefaultDate(bookings, now))
  const [month, setMonth] = useState<MonthKey>(() => getMonthKey(getDefaultDate(bookings, now)))
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)

  const availableCount = getAvailableSlotCount(selectedDate, bookings, now)

  const selectDate = (date: DateKey) => {
    setSelectedDate(date)
    // Слот от прошлой даты на новой не существует, поэтому снимаем выбор.
    setSelectedSlot(null)
  }

  if (isConfirming && selectedSlot !== null) {
    return (
      <Stack gap="lg">
        <Title order={1}>Запись на звонок</Title>
        <Group align="flex-start" gap="lg" wrap="wrap">
          <Card withBorder padding="lg" radius="md">
            <InfoPanel date={selectedDate} slot={selectedSlot} availableCount={availableCount} />
          </Card>
          <Card withBorder padding="lg" radius="md" style={{ flex: 1, minWidth: 280 }}>
            <Group justify="space-between">
              <Text fw={600}>Подтверждение записи</Text>
              <Button variant="default" size="xs" onClick={() => setIsConfirming(false)}>
                Изменить
              </Button>
            </Group>
            {/* Поля Гостя и сохранение — следующий шаг. */}
            <Button mt="lg" disabled>
              Подтвердить запись
            </Button>
          </Card>
        </Group>
      </Stack>
    )
  }

  return (
    <Stack gap="lg">
      <Title order={1}>Запись на звонок</Title>
      <Group align="stretch" gap="lg" wrap="wrap">
        <Card withBorder padding="lg" radius="md" style={{ width: 280, flex: '0 0 auto' }}>
          <InfoPanel date={selectedDate} slot={selectedSlot} availableCount={availableCount} />
        </Card>

        <Card withBorder padding="lg" radius="md" style={{ flex: 1, minWidth: 320 }}>
          <CalendarGrid
            month={month}
            onMonthChange={setMonth}
            selectedDate={selectedDate}
            onSelectDate={selectDate}
            bookings={bookings}
            now={now}
          />
        </Card>

        <Card withBorder padding="lg" radius="md" style={{ width: 340, flex: '0 0 auto' }}>
          <SlotList
            date={selectedDate}
            bookings={bookings}
            now={now}
            selectedSlot={selectedSlot}
            onSelect={setSelectedSlot}
            onContinue={() => setIsConfirming(true)}
          />
        </Card>
      </Group>
    </Stack>
  )
}

export default BookingPage