import { useState } from 'react'

import { Button, Card, Group, Stack, Text, TextInput } from '@mantine/core'

import { useApp } from '../app/useApp'
import { validateGuest } from '../domain/booking'
import { formatSlotRange } from '../app/formatTime'
import { formatDayTitle } from '../app/formatDate'
import type { Slot } from '../domain/slots'
import { canRetry, refusalText, type BookingRefusal } from '../app/bookingRefusal'

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
 *
 * Отказ по занятости оставляет форму с введённым именем и почтой: терять их —
 * наказание за чужую занятость. При этом кнопка подтверждения перестаёт работать,
 * потому что Слот уже не свободен и повторная отправка вернула бы тот же отказ.
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
  const [refusal, setRefusal] = useState<BookingRefusal | null>(null)
  const [isSending, setIsSending] = useState(false)

  // Ошибки показываются только после попытки подтверждения, иначе пустая форма
  // выглядит как заведомо неправильная.
  const errors = isSubmitted ? validateGuest(guest) : {}
  const retryable = refusal === null || canRetry(refusal)

  const submit = async () => {
    setIsSubmitted(true)
    setRefusal(null)

    if (Object.keys(validateGuest(guest)).length > 0) {
      return
    }

    setIsSending(true)
    const outcome = await addBooking(slot, eventTypeId, guest)
    setIsSending(false)

    if (outcome.kind === 'создана') {
      onDone()
      return
    }

    // Отказ сервера, а не текст из его тела: `message` из контракта — строка для
    // разработчика, и перед гостем она была бы просто чужой фразой.
    setRefusal(outcome.refusal)
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
          onChange={(event) => setGuest({ ...guest, name: event.currentTarget.value })}
        />
        <TextInput
          label="Email"
          value={guest.email}
          error={errors.email}
          onChange={(event) => setGuest({ ...guest, email: event.currentTarget.value })}
        />
      </Stack>

      {refusal !== null && (
        <Text c="red" size="sm" mt="sm">
          {refusalText(refusal)}
        </Text>
      )}

      <Button fullWidth mt="md" onClick={submit} loading={isSending} disabled={!retryable}>
        Подтвердить запись
      </Button>
    </Card>
  )
}

export default BookingConfirm