import { Container } from '@mantine/core'
import { Navigate, Route, Routes } from 'react-router'

import AppHeader from './components/AppHeader'
import BookingPage from './pages/BookingPage'
import EventTypesPage from './pages/EventTypesPage'
import MeetingsPage from './pages/MeetingsPage'
import UpcomingPage from './pages/UpcomingPage'

/**
 * Роутер живёт в `main.tsx`, а не здесь: тесты подставляют свой, чтобы
 * проверять страницы по адресу, не трогая историю браузера.
 *
 * Типы событий и Встречи разведены по **разным адресам**, а не сведены на один
 * экран: у страниц разный состав источников. Типы грузят один, встречи — два, и
 * смешав их, пришлось бы грузить оба всегда.
 */
function App() {
  return (
    <>
      <AppHeader />
      <Container size="lg" py="xl">
        <Routes>
          <Route path="/book" element={<BookingPage />} />
          <Route path="/bookings" element={<UpcomingPage />} />
          <Route path="/event-types" element={<EventTypesPage />} />
          <Route path="/meetings" element={<MeetingsPage />} />
          {/* Без этого неизвестный адрес показал бы пустую страницу. */}
          <Route path="*" element={<Navigate to="/book" replace />} />
        </Routes>
      </Container>
    </>
  )
}

export default App