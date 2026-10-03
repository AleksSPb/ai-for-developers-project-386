import { useState } from 'react'
import {
  Button,
  Card,
  Container,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core'

function App() {
  const [count, setCount] = useState(0)
  const [name, setName] = useState('')
  const [framework, setFramework] = useState<string | null>('vite')
  const [enabled, setEnabled] = useState(true)

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <div>
          <Title order={1}>Mantine is connected</Title>
          <Text c="dimmed">
            Edit <Text span fw={500}>src/App.tsx</Text> and save to test HMR
          </Text>
        </div>

        <Card withBorder shadow="sm" padding="lg" radius="md">
          <Stack>
            <TextInput
              label="Your name"
              placeholder="Type something"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />

            <Select
              label="Framework"
              data={['vite', 'react', 'mantine']}
              value={framework}
              onChange={setFramework}
              allowDeselect={false}
            />

            <NumberInput label="Amount" defaultValue={1} min={0} max={10} />

            <Switch
              label="Enable notifications"
              checked={enabled}
              onChange={(event) => setEnabled(event.currentTarget.checked)}
            />

            <Group justify="space-between" mt="xs">
              <Text fw={500}>Count is {count}</Text>
              <Button onClick={() => setCount((value) => value + 1)}>
                Increment
              </Button>
            </Group>
          </Stack>
        </Card>
      </Stack>
    </Container>
  )
}

export default App