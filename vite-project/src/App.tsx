import { Container } from '@mantine/core'
import { Navigate, Route, Routes, useParams } from 'react-router'

import AppHeader from './components/AppHeader'
import BookingPage from './pages/BookingPage'
import EventTypesPage from './pages/EventTypesPage'
import MeetingsPage from './pages/MeetingsPage'
import TypeSelectionPage from './pages/TypeSelectionPage'
import UpcomingPage from './pages/UpcomingPage'

/**
 * Маршрут `/book/:eventTypeId` передаёт идентификатор Типа странице.
 *
 * Знание адреса живёт здесь, в маршруте, а не внутри страницы: страница получает
 * то, что ей нужно, и не разбирает, откуда оно взялось.
 */
const BookingRoute = () => {
  const { eventTypeId = '' } = useParams()
  return <BookingPage eventTypeId={eventTypeId} />
}

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
          {/* Голого адреса без Типа не существует: `/book` ведёт на выбор. */}
          <Route path="/book" element={<TypeSelectionPage />} />
          <Route path="/book/:eventTypeId" element={<BookingRoute />} />
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