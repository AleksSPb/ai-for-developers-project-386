/** Зона браузера Гостя. */
export const getGuestTimeZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone