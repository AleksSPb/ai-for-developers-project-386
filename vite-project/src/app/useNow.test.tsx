import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useNow } from './useNow'

const Probe = () => <span>сейчас: {useNow().getUTCMinutes()}</span>

const minutes = () => screen.getByText(/сейчас: \d+/).textContent

const hiddenDescriptor = Object.getOwnPropertyDescriptor(document, 'hidden')

const setHidden = (value: boolean) => {
  Object.defineProperty(document, 'hidden', { configurable: true, value })
}

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T06:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    if (hiddenDescriptor === undefined) {
      delete (document as { hidden?: boolean }).hidden
    } else {
      Object.defineProperty(document, 'hidden', hiddenDescriptor)
    }
  })

  it('отдаёт текущий момент на первом рендере', () => {
    render(<Probe />)
    expect(minutes()).toBe('сейчас: 0')
  })

  it('обновляет момент раз в минуту', () => {
    render(<Probe />)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(minutes()).toBe('сейчас: 1')
  })

  it('не обновляет момент в фоновой вкладке', () => {
    setHidden(true)
    render(<Probe />)
    act(() => {
      vi.advanceTimersByTime(5 * 60_000)
    })
    expect(minutes()).toBe('сейчас: 0')
  })

  it('пересчитывает момент сразу после возврата вкладки в фокус', () => {
    setHidden(true)
    render(<Probe />)
    act(() => {
      vi.advanceTimersByTime(5 * 60_000)
    })
    setHidden(false)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(minutes()).toBe('сейчас: 5')
  })
})