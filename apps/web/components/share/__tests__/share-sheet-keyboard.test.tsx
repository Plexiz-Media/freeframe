/**
 * Typing a comment on a share link in Chrome on an iPhone.
 *
 * Chrome on iOS shrinks the layout viewport when the keyboard opens, so the
 * portrait phone briefly matches `(orientation: landscape)`. The screen took
 * that as a rotation and swapped the bottom sheet for the side column, which
 * unmounted the textarea being typed in: the keyboard closed, the query flipped
 * back and the sheet returned at `peek`. Nobody could type a comment.
 *
 * Everything below the network and the viewport is real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { useReviewStore } from '@/stores/review-store'
import { ShareReviewScreen } from '../share-review-screen'

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

const LANDSCAPE = '(orientation: landscape)'
type Listener = (e: { matches: boolean }) => void
const listeners = new Set<Listener>()
let landscape = false

/** The query flips; `width` is the viewport width after the flip. */
function viewport(next: boolean, width: number) {
  landscape = next
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
  act(() => listeners.forEach((fn) => fn({ matches: next })))
}

beforeEach(() => {
  useReviewStore.getState().reset()
  listeners.clear()
  landscape = false
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 393 })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (url.includes('/share/tok/stream/a1')) {
      return respond(200, { name: 'Clip.mp4', asset_type: 'video', url: 'http://example.test/v1.mp4', version_id: 'v1' })
    }
    if (url.includes('/share/tok/assets/a1/versions')) {
      return respond(200, [{ id: 'v1', version_number: 1, processing_status: 'ready', created_at: '' }])
    }
    if (url.includes('/share/tok/comments')) return respond(200, [])
    return respond(404, {})
  }))
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  // A portrait phone: only the orientation query ever matches, and only when
  // a test flips it.
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query === LANDSCAPE && landscape
    },
    media: query, onchange: null,
    addEventListener: (_: string, fn: Listener) => { if (query === LANDSCAPE) listeners.add(fn) },
    removeEventListener: (_: string, fn: Listener) => listeners.delete(fn),
    addListener() {}, removeListener() {}, dispatchEvent: () => false,
  }))
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
})

async function focusCommentBox() {
  const view = render(
    <ShareReviewScreen
      token="tok" assetId="a1" assetName="Clip.mp4"
      permission="comment" allowDownload={false} showVersions={false}
    />,
  )
  await waitFor(() => expect(view.container.querySelector('video')).not.toBeNull(), { timeout: 3000 })
  fireEvent.click(screen.getByRole('button', { name: 'Open comments' }))
  const box = screen.getByPlaceholderText('Leave your comment...')
  act(() => box.focus())
  return box
}

describe('the comment box on a portrait phone', () => {
  it('stays mounted and focused when the keyboard makes the viewport wider than tall', async () => {
    const box = await focusCommentBox()

    viewport(true, 393)

    expect(box).toBeInTheDocument()
    expect(document.activeElement).toBe(box)
    expect(screen.getByTestId('mobile-comment-sheet').dataset.state).toBe('half')
  })

  it('keeps the sheet where it was once the keyboard closes', async () => {
    await focusCommentBox()

    viewport(true, 393)
    viewport(false, 393)

    expect(screen.getByTestId('mobile-comment-sheet').dataset.state).toBe('half')
  })

  it('still moves to the side column when the phone really turns', async () => {
    await focusCommentBox()

    viewport(true, 852)

    expect(screen.queryByTestId('mobile-comment-sheet')).toBeNull()
  })
})
