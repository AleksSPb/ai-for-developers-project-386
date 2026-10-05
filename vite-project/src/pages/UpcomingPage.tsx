import { Button, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'

import { useApp } from '../app/useApp'
import type { Booking } from '../domain/booking'
import { getBookingStart, isBookingUpcoming } from '../domain/schedule'
import BookingCard from '../components/BookingCard'

const byStart = (a: Booking, b: Booking): number =>
  getBookingStart(a).getTime() - getBookingStart(b).getTime()

const UpcomingPage = () => {
  const { bookings, now } = useApp()
  const [isPastOpen, setIsPastOpen] = useState(false)

  const upcoming = bookings.filter((booking) => isBookingUpcoming(booking, now)).sort(byStart)
  // Прошедшие идут свежими сверху: за ними гость заглядывает чаще.
  const past = bookings
    .filter((booking) => !isBookingUpcoming(booking, now))
    .sort(byStart)
    .reverse()

  return (
    <Stack gap="lg">
      <Title order={1}>Брони</Title>
      {/* Ограничение из ADR-0002 объявляется прямо, а не остаётся на discovery. */}
      <Text size="sm" c="dimmed">
        Записи, сохранённые в этом браузере.
      </Text>

      {bookings.length === 0 ? (
        <Text size="sm">Записей пока нет</Text>
      ) : (
        <Stack gap="sm">
          {upcoming.length === 0 ? (
            <Text size="sm">Предстоящих записей нет</Text>
          ) : (
            upcoming.map((booking) => <BookingCard key={booking.id} booking={booking} />)
          )}

          {past.length > 0 && (
            <>
              <Button variant="subtle" onClick={() => setIsPastOpen(!isPastOpen)}>
                {isPastOpen ? 'Скрыть прошедшие' : `Показать прошедшие (${past.length})`}
              </Button>
              {/* Прошедшие не рендерятся, пока их не попросили: держать их
                  в дереве значит держать в ноду лишние карточки и мешать
                  скринридерам читать список предстоящих. */}
              {isPastOpen &&
                past.map((booking) => <BookingCard key={booking.id} booking={booking} />)}
            </>
          )}
        </Stack>
      )}
    </Stack>
  )
}

export default UpcomingPage