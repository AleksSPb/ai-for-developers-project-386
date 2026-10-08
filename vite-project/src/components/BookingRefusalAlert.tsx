import { Alert, Text } from '@mantine/core'
import { Link } from 'react-router'

import { refusalText, wasPossiblyCreated, type BookingRefusal } from '../app/bookingRefusal'

interface BookingRefusalAlertProps {
  refusal: BookingRefusal
}

/**
 * Отказ при записи.
 *
 * Стоит над тремя блоками страницы, а не внутри формы: отказ по времени уводит
 * гостя к выбору дня, и будь текст внутри формы, он ушёл бы в никуда вместе с ней.
 *
 * Предупреждение о возможно созданной записи и путь в список Броней живут **внутри
 * текста**, а не отдельной кнопкой: без пути гость задал вопрос «записался ли я» и
 * не получил ответа, а кнопку надо ещё и найти глазами.
 *
 * Отдельной кнопки «Повторить» здесь не будет: повтор — это действие гостя, и
 * форма под этим местом уже на месте.
 */
const BookingRefusalAlert = ({ refusal }: BookingRefusalAlertProps) => {
  const mayExist = wasPossiblyCreated(refusal)

  return (
    <Alert color="red" title="Запись не прошла">
      <Text size="sm">{refusalText(refusal)}</Text>

      {mayExist && (
        <Text size="sm" mt="xs">
          {'Связь оборвалась, поэтому запись могла создаться. '}
          <Text component={Link} to="/bookings" size="sm" fw={500}>
            Проверить список записей
          </Text>
        </Text>
      )}
    </Alert>
  )
}

export default BookingRefusalAlert