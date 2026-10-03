import { describe, expect, it } from 'vitest'
import { nearestSnap } from './sheet'

const snaps = { peek: 100, half: 400, full: 750 }

describe('nearestSnap', () => {
  it('settles on the closest point after a slow drag', () => {
    expect(nearestSnap(120, 0, snaps)).toBe('peek')
    expect(nearestSnap(300, 0.1, snaps)).toBe('half')
    expect(nearestSnap(620, -0.1, snaps)).toBe('full')
  })

  it('a flick moves one point in its direction', () => {
    expect(nearestSnap(130, 1.2, snaps)).toBe('half')
    expect(nearestSnap(420, 1.2, snaps)).toBe('full')
    expect(nearestSnap(700, -1.2, snaps)).toBe('half')
    expect(nearestSnap(380, -1.2, snaps)).toBe('peek')
  })

  it('a flick past the last point stays there', () => {
    expect(nearestSnap(750, 2, snaps)).toBe('full')
    expect(nearestSnap(100, -2, snaps)).toBe('peek')
  })
})
