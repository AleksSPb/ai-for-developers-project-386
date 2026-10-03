import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

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

window.matchMedia = matchMediaStub

// jsdom не реализует ResizeObserver
window.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof window.ResizeObserver

afterEach(() => {
  cleanup()
})