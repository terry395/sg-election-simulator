import { describe, expect, it } from 'vitest'
import { hemicycleLayout, seatColors } from './Hemicycle'
import { DEFAULT_PARTIES } from '../data/parties'

describe('hemicycle', () => {
  for (const n of [20, 32, 97, 101, 150]) {
    it(`lays out exactly ${n} distinct, non-overlapping seats`, () => {
      const { seats, dotR } = hemicycleLayout(n)
      expect(seats.length).toBe(n)
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        expect(Math.hypot(seats[i].x - seats[j].x, seats[i].y - seats[j].y)).toBeGreaterThan(dotR * 2 * 0.99)
      }
      for (let i = 1; i < n; i++) expect(seats[i].angle).toBeLessThanOrEqual(seats[i - 1].angle)
      for (const s of seats) expect(s.y).toBeGreaterThanOrEqual(-1e-9)
    })
  }
  it('puts the government left, undeclared in the middle, opposition right', () => {
    const parties = Object.fromEntries(DEFAULT_PARTIES.map((p) => [p.id, p]))
    const c = seatColors({ PAP: 5, WP: 3, PSP: 1 }, 12, parties)
    expect(c.map((x) => x.party)).toEqual(['PAP', 'PAP', 'PAP', 'PAP', 'PAP', null, null, null, 'PSP', 'WP', 'WP', 'WP'])
  })
  it('groups a coalition government on the left', () => {
    const parties = Object.fromEntries(DEFAULT_PARTIES.map((p) => [p.id, p]))
    const c = seatColors({ PAP: 4, WP: 3, PSP: 2, SDP: 1 }, 10, parties, ['PSP', 'WP'])
    expect(c.map((x) => x.party)).toEqual(['WP', 'WP', 'WP', 'PSP', 'PSP', 'SDP', 'PAP', 'PAP', 'PAP', 'PAP'])
  })
})
