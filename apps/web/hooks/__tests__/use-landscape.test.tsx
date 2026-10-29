import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, act } from '@testing-library/react'
import { useLandscape } from '../use-landscape'

/**
 * The review screens read this to choose between the bottom sheet and the side
 * column. It has to follow a rotation like `(orientation: landscape)` does, but
 * not the keyboard: Chrome on iOS shrinks the layout viewport when the keyboard
 * opens, and a portrait phone then matches landscape without turning.
 */

const QUERY = '(orientation: landscape)'
type Listener = (e: { matches: boolean }) => void

function stubViewport(initial: { landscape: boolean; width: number }) {
  const listeners = new Set<Listener>()
  let landscape = initial.landscape
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: initial.width })
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === QUERY && landscape
    },
    media: query,
    onchange: null,
    addEventListener: (_: string, fn: Listener) => { if (query === QUERY) listeners.add(fn) },
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
  return {
    /** The query flips; `width` is the viewport width after the flip. */
    change(next: boolean, width: number) {
      landscape = next
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
      act(() => listeners.forEach((fn) => fn({ matches: next })))
    },
  }
}

function Probe({ children }: { children?: ReactNode }) {
  return (
    <>
      <span data-testid="result">{String(useLandscape())}</span>
      {children}
    </>
  )
}

const result = () => screen.getByTestId('result').textContent

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
})

describe('useLandscape', () => {
  it('reports the query on first render', () => {
    stubViewport({ landscape: true, width: 852 })
    render(<Probe />)
    expect(result()).toBe('true')
  })

  it('follows a rotation, which changes the width', () => {
    const vp = stubViewport({ landscape: false, width: 393 })
    render(<Probe />)
    vp.change(true, 852)
    expect(result()).toBe('true')
    vp.change(false, 393)
    expect(result()).toBe('false')
  })

  it('ignores the keyboard: same width, focus in a text field', () => {
    const vp = stubViewport({ landscape: false, width: 393 })
    render(<Probe><textarea data-testid="box" /></Probe>)
    act(() => screen.getByTestId('box').focus())

    // Keyboard opens: the viewport is now wider than tall, the phone did not turn.
    vp.change(true, 393)
    expect(result()).toBe('false')

    // Keyboard closes.
    vp.change(false, 393)
    expect(result()).toBe('false')
  })

  it('treats a text input and a contenteditable like a textarea', () => {
    const vp = stubViewport({ landscape: false, width: 393 })
    render(
      <Probe>
        <input data-testid="name" type="email" />
        <div data-testid="rich" contentEditable suppressContentEditableWarning />
      </Probe>,
    )
    act(() => screen.getByTestId('name').focus())
    vp.change(true, 393)
    expect(result()).toBe('false')

    vp.change(false, 393)
    const rich = screen.getByTestId('rich')
    // jsdom does not implement isContentEditable.
    Object.defineProperty(rich, 'isContentEditable', { configurable: true, value: true })
    act(() => rich.focus())
    vp.change(true, 393)
    expect(result()).toBe('false')
  })

  it('still follows a rotation made while typing', () => {
    const vp = stubViewport({ landscape: false, width: 393 })
    render(<Probe><textarea data-testid="box" /></Probe>)
    act(() => screen.getByTestId('box').focus())
    vp.change(true, 852)
    expect(result()).toBe('true')
  })

  it('follows a same-width flip when nothing that raises a keyboard is focused', () => {
    // A desktop window dragged shorter than it is wide, or a checkbox focused.
    const vp = stubViewport({ landscape: false, width: 600 })
    render(<Probe><input data-testid="check" type="checkbox" /></Probe>)
    vp.change(true, 600)
    expect(result()).toBe('true')

    vp.change(false, 600)
    act(() => screen.getByTestId('check').focus())
    vp.change(true, 600)
    expect(result()).toBe('true')
  })
})
