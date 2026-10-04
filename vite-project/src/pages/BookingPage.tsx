import { Card, Group, Stack, Title } from '@mantine/core'
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
import BookingConfirm from '../components/BookingConfirm'
import BookingSuccess from '../components/BookingSuccess'
import CalendarGrid from '../components/CalendarGrid'
import InfoPanel from '../components/InfoPanel'
import SlotList from '../components/SlotList'

type Step = 'choose' | 'confirm' | 'done'

const BookingPage = () => {
  const { bookings, now } = useApp()
  const [selectedDate, setSelectedDate] = useState<DateKey>(() => getDefaultDate(bookings, now))
  const [month, setMonth] = useState<MonthKey>(() => getMonthKey(getDefaultDate(bookings, now)))
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [step, setStep] = useState<Step>('choose')

  const availableCount = getAvailableSlotCount(selectedDate, bookings, now)

  const selectDate = (date: DateKey) => {
    setSelectedDate(date)
    // Слот от прошлой даты на новой не существует, поэтому снимаем выбор.
    setSelectedSlot(null)
  }

  const startOver = () => {
    setSelectedSlot(null)
    setStep('choose')
  }

  return (
    <Stack gap="lg">
      <Title order={1}>Запись на звонок</Title>
      <Group align="stretch" gap="lg" wrap="wrap">
        <Card withBorder padding="lg" radius="md" style={{ width: 280, flex: '0 0 auto' }}>
          <InfoPanel date={selectedDate} slot={selectedSlot} availableCount={availableCount} />
        </Card>

        {step === 'confirm' && selectedSlot !== null ? (
          <BookingConfirm
            date={selectedDate}
            slot={selectedSlot}
            onEdit={startOver}
            onDone={() => setStep('done')}
          />
        ) : (
          <>
            {step === 'done' ? (
              <BookingSuccess onAgain={startOver} />
            ) : (
              <Card
                withBorder
                padding="lg"
                radius="md"
                style={{ flex: 1, minWidth: 320 }}
              >
                <CalendarGrid
                  month={month}
                  onMonthChange={setMonth}
                  selectedDate={selectedDate}
                  onSelectDate={selectDate}
                  bookings={bookings}
                  now={now}
                />
              </Card>
            )}

            <Card withBorder padding="lg" radius="md" style={{ width: 340, flex: '0 0 auto' }}>
              <SlotList
                date={selectedDate}
                bookings={bookings}
                now={now}
                selectedSlot={selectedSlot}
                onSelect={setSelectedSlot}
                onContinue={() => setStep('confirm')}
              />
            </Card>
          </>
        )}
      </Group>
    </Stack>
  )
}

export default BookingPage