import { Stack, Text, Title } from '@mantine/core'

interface BookingHeaderProps {
  /** Название и описание приходят вместе с одиночным чтением Типа. */
  name: string
  description: string
}

/**
 * Заголовок страницы записи.
 *
 * Название и описание Типа стоят здесь **всегда**, а не только после выбора
 * Слота: гость открыл ссылку из чата и должен видеть, на что идёт, с первого
 * экрана — иначе он узнает, что записывается не на то, уже введя имя и почту.
 */
const BookingHeader = ({ name, description }: BookingHeaderProps) => (
  <Stack gap={2}>
    <Title order={1}>{name}</Title>
    <Text size="sm" c="dimmed">
      {description}
    </Text>
  </Stack>
)

export default BookingHeader