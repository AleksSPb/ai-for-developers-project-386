package com.hexlet.calendar.prototype;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.hexlet.calendar.api.model.CreateBookingRequest;
import com.hexlet.calendar.api.model.CreateEventTypeRequest;
import com.hexlet.calendar.api.model.TimeRange;
import com.hexlet.calendar.prototype.jpa.Booking;
import com.hexlet.calendar.prototype.jpa.EventType;
import com.hexlet.calendar.prototype.jpa.Window;
import com.hexlet.calendar.prototype.mapping.BookingMapper;
import com.hexlet.calendar.prototype.mapping.EventTypeMapper;
import com.hexlet.calendar.prototype.refusal.Refusal;
import com.hexlet.calendar.prototype.repository.BookingRepository;
import com.hexlet.calendar.prototype.repository.EventTypeRepository;
import com.hexlet.calendar.prototype.repository.WindowRepository;
import com.hexlet.calendar.prototype.service.BookingService;
import com.hexlet.calendar.prototype.service.EventTypeService;

/**
 * ПРОТОТИП (#83). Наблюдение №2: «начало в прошлом» тестируется БЕЗ базы.
 *
 * <p>Никакого {@code @SpringBootTest}, никаких контейнеров: {@code Clock} —
 * конструкторный параметр слоя правил (D21), репозитории — мок. Если бы часы
 * читались в запросах или в репозитории, этот файл был бы невозможен, а
 * фикстура времени требовала бы контейнер на каждый шаг порядка D32.
 *
 * <p>Второе наблюдение, которое даёт только такой тест: шаг «прошлое» стоит
 * РАНЬШЕ шага «длительность» (D32 в редакции #81) — видно по {@code verify}:
 * за типом событий репозиторий не идёт вовсе.
 */
class RulesWithoutDbTest {

    private static final Instant NOW = Instant.parse("2026-10-09T09:00:00Z");
    private static final Clock FIXED = Clock.fixed(NOW, ZoneOffset.UTC);

    private final WindowRepository windows = mock(WindowRepository.class);
    private final EventTypeRepository types = mock(EventTypeRepository.class);
    private final BookingRepository bookings = mock(BookingRepository.class);

    private final BookingService service = new BookingService(
            FIXED, bookings, types, windows, new BookingMapper(), null);

    @Test
    @DisplayName("начало в прошлом — 422 time_not_bookable, и база не тронута")
    void pastStartRefusesBeforeAnyRead() {
        when(types.findById(anyString()))
                .thenReturn(Optional.of(new EventType("consult", "Консультация", "описание", 60)));

        CreateBookingRequest request = bookingRequest("consult",
                NOW.minusSeconds(3600), NOW.minusSeconds(3600).plusSeconds(3600));

        assertThatThrownBy(() -> service.create(request, BookingService.Mode.NORMAL))
                .isInstanceOfSatisfying(Refusal.class,
                        refusal -> assertThat(refusal.kind()).isEqualTo(Refusal.Kind.TIME_NOT_BOOKABLE));

        // Прошлое раньше длительности: до база за типом не шли (D32, #81).
        verify(types, never()).findById(anyString());
        verify(windows, never()).findByEndDtAfterOrderByStartDtAsc(any());
    }

    @Test
    @DisplayName("длительность ≠ длительности Типа → 422 validation_failed[timeRange]")
    void durationMustMatchType() {
        when(types.findById("consult"))
                .thenReturn(Optional.of(new EventType("consult", "Консультация", "описание", 60)));

        CreateBookingRequest request = bookingRequest("consult",
                NOW.plusSeconds(3600), NOW.plusSeconds(3600).plusSeconds(1800));

        assertThatThrownBy(() -> service.create(request, BookingService.Mode.NORMAL))
                .isInstanceOfSatisfying(Refusal.class, refusal -> {
                    assertThat(refusal.kind()).isEqualTo(Refusal.Kind.VALIDATION_FAILED);
                    assertThat(refusal.fields()).containsExactly("timeRange");
                });
    }

    @Test
    @DisplayName("нет окна, содержащего интервал → 404 slot_not_found")
    void intervalMustFitOneWindow() {
        when(types.findById("consult"))
                .thenReturn(Optional.of(new EventType("consult", "Консультация", "описание", 60)));
        when(windows.findByEndDtAfterOrderByStartDtAsc(NOW))
                .thenReturn(List.of(new Window(
                        NOW.plusSeconds(3600), NOW.plusSeconds(3600).plusSeconds(1800))));

        // Интервал 09:00+3600 … +7200 не влезает в окно [+3600, +5400): не 409, а 404 (D35).
        CreateBookingRequest request = bookingRequest("consult",
                NOW.plusSeconds(3600), NOW.plusSeconds(3600).plusSeconds(3600));

        assertThatThrownBy(() -> service.create(request, BookingService.Mode.NORMAL))
                .isInstanceOfSatisfying(Refusal.class,
                        refusal -> assertThat(refusal.kind()).isEqualTo(Refusal.Kind.SLOT_NOT_FOUND));
    }

    @Test
    @DisplayName("повтор по ключу (тип, начало, почта) — старая Бронь, имя не обновляется (D37)")
    void repeatReturnsOldBooking() {
        Booking old = new Booking(UUID.fromString("11111111-1111-1111-1111-111111111111"),
                "consult", NOW.plusSeconds(3600), NOW.plusSeconds(7200),
                "ИВАН", "ivan@example.com", NOW.minusSeconds(60));

        when(types.findById("consult"))
                .thenReturn(Optional.of(new EventType("consult", "Консультация", "описание", 60)));
        when(windows.findByEndDtAfterOrderByStartDtAsc(NOW))
                .thenReturn(List.of(new Window(NOW, NOW.plusSeconds(36000))));
        when(bookings.findByEventTypeIdAndStartDtAndGuestEmail("consult",
                NOW.plusSeconds(3600), "ivan@example.com")).thenReturn(Optional.of(old));

        // Тот же ключ, но другое имя: ответ — старая Броня со СТАРЫМ именем.
        CreateBookingRequest request = bookingRequest("consult",
                NOW.plusSeconds(3600), NOW.plusSeconds(7200), "Пётр");

        var model = service.create(request, BookingService.Mode.NORMAL);

        assertThat(model.getId()).isEqualTo("11111111-1111-1111-1111-111111111111");
        assertThat(model.getGuestName()).isEqualTo("ИВАН");
        assertThat(model.getCreatedAt().toInstant()).isEqualTo(NOW.minusSeconds(60));
    }

    @Test
    @DisplayName("почта проверяется руками → 422 validation_failed[guestEmail] (D41)")
    void emailFormatIsManualRule() {
        CreateBookingRequest request = bookingRequest("consult",
                NOW.plusSeconds(3600), NOW.plusSeconds(7200));
        request.setGuestEmail("nope");

        assertThatThrownBy(() -> service.create(request, BookingService.Mode.NORMAL))
                .isInstanceOfSatisfying(Refusal.class, refusal -> {
                    assertThat(refusal.kind()).isEqualTo(Refusal.Kind.VALIDATION_FAILED);
                    assertThat(refusal.fields()).containsExactly("guestEmail");
                });
    }

    @Test
    @DisplayName("кратность 15 — ручное правило Типа (D42): 20 минут → fields[durationMinutes]")
    void durationStepIsManual() {
        EventTypeService typeService = new EventTypeService(types, new EventTypeMapper(), null);

        CreateEventTypeRequest request = new CreateEventTypeRequest();
        request.setId("coaching");
        request.setName("Коучинг");
        request.setDescription("описание");
        request.setDurationMinutes(20);

        assertThatThrownBy(() -> typeService.create(request, EventTypeService.Mode.NORMAL))
                .isInstanceOfSatisfying(Refusal.class, refusal -> {
                    assertThat(refusal.kind()).isEqualTo(Refusal.Kind.VALIDATION_FAILED);
                    assertThat(refusal.fields()).containsExactly("durationMinutes");
                });
    }

    private static CreateBookingRequest bookingRequest(String typeId, Instant start, Instant end) {
        return bookingRequest(typeId, start, end, "Иван");
    }

    private static CreateBookingRequest bookingRequest(String typeId, Instant start, Instant end,
                                                       String guestName) {

        TimeRange range = new TimeRange();
        range.setStart(OffsetDateTime.ofInstant(start, ZoneOffset.UTC));
        range.setEnd(OffsetDateTime.ofInstant(end, ZoneOffset.UTC));

        CreateBookingRequest request = new CreateBookingRequest();
        request.setEventTypeId(typeId);
        request.setTimeRange(range);
        request.setGuestName(guestName);
        request.setGuestEmail("ivan@example.com");
        return request;
    }
}
