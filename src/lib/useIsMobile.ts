import { useSyncExternalStore } from 'react'

/** Same query as the `phone:` Tailwind variant: narrow screens, and phones held sideways. */
const QUERY = '(max-width: 767px), (max-height: 500px) and (pointer: coarse)'

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const get = () => window.matchMedia(QUERY).matches

export function useIsMobile() {
  return useSyncExternalStore(subscribe, get, () => false)
}
