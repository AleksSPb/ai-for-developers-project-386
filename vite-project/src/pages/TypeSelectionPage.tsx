import { Stack, Text, Title } from '@mantine/core'

import { useEventTypes } from '../app/useEventTypes'
import EventTypeChoice from '../components/EventTypeChoice'
import SourceAlert from '../components/SourceAlert'

/**
 * Страница выбора Типа события.
 *
 * Голого адреса без Типа не существует: `/book` ведёт сюда. Один источник — список
 * Типов. **Окна приёма не грузятся**: рисовать тут нечего, и сторож-таймер со
 * страницы записи сюда не переносится — у этой страницы своего опроса нет.
 *
 * Пустое состояние получает собственный текст, не совпадающий ни с «Записей пока
 * нет» (гость), ни с «Типов пока нет» (Владелец). Три разных вопроса — три разных
 * ответа, и совпадение текстов отправляло бы читателя на чужую страницу.
 */
const TypeSelectionPage = () => {
  // Перечитывать источник здесь нечем: страница ничего не меняет, и сторож на ней
  // только ходил бы по серверу без причины.
  const { state: source } = useEventTypes()

  const header = <Title order={1}>Запись на звонок</Title>

  if (source.kind === 'отказ') {
    // Тот же компонент отказа, что на остальных страницах: один отказ не должен
    // звучать по-разному в зависимости от точки входа.
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

  if (source.value.length === 0) {
    return (
      <Stack gap="lg">
        {header}
        <Text size="sm">Доступных для записи типов событий нет</Text>
      </Stack>
    )
  }

  return (
    <Stack gap="lg">
      <Title order={1}>На что записаться?</Title>

      <Stack gap="sm">
        {source.value.map((eventType) => (
          <EventTypeChoice key={eventType.id} eventType={eventType} />
        ))}
      </Stack>
    </Stack>
  )
}

export default TypeSelectionPage