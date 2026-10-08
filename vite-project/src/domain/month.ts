import { getDayNumber, getDaysInMonth, getWeekdayIndex, parseMonthKey, type DateKey, type MonthKey } from './calendar'

/**
 * Сетка месяца и заголовок с диапазоном.
 *
 * Месяц рисуется не целиком: слева он обрезан по сегодняшнему дню, справа — по
 * последнему дню со Слотом. Обрезанные места закрываются заглушками без чисел:
 * приглушённое число спорило бы с заголовком, а клик по нему ничего не дал бы.
 */

const monthName = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long' })

/**
 * Имя месяца в форме, которой требует русский язык: «октября», а не «октябрь».
 *
 * Отдельного значения `genitive` у `Intl` нет, а падеж приходит только когда в
 * формате запрошен ещё и день: с одним `month: 'long'` ICU отдаёт именительный
 * падеж, и заголовок вышел бы «1 – 31 октябрь». День в формат попадает
 * фиктивно — 15-е число — и на результат не влияет.
 */
const formatMonthName = (month: MonthKey): string => {
  const { year, month: monthNumber } = parseMonthKey(month)
  const parts = monthName.formatToParts(new Date(Date.UTC(year, monthNumber - 1, 15)))
  const found = parts.find((part) => part.type === 'month')

  return found?.value ?? ''
}

/**
 * Ячейки месячной сетки: пустые места до первого числа, дни месяца, пустые
 * места после последнего доступного дня.
 *
 * `first` и `last` — границы видимой части месяца. Дни вне их диапазона
 * заменяются `null`, а не обрезаются: иначе сетка съехала бы и дни уезжали бы в
 * соседние строки.
 */
export const getMonthCells = (
  month: MonthKey,
  first: DateKey,
  last: DateKey,
): (DateKey | null)[] => {
  const { year, month: monthNumber } = parseMonthKey(month)
  const daysInMonth = getDaysInMonth(month)
  const monthStart: DateKey = `${year}-${String(monthNumber).padStart(2, '0')}-01`
  const monthEnd: DateKey = `${year}-${String(monthNumber).padStart(2, '0')}-${daysInMonth}`
  const pad = (value: number): string => String(value).padStart(2, '0')

  // Неделя начинается с понедельника: пустые места до 1-го числа считаются от
  // него, иначе понедельник встал бы на место среды.
  const leading = getWeekdayIndex(monthStart)
  const trailing = 6 - getWeekdayIndex(monthEnd)

  const cells: (DateKey | null)[] = Array.from({ length: leading }, () => null)

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date: DateKey = `${year}-${pad(monthNumber)}-${pad(day)}`
    cells.push(date >= first && date <= last ? date : null)
  }

  return [...cells, ...Array.from({ length: trailing }, () => null)]
}

/** Дни месяца, которые попали в сетку. */
export const getVisibleDays = (cells: readonly (DateKey | null)[]): DateKey[] =>
  cells.filter((cell): cell is DateKey => cell !== null)

/**
 * Заголовок месяца с диапазоном дат: «1 – 31 октября 2026».
 *
 * Диапазон есть **всегда**, в том числе в полном месяце: одна подпись «октябрь»
 * ничего не говорит о том, доступен ли месяц целиком или обрезан по краям.
 */
export const getMonthTitleRange = (first: DateKey, last: DateKey, month: MonthKey): string => {
  const { year } = parseMonthKey(month)
  const name = formatMonthName(month)

  return `${getDayNumber(first)} – ${getDayNumber(last)} ${name} ${year}`
}