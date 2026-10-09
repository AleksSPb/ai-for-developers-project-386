import { useState } from 'react'

import { Button, Card, Group, Stack, Text, TextInput } from '@mantine/core'

import { errorsFromRefusal, type FieldValues, type Refusal } from '../app/refusal'
import { fitsIn, TYPED_LIMITS, type TextField } from '../app/textLimits'
import LengthCounter from './LengthCounter'

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

/**
 * Форма создания и переименования Типа события.
 *
 * Под каждым текстовым полем стоит счётчик остатка, а лишнее форма не принимает:
 * обрезание молча отнимало бы текст без предупреждения, а обрезанное описание
 * сделало бы два одинаково названных Типа неразличимыми для Гостя, и он не увидел
 * бы почему.
 *
 * Границу держит форма, а не атрибут `maxLength`: браузер считает его в кодовых
 * единицах UTF-16, где символ может стоить два, и обрезал бы эмодзи там, где
 * контракт их разрешает. Атрибут остаётся, но удвоенным — отсекает совсем
 * непристойное значение, а счётчик, форма и сервер меряют одно и то же.
 *
 * Ничего не обрезается **и при отправке**: `submit` отдаёт то, что введено, а не
 * обрезанное до предела значение. Правило одно и не расходящееся — обрезалось бы
 * одинаково, а значит не обрезается нигде.
 */
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

  /**
   * Значения, с которыми форма последний раз уходила на сервер.
   *
   * Отказ говорит о том, что было отправлено. Как только Владелец меняет значение,
   * отказ относится уже к другому тексту, и держать под ним красную подпись нельзя:
   * поле выглядело бы негодным при вполне годном содержимом, и Владелец искал бы
   * причину, которой нет.
   *
   * Правило одно на все отказы, включая занятый идентификатор: сменил значение —
   * отказ больше не про него.
   */
  const [sent, setSent] = useState<FieldValues | null>(null)

  /**
   * Отказ держится, пока форма не менялась.
   *
   * Проверка одна на всё: и подписи под полями, и сводная строка. Стоит она не под
   * полем, потому что нужна для отказов без полей — сервис недоступен, проверка
   * пришла вовсе без перечисления. Но пока Владелец ничего не поправил, повод
   * молчать исчезает: сводная строка «Проверка не прошла» осталась бы висеть после
   * того, как он всё исправил, и выглядела бы как новая беда.
   */
  const isUnchanged =
    sent !== null &&
    values.id.trim() === sent.id &&
    values.name.trim() === sent.name &&
    values.description.trim() === sent.description

  const named = errorsFromRefusal(error, values)

  /**
   * Ввод текстового поля: лишнее форма не примет.
   *
   * Значение при этом **не обрезается** — оно просто не меняется, и Владелец видит
   * счётчик на нуле. Обрезание отняло бы конец фразы молча, и отправленный текст
   * разошёлся бы с тем, что стоит на экране.
   */
  const change = (field: TextField, next: string) =>
    setValues((current) => (fitsIn(field, next) ? { ...current, [field]: next } : current))

  const fieldErrors = Object.fromEntries(
    Object.entries(named).filter(
      ([field]) => values[field as TextField].trim() === sent?.[field as TextField],
    ),
  )

  const summary = error !== null && isUnchanged && Object.keys(fieldErrors).length === 0

  const submit = () => {
    const outgoing = {
      ...(editingId === null ? { id: values.id.trim() } : {}),
      name: values.name.trim(),
      description: values.description.trim(),
    }

    setSent({ id: '', ...outgoing })

    onSubmit({ ...outgoing, durationMinutes: Number(values.durationMinutes) })
  }

  return (
    <Card withBorder padding="lg" radius="md">
      <Stack gap="sm">
        <Text fw={600}>{editingId === null ? 'Новый тип события' : `Переименование: ${editingId}`}</Text>

        {editingId === null && (
          <>
            {/* Идентификатор пишет сам Владелец и он неизменен после создания:
                поэтому он на форме создания и его нет на форме переименования. */}
            <Stack gap={2}>
              <TextInput
                label="Идентификатор"
                placeholder="consultation"
                value={values.id}
                error={fieldErrors.id}
                maxLength={TYPED_LIMITS.id}
                onChange={(event) => change('id', event.currentTarget.value)}
              />
              <LengthCounter field="id" value={values.id} />
            </Stack>
            <TextInput
              label="Длительность, минут"
              value={values.durationMinutes}
              onChange={(event) => setValues({ ...values, durationMinutes: event.currentTarget.value })}
            />
          </>
        )}

        <Stack gap={2}>
          <TextInput
            label="Название"
            value={values.name}
            error={fieldErrors.name}
            maxLength={TYPED_LIMITS.name}
            onChange={(event) => change('name', event.currentTarget.value)}
          />
          <LengthCounter field="name" value={values.name} />
        </Stack>

        <Stack gap={2}>
          <TextInput
            label="Описание"
            value={values.description}
            error={fieldErrors.description}
            maxLength={TYPED_LIMITS.description}
            onChange={(event) => change('description', event.currentTarget.value)}
          />
          <LengthCounter field="description" value={values.description} />
        </Stack>

        {summary && (
          <Text c="red" size="sm">
            {/* Текст свой, а не `message` из ответа: то поле — строка для
                разработчика, и перед Владельцем оно было бы чужой фразой. Причину
                называют подписи под полями, а сюда попадают только отказы без полей. */}
            Не удалось сохранить. Попробуйте ещё раз
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