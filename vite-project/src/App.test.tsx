import { MantineProvider } from '@mantine/core'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App.tsx'

describe('smoke test', () => {
  it('renders the application', () => {
    render(
      <MantineProvider>
        <App />
      </MantineProvider>,
    )

    // Дерево смонтировалось и отрендерилось до конца, без краша
    expect(
      screen.getByRole('heading', { name: /mantine is connected/i }),
    ).toBeTruthy()

    // Mantine-компоненты замаунтились, useId связал label с input,
    // и заглушек из setup.ts достаточно для их работы
    expect(screen.getByLabelText(/your name/i)).toBeTruthy()
  })
})