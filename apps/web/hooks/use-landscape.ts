'use client'

import { useCallback, useRef, useSyncExternalStore } from 'react'

const LANDSCAPE = '(orientation: landscape)'

/** Input types that never raise an on-screen keyboard. */
const NO_KEYBOARD_INPUTS = new Set([
  'button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit',
])

function raisesKeyboard(el: Element | null): boolean {
  if (el instanceof HTMLTextAreaElement) return true
  if (el instanceof HTMLInputElement) return !NO_KEYBOARD_INPUTS.has(el.type)
  return el instanceof HTMLElement && el.isContentEditable
}

function subscribe(onStoreChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const mql = window.matchMedia(LANDSCAPE)
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

/** Same reasoning as useMediaQuery: `false` is the portrait phone layout. */
function getServerSnapshot(): boolean {
  return false
}

/**
 * `(orientation: landscape)`, minus the flips an on-screen keyboard causes.
 *
 * Chrome on iOS shrinks the LAYOUT viewport when the keyboard opens, so a
 * portrait phone briefly reads as landscape the moment someone taps the comment
 * box. The review screens take that as a rotation and swap the bottom sheet for
 * the side column, which unmounts the very textarea being typed in: the
 * keyboard closes, the query flips back, and the sheet returns at `peek`. Typing
 * a comment there is impossible.
 *
 * A real rotation always changes the viewport width; the keyboard never does.
 * So a flip that arrives with focus in a text field and the width unchanged is
 * the keyboard, and the previous answer stands. Everything else — a rotation
 * mid-sentence, a desktop window resized with nothing focused — passes
 * through, exactly as useMediaQuery reports it.
 */
export function useLandscape(): boolean {
  const last = useRef<{ landscape: boolean; width: number } | null>(null)

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    const landscape = window.matchMedia(LANDSCAPE).matches
    const width = window.innerWidth
    const prev = last.current
    if (
      prev &&
      landscape !== prev.landscape &&
      width === prev.width &&
      raisesKeyboard(document.activeElement)
    ) {
      return prev.landscape
    }
    last.current = { landscape, width }
    return landscape
  }, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
