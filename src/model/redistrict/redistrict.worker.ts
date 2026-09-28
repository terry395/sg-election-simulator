import { redistrict, type RedistrictOptions } from './index'
import type { Block, GE2025Data, Plan } from '../../types'

interface Job { job: number; blocks: Block[]; ge: GE2025Data; current: Plan; opts: RedistrictOptions }

self.onmessage = (e: MessageEvent<Job>) => {
  const { job, blocks, ge, current, opts } = e.data
  try {
    const result = redistrict(blocks, ge, current, opts, (fraction, label) => self.postMessage({ job, progress: { fraction, label } }))
    self.postMessage({ job, result })
  } catch (err) {
    self.postMessage({ job, error: String(err) })
  }
}
