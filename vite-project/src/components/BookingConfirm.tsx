import { useState } from 'react'

import { Button, Card, Group, Stack, Text, TextInput } from '@mantine/core'

import { useApp } from '../app/useApp'
import { validateGuest } from '../domain/booking'
import { formatSlotRange } from '../app/formatTime'
import { formatDayTitle } from '../app/formatDate'
import type { Slot } from '../domain/slots'

interface BookingConfirmProps {
  date: string
  slot: Slot
  eventTypeId: string
  timeZone: string
  onEdit: () => void
  onDone: () => void
}

/**
 * Шаг подтверждения: поля Гостя живут здесь, а не в состоянии страницы.
 * На первом шаге их видеть нечем, а поднимать вверх без нужды значило бы
 * держать в памяти то, что никто не вводил.
 *
 * Конфликт до отправки не проверяется: за него отвечает сервер один раз. Форма
 * проверяет только свои поля — пустое имя или почту сервер всё равно отвергнет.
 */
const BookingConfirm = ({
  date,
  slot,
  eventTypeId,
  timeZone,
  onEdit,
  onDone,
}: BookingConfirmProps) => {
  const { addBooking } = useApp()
  const [guest, setGuest] = useState({ name: '', email: '' })
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

  // Ошибки показываются только после попытки подтверждения, иначе пустая форма
  // выглядит как заведомо неправильная.
  const errors = isSubmitted ? validateGuest(guest) : {}

  const submit = async () => {
    setIsSubmitted(true)
    setError(null)

    if (Object.keys(validateGuest(guest)).length > 0) {
      return
    }

    setIsSending(true)
    const result = await addBooking(slot, eventTypeId, guest)
    setIsSending(false)

    if (result.ok) {
      onDone()
      return
    }

    // Текст отказа — серверный: клиент не знает, чем именно занят Слот, и
    // выдумывать причину значило бы врать.
    setError(result.message ?? 'Не удалось записаться')
  }

  return (
    <Card withBorder padding="lg" radius="md" style={{ flex: 1, minWidth: 320 }}>
      <Group justify="space-between">
        <Text fw={600}>Подтверждение записи</Text>
        <Button variant="default" size="xs" onClick={onEdit}>
          Изменить
        </Button>
      </Group>

      <Text size="sm" c="dimmed" mt="xs">
        {`${formatDayTitle(date)}, ${formatSlotRange(slot, timeZone)}`}
      </Text>

      <Stack gap="sm" mt="md">
        <TextInput
          label="Имя"
          value={guest.name}
          error={errors.name}
          onChange={(event) => {
            setGuest({ ...guest, name: event.currentTarget.value })
            setError(null)
          }}
        />
        <TextInput
          label="Email"
          value={guest.email}
          error={errors.email}
          onChange={(event) => {
            setGuest({ ...guest, email: event.currentTarget.value })
            setError(null)
          }}
        />
      </Stack>

      {error !== null && (
        <Text c="red" size="sm" mt="sm">
          {error}
        </Text>
      )}

      <Button fullWidth mt="md" onClick={submit} loading={isSending}>
        Подтвердить запись
      </Button>
    </Card>
  )
}

export default BookingConfirm