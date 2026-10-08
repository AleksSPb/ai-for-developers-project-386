import { Card, Text } from '@mantine/core'

import { formatDayWithYear } from '../app/formatDate'
import { formatSlotRange, formatTime } from '../app/formatTime'
import { getGuestTimeZone } from '../app/formatTimeZone'
import { getDateKey } from '../domain/calendar'
import type { Booking } from '../domain/booking'

interface BookingCardProps {
  booking: Booking
  timeZone?: string
}

/**
 * Карточка Брони в том виде, как в макете: кто, куда и когда.
 *
 * Время показывается в зоне того, кто смотрит: у Гостя это его местное время, и
 * у Владельца — тоже его. Называть чужую зону незачем.
 */
const BookingCard = ({ booking, timeZone = getGuestTimeZone() }: BookingCardProps) => {
  const day = getDateKey(booking.start, timeZone)

  return (
    <Card withBorder padding="lg" radius="md">
      <Text fw={600}>{booking.guestName}</Text>
      <Text size="sm" c="dimmed">
        {booking.guestEmail}
      </Text>
      <Text size="sm" mt="xs">
        {`Слот: ${formatDayWithYear(day)}, ${formatSlotRange(booking, timeZone)}`}
      </Text>
      <Text size="sm" c="dimmed">
        {`Создано: ${formatTime(new Date(booking.createdAt), timeZone)}`}
      </Text>
    </Card>
  )
}

export default BookingCard