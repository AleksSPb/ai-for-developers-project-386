import { Button, Stack, Text, Title } from '@mantine/core'
import { useState } from 'react'
import { Link } from 'react-router'

import { useApp } from '../app/useApp'
import BookingCard from '../components/BookingCard'
import SourceAlert from '../components/SourceAlert'

const byStart = (a: { start: Date }, b: { start: Date }): number => a.start.getTime() - b.start.getTime()

/**
 * Предстоящей считается Бронь, которая ещё не началась: звонок, который уже идёт,
 * не должен висеть в предстоящих, а граница здесь — начало Слота, а не конец.
 */
const isUpcoming = (start: Date, now: Date): boolean => start.getTime() > now.getTime()

/**
 * Список Броней гостя.
 *
 * Брони приходят с сервера, и **отказ отличен от пустого состояния**: «Записей
 * пока нет» — это про данные, а отказ — про то, что данных не узнали. Подменить
 * одно другим нельзя: гость увидел бы «у вас нет записей» вместо «мы не смогли их
 * принести» и решил бы, что его запись потерялась.
 */
const UpcomingPage = () => {
  const { bookings, bookingsState, now } = useApp()
  const [isPastOpen, setIsPastOpen] = useState(false)

  const header = <Title order={1}>Брони</Title>

  if (bookingsState.kind === 'отказ') {
    return (
      <Stack gap="lg">
        {header}
        <SourceAlert message={bookingsState.message} />
      </Stack>
    )
  }

  if (bookingsState.kind === 'загрузка') {
    return (
      <Stack gap="lg">
        {header}
        <Text c="dimmed">Загружаем записи…</Text>
      </Stack>
    )
  }

  const upcoming = bookings.filter((booking) => isUpcoming(booking.start, now)).sort(byStart)
  // Прошедшие идут свежими сверху: за ними гость заглядывает чаще.
  const past = bookings.filter((booking) => !isUpcoming(booking.start, now)).sort(byStart).reverse()

  return (
    <Stack gap="lg">
      {header}

      <Text component={Link} to="/book" size="sm">
        Записаться ещё
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