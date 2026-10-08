import { useState } from 'react'

import { Stack, Text, Title } from '@mantine/core'

import { eventTypesCreateEventType, eventTypeByIdUpdateEventType } from '../api/generated/calendar-api'
import type { EventTypeSummary } from '../api/generated/calendar-api'
import type { Refusal } from '../app/refusal'
import { useEventTypes } from '../app/useEventTypes'
import EventTypeCard from '../components/EventTypeCard'
import EventTypeForm from '../components/EventTypeForm'
import SourceAlert from '../components/SourceAlert'

/**
 * Страница Типов событий — первый экран раздела Владельца.
 *
 * Ровно один источник: `GET /event-types`. Окна приёма разделу не нужны, Владелец
 * не бронирует.
 *
 * Пустое состояние и отказ разведены намеренно. «Типов пока нет» — это про данные,
 * а отказ — про то, что данных не узнали. Показывать вместо отказа пустое
 * состояние значило бы сказать Владельцу, что он завёл пустой Календарь, хотя
 * сеть просто не ответила.
 */
const EventTypesPage = () => {
  const source = useEventTypes()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formError, setFormError] = useState<Refusal | null>(null)

  const save = async (values: {
    id?: string
    name: string
    description: string
    durationMinutes: number
  }) => {
    setFormError(null)

    if (editingId !== null) {
      const response = await eventTypeByIdUpdateEventType(editingId, {
        name: values.name,
        description: values.description,
      })

      if (response.status !== 200) {
        setFormError({
          message: response.data.message,
          ...(response.status === 422 ? { fields: response.data.fields } : {}),
        })
        return
      }

      // Успех показывает карточку сразу: перечитывание списка мигнуло бы экраном
      // и заставило бы Владельца гадать, сохранилось ли.
      setEditingId(null)
      return
    }

    const response = await eventTypesCreateEventType({
      id: values.id ?? '',
      name: values.name,
      description: values.description,
      durationMinutes: values.durationMinutes,
    })

    if (response.status !== 201) {
      setFormError({
        message: response.data.message,
        ...('code' in response.data ? { code: response.data.code } : {}),
        ...(response.status === 422 ? { fields: response.data.fields } : {}),
      })
    }
  }

  const header = <Title order={1}>Типы событий</Title>

  if (source.kind === 'отказ') {
    return (
      <Stack gap="lg">
        {header}
        <SourceAlert message={source.message} />
      </Stack>
    )
  }

  if (source.kind === 'загрузка') {
    return (
      <Stack gap="lg">
        {header}
        <Text c="dimmed">Загружаем типы событий…</Text>
      </Stack>
    )
  }

  const editing = source.value.find((type) => type.id === editingId) ?? null

  return (
    <Stack gap="lg">
      {header}

      <EventTypeForm
        editingId={editingId}
        initialName={editing?.name}
        initialDescription={editing?.description}
        onSubmit={save}
        error={formError}
        onCancel={editingId === null ? undefined : () => setEditingId(null)}
      />

      {source.value.length === 0 ? (
        <Text size="sm">Типов пока нет</Text>
      ) : (
        <Stack gap="sm">
          {source.value.map((eventType: EventTypeSummary) => (
            <EventTypeCard
              key={eventType.id}
              eventType={eventType}
              renaming={eventType.id === editingId}
              onRename={setEditingId}
            />
          ))}
        </Stack>
      )}
    </Stack>
  )
}

export default EventTypesPage