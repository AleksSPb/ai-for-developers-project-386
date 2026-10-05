import { Card, Text } from '@mantine/core'

import {
  formatCreatedAt,
  formatDayWithYear,
  formatSlotRange,
} from '../app/format'
import type { Booking } from '../domain/booking'
import { getBookingSlot } from '../domain/schedule'

interface BookingCardProps {
  booking: Booking
}

/** Карточка Брони в том виде, как в макете: кто, куда и когда. */
const BookingCard = ({ booking }: BookingCardProps) => {
  const slot = getBookingSlot(booking)

  return (
    <Card withBorder padding="lg" radius="md">
      <Text fw={600}>{booking.guestName}</Text>
      <Text size="sm" c="dimmed">
        {booking.guestEmail}
      </Text>
      <Text size="sm" mt="xs">
        {`Слот: ${formatDayWithYear(slot.date)}, ${formatSlotRange(slot)}`}
      </Text>
      <Text size="sm" c="dimmed">
        {`Создано: ${formatCreatedAt(booking.createdAt)}`}
      </Text>
    </Card>
  )
}

export default BookingCard