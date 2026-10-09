import { Button, Card, Stack, Text, Title } from '@mantine/core'

import { formatDayWithYear } from '../app/formatDate'
import { formatSlotRange } from '../app/formatTime'
import { getGuestTimeZone } from '../app/formatTimeZone'
import { getDateKey } from '../domain/calendar'
import type { Slot } from '../domain/slots'

interface BookingSuccessProps {
  slot: Slot
  /** Возврат к первому шагу: день сохраняется, Слот сбрасывается. */
  onAgain: () => void
}

/**
 * Экран подтверждения.
 *
 * Показывает **интервал** и ничего больше: ни времени создания, ни упоминания
 * того, где сохранена запись. Запись хранится на сервере, и «сохранено у вас»
 * было бы ложью о том, где она лежит, а время создания — это про сервер, а не
 * про гостя.
 */
const BookingSuccess = ({ slot, onAgain }: BookingSuccessProps) => {
  const timeZone = getGuestTimeZone()

  return (
    <Card withBorder padding="lg" radius="md" style={{ flex: 1, minWidth: 320 }}>
      <Stack gap="md">
        <Title order={3}>Бронь подтверждена. До встречи!</Title>

        <Text size="sm">
          {`${formatDayWithYear(getDateKey(slot.start, timeZone))}, ${formatSlotRange(slot, timeZone)}`}
        </Text>

        <Button onClick={onAgain}>Забронировать ещё</Button>
      </Stack>
    </Card>
  )
}

export default BookingSuccess