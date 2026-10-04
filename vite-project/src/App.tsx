import { Container } from '@mantine/core'
import { Navigate, Route, Routes } from 'react-router'

import AppHeader from './components/AppHeader'
import BookingPage from './pages/BookingPage'
import UpcomingPage from './pages/UpcomingPage'

/**
 * Роутер живёт в `main.tsx`, а не здесь: тесты подставляют свой, чтобы
 * проверять страницы по адресу, не трогая историю браузера.
 */
function App() {
  return (
    <>
      <AppHeader />
      <Container size="lg" py="xl">
        <Routes>
          <Route path="/book" element={<BookingPage />} />
          <Route path="/bookings" element={<UpcomingPage />} />
          {/* Без этого неизвестный адрес показал бы пустую страницу. */}
          <Route path="*" element={<Navigate to="/book" replace />} />
        </Routes>
      </Container>
    </>
  )
}

export default App