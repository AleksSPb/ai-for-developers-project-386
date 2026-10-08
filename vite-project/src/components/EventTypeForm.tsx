import { useState } from 'react'

import { Button, Card, Group, Stack, Text, TextInput } from '@mantine/core'

import { errorsFromRefusal, TAKEN_CODE, type Refusal } from '../app/refusal'

interface EventTypeFormProps {
  /** Куда форма сохраняет: `null` означает создание, идентификатор — переименование. */
  editingId: string | null
  initialName?: string
  initialDescription?: string
  /** `null` — отправляется; строка — отказ с текстом. */
  onSubmit: (values: { id?: string; name: string; description: string; durationMinutes: number }) => void
  error: Refusal | null
  onCancel?: () => void
}

const emptyForm = { id: '', name: '', description: '', durationMinutes: '60' }

const EventTypeForm = ({
  editingId,
  initialName = '',
  initialDescription = '',
  onSubmit,
  error,
  onCancel,
}: EventTypeFormProps) => {
  const [values, setValues] = useState(
    editingId === null
      ? emptyForm
      : { ...emptyForm, name: initialName, description: initialDescription },
  )

  const fieldErrors = errorsFromRefusal(error)

  const submit = () => {
    onSubmit({
      ...(editingId === null ? { id: values.id.trim() } : {}),
      name: values.name.trim(),
      description: values.description.trim(),
      durationMinutes: Number(values.durationMinutes),
    })
  }

  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="sm">
        <Text fw={600}>{editingId === null ? 'Новый тип события' : `Переименование: ${editingId}`}</Text>

        {editingId === null && (
          <>
            {/* Идентификатор пишет сам Владелец и он неизменен после создания:
                поэтому он на форме создания и его нет на форме переименования. */}
            <TextInput
              label="Идентификатор"
              placeholder="consultation"
              value={values.id}
              error={fieldErrors.id}
              onChange={(event) => setValues({ ...values, id: event.currentTarget.value })}
            />
            <TextInput
              label="Длительность, минут"
              value={values.durationMinutes}
              onChange={(event) => setValues({ ...values, durationMinutes: event.currentTarget.value })}
            />
          </>
        )}

        <TextInput
          label="Название"
          value={values.name}
          error={fieldErrors.name}
          onChange={(event) => setValues({ ...values, name: event.currentTarget.value })}
        />
        <TextInput
          label="Описание"
          value={values.description}
          error={fieldErrors.description}
          onChange={(event) => setValues({ ...values, description: event.currentTarget.value })}
        />

        {error !== null && error.code !== TAKEN_CODE && (
          <Text c="red" size="sm">
            {error.message}
          </Text>
        )}

        <Group>
          <Button onClick={submit}>Сохранить</Button>
          {onCancel !== undefined && (
            <Button variant="default" onClick={onCancel}>
              Отмена
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  )
}

export default EventTypeForm