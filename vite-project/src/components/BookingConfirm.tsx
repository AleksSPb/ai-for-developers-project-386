import { useState } from 'react'

import { Button, Card, Group, Stack, Text, TextInput } from '@mantine/core'

import { useApp } from '../app/useApp'
import type { GuestInput } from '../domain/booking'
import { validateGuest } from '../domain/booking'
import { formatDayTitle, formatSlotRange } from '../app/format'
import type { DateKey, Slot } from '../domain/schedule'

interface BookingConfirmProps {
  date: DateKey
  slot: Slot
  onEdit: () => void
  onDone: () => void
}

/**
 * Шаг подтверждения: поля Гостя живут здесь, а не в состоянии страницы.
 * На первом шаге их видеть нечем, а поднимать вверх без нужды значило бы
 * держать в памяти то, что никто не вводил.
 */
const BookingConfirm = ({ date, slot, onEdit, onDone }: BookingConfirmProps) => {
  const { addBooking } = useApp()
  const [guest, setGuest] = useState<GuestInput>({ name: '', email: '' })
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ошибки показываются только после попытки подтверждения, иначе пустая
  // форма выглядит как заведомо неправильная.
  const errors = isSubmitted ? validateGuest(guest) : {}

  const submit = () => {
    setIsSubmitted(true)
    const result = addBooking({ slot, guest })
    if (result.ok) {
      onDone()
      return
    }
    setError(result.error)
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
        {`${formatDayTitle(date)}, ${formatSlotRange(slot)}`}
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

      <Button fullWidth mt="md" onClick={submit}>
        Подтвердить запись
      </Button>
    </Card>
  )
}

export default BookingConfirm