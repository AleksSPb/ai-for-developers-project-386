import { Title } from '@mantine/core'

/**
 * Список Броней Гостя. Заголовок раздела в макете был «Предстоящие события»,
 * но здесь показываются и прошедшие Брони, поэтому заголовок из макета врал бы.
 */
const UpcomingPage = () => <Title order={1}>Брони</Title>

export default UpcomingPage