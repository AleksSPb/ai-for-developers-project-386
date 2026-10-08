import { Box, Button, Container, Group, Text } from '@mantine/core'
import { IconCalendar } from '@tabler/icons-react'
import { Link, useLocation } from 'react-router'

/**
 * Куда ведут ссылки шапки, и кому они показываются.
 *
 * Ссылки на раздел Владельца в гостевой шапке нет: единственный вход в раздел —
 * ручной набор адреса, и гостевая страница про Владельца знать не должна. Обратно
 * — можно: из раздела нужен выход в гостевую запись.
 */
const guestRoutes = [
  { to: '/book', label: 'Записаться' },
  { to: '/bookings', label: 'Брони' },
] as const

const ownerRoutes = [
  { to: '/event-types', label: 'Типы событий' },
  { to: '/meetings', label: 'Встречи' },
] as const

const isOwnerPath = (pathname: string): boolean =>
  ownerRoutes.some((route) => route.to === pathname)

const AppHeader = () => {
  const { pathname } = useLocation()
  const isOwner = isOwnerPath(pathname)

  const routes = isOwner
    ? [{ to: '/book', label: 'Записаться' }, ...ownerRoutes]
    : [...guestRoutes]

  return (
    <Box component="header" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
      <Container size="lg" py="sm">
        <Group justify="space-between">
          <Group gap="xs">
            <IconCalendar size={22} color="var(--mantine-color-orange-6)" />
            <Text fw={700}>Calendar</Text>
          </Group>
          {/* Активный раздел показан залитой кнопкой, остальные — подложкой:
              так же выглядит шапка в макете. */}
          <Group gap="xs">
            {routes.map(({ to, label }) => {
              const isActive = pathname === to
              return (
                <Button
                  key={to}
                  component={Link}
                  to={to}
                  size="sm"
                  color="gray"
                  variant={isActive ? 'filled' : 'subtle'}
                >
                  {label}
                </Button>
              )
            })}
          </Group>
        </Group>
      </Container>
    </Box>
  )
}

export default AppHeader