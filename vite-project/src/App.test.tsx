import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import App from './App'

// Роутер подставляется тестом: в приложении его ставит main.tsx, а здесь
// важно проверять страницы по адресу, не трогая историю браузера.
const renderAt = (path: string) =>
  render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </MantineProvider>,
  )

const bookingHeading = () => screen.getByRole('heading', { name: 'Запись на звонок', level: 1 })

describe('маршруты', () => {
  it('показывает страницу записи', () => {
    renderAt('/book')
    expect(bookingHeading()).toBeTruthy()
  })

  it('показывает список Броней', () => {
    renderAt('/bookings')
    expect(screen.getByRole('heading', { name: 'Брони', level: 1 })).toBeTruthy()
  })

  it('неизвестный адрес открывает страницу записи, а не пустую страницу', () => {
    renderAt('/нет-такой-страницы')
    expect(bookingHeading()).toBeTruthy()
  })
})

describe('шапка', () => {
  it('ведёт в оба раздела', () => {
    renderAt('/book')
    expect(screen.getByRole('link', { name: 'Записаться' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Брони' })).toBeTruthy()
  })

  it('переключает раздел по ссылке', () => {
    renderAt('/book')
    fireEvent.click(screen.getByRole('link', { name: 'Брони' }))
    expect(screen.getByRole('heading', { name: 'Брони', level: 1 })).toBeTruthy()
  })
})