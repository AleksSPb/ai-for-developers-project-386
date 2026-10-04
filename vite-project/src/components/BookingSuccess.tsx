import { Button, Card, Stack, Text, Title } from '@mantine/core'

interface BookingSuccessProps {
  /** Возврат к первому шагу: дата сохраняется, Слот сбрасывается. */
  onAgain: () => void
}

const BookingSuccess = ({ onAgain }: BookingSuccessProps) => (
  <Card withBorder padding="lg" radius="md" style={{ flex: 1, minWidth: 320 }}>
    <Stack gap="md">
      <Title order={3}>Бронь подтверждена. До встречи!</Title>
      <Text size="sm" c="dimmed">
        Запись сохранена в этом браузере.
      </Text>
      <Button onClick={onAgain}>Забронировать ещё</Button>
    </Stack>
  </Card>
)

export default BookingSuccess