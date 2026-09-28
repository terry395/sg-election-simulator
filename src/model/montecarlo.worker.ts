import { monteCarlo, type McInput } from './montecarlo'

self.onmessage = (e: MessageEvent<McInput & { job: number }>) => {
  const out = monteCarlo(e.data)
  self.postMessage({ job: e.data.job, out })
}
