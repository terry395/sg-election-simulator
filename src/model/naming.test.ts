import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { Block, GE2025Data } from '../types'
import { CONSTITUENCY_PALETTE } from '../data/parties'
import { ge2025Plan } from './stats'
import { uniqueNames } from './naming'
import { redistrict, DEFAULT_OPTIONS, type RedistrictOptions } from './redistrict'

const dir = path.join(__dirname, '../../public/data')
const blocks: Block[] = JSON.parse(fs.readFileSync(path.join(dir, 'blocks.json'), 'utf8'))
const ge: GE2025Data = JSON.parse(fs.readFileSync(path.join(dir, 'ge2025.json'), 'utf8'))
const ge25 = ge2025Plan(blocks, ge, CONSTITUENCY_PALETTE)

function expectGoodNames(names: string[]) {
  expect(new Set(names).size, names.join(', ')).toBe(names.length)
  for (const n of names) {
    expect(n.trim().length).toBeGreaterThan(0)
    expect(n, n).not.toMatch(/\d/)
  }
}

describe('uniqueNames', () => {
  it('renames every clashing seat, never with numbers', () => {
    // three seats that would all be called "Punggol"
    const punggol = blocks.filter((b) => b.pa === 'PUNGGOL' && b.e25 > 0).sort((a, b) => a.c[0] - b.c[0])
    const third = Math.ceil(punggol.length / 3)
    const groups = [0, 1, 2].map((k) => punggol.slice(k * third, (k + 1) * third).map((b) => b.id))
    const names = uniqueNames(groups.map((members) => ({ members })), blocks)
    console.log('punggol split:', names)
    expectGoodNames(names)
    expect(names.every((n) => n !== 'Punggol')).toBe(true)
  })

  it('keeps locked names and steers others away from them', () => {
    const tampines = blocks.filter((b) => b.pa === 'TAMPINES' && b.e25 > 0).map((b) => b.id)
    const names = uniqueNames([{ members: tampines.slice(0, 5), preferred: 'Tampines', locked: true }, { members: tampines.slice(5, 10) }], blocks)
    expect(names[0]).toBe('Tampines')
    expectGoodNames(names)
  })
})

describe('auto-draw names', () => {
  const cases: [string, Partial<RedistrictOptions>][] = [
    ['compact', { method: 'compact', seed: 3 }],
    ['compact-4s', { method: 'compact', grcSize: 4, smcCount: 20, seed: 11 }],
    ['all-smc', { method: 'custom', smcCount: 97, grcCounts: { 3: 0, 4: 0, 5: 0, 6: 0 }, maxDeviation: 0.15, seed: 2 }],
    ['all-smc-b', { method: 'custom', smcCount: 97, grcCounts: { 3: 0, 4: 0, 5: 0, 6: 0 }, maxDeviation: 0.15, seed: 9 }],
    ['gerry', { method: 'gerrymander', goal: 'opposition', maxDeviation: 0.15, seed: 5 }],
    ['ebrc-2030', { method: 'ebrc', year: 2030, totalSeats: 101, smcCount: 20, maxDeviation: 0.15, seed: 1 }],
    ['ebrc-rename', { method: 'ebrc', keepNames: false, totalSeats: 97, smcCount: 18, maxDeviation: 0.15, seed: 4 }],
  ]
  for (const [label, o] of cases) {
    it(`${label}: unique, no numbers`, () => {
      const r = redistrict(blocks, ge, ge25, { ...DEFAULT_OPTIONS, ...o })
      const names = r.plan.constituencies.map((c) => c.name)
      if (label.startsWith('all-smc')) console.log(label, names.join(' | '))
      expectGoodNames(names)
    }, 30000)
  }
})
