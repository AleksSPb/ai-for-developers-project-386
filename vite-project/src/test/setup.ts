import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import './server'

// Тест контракта работает в node, а не в jsdom: он читает файл спецификации и
// интерфейса не трогает. Пробки ниже нужны только когда окно есть.
const hasWindow = typeof window !== 'undefined'

// jsdom не реализует matchMedia, без него нечем эмулировать prefers-color-scheme
const matchMediaStub = (query: string) =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList

if (hasWindow) {
  window.matchMedia = matchMediaStub

  // jsdom не реализует ResizeObserver
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof window.ResizeObserver
}

afterEach(() => {
  if (hasWindow) {
    cleanup()
  }
})