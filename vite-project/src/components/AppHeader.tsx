import { Box, Button, Container, Group, Text } from '@mantine/core'
import { IconCalendar } from '@tabler/icons-react'
import { Link, useLocation } from 'react-router'

/** Куда ведут ссылки шапки: страница записи и список Броней. */
const routes = [
  { to: '/book', label: 'Записаться' },
  { to: '/bookings', label: 'Брони' },
] as const

const AppHeader = () => {
  const { pathname } = useLocation()

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