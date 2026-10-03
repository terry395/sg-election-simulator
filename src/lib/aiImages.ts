import { create } from 'zustand'

/**
 * Loads AI pictures one at a time. Pollinations' free, keyless tier allows about one request every
 * 15 seconds per visitor and refuses extra ones (HTTP 402/429), so requests are queued and spaced
 * out, retried a couple of times, and each picture is fetched once and kept for the session.
 */

export type AiImageState = 'queued' | 'loading' | 'ok' | 'error'

interface AiImages {
  byUrl: Record<string, { state: AiImageState; src?: string }>
  /** add pictures to the queue (ones already loaded or waiting are skipped) */
  request: (urls: string[]) => void
  /** queue failed pictures again */
  retry: (urls: string[]) => void
}

const GAP_MS = 16_000
const RETRY_MS = 20_000
const ATTEMPTS = 3
const TIMEOUT_MS = 120_000

const queue: string[] = []
let running = false
let lastRequest = 0
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Preloads through an <img> rather than fetch(): the service refuses cross-origin fetches (they carry
 * an Origin header), while plain image requests work, and the response is cached as immutable, so the
 * page's own <img> with the same URL then comes straight from the browser cache.
 */
function fetchImage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.referrerPolicy = 'no-referrer'
    const timer = setTimeout(() => { img.src = ''; reject(new Error('timeout')) }, TIMEOUT_MS)
    img.onload = () => { clearTimeout(timer); resolve(url) }
    img.onerror = () => { clearTimeout(timer); reject(new Error('failed')) }
    img.src = url
  })
}

async function work() {
  if (running) return
  running = true
  const set = (url: string, v: { state: AiImageState; src?: string }) => useAiImages.setState((s) => ({ byUrl: { ...s.byUrl, [url]: v } }))
  while (queue.length) {
    const url = queue.shift()!
    set(url, { state: 'loading' })
    let src: string | null = null
    for (let i = 0; i < ATTEMPTS && !src; i++) {
      const wait = lastRequest + (i ? RETRY_MS : GAP_MS) - Date.now()
      if (wait > 0) await sleep(wait)
      lastRequest = Date.now()
      try { src = await fetchImage(url) } catch { /* try again */ }
    }
    set(url, src ? { state: 'ok', src } : { state: 'error' })
  }
  running = false
}

export const useAiImages = create<AiImages>((set, get) => ({
  byUrl: {},
  request: (urls) => {
    const fresh = urls.filter((u) => !get().byUrl[u] && !queue.includes(u))
    if (!fresh.length) return
    queue.push(...fresh)
    set((s) => ({ byUrl: { ...s.byUrl, ...Object.fromEntries(fresh.map((u) => [u, { state: 'queued' as const }])) } }))
    void work()
  },
  retry: (urls) => {
    const failed = urls.filter((u) => get().byUrl[u]?.state === 'error')
    if (!failed.length) return
    set((s) => {
      const byUrl = { ...s.byUrl }
      for (const u of failed) delete byUrl[u]
      return { byUrl }
    })
    get().request(failed)
  },
}))
