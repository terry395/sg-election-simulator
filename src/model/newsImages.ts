/**
 * Picture prompts for the mock news article. They describe generic scenes only: no real people,
 * no candidate names and no party logos, so the AI images can't be mistaken for real news photos
 * of real people.
 */

export type ImageSlot = 'hero' | 'campaign' | 'voters' | 'count'

export interface NewsImage {
  slot: ImageSlot
  prompt: string
  caption: { en: string; zh: string }
  /** colour for the drawn placeholder shown until (or instead of) the AI image */
  color: string
}

export type Mood = 'win' | 'upset' | 'hung'

const STYLE = 'documentary news photograph, natural light, realistic, no text, no logos, no recognisable public figures, Singapore'

/** Rough colour word for a hex colour, for the flags and T-shirts in the pictures. */
export function colourName(hex: string): string {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return 'white'
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max - min < 0.12) return l > 0.7 ? 'white' : l < 0.25 ? 'black' : 'grey'
  const d = max - min
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + 360) % 360
  const dark = l < 0.4 ? 'dark ' : l > 0.65 ? 'light ' : ''
  const name = h < 15 || h >= 345 ? 'red' : h < 40 ? 'orange' : h < 65 ? 'yellow' : h < 160 ? 'green' : h < 200 ? 'cyan' : h < 255 ? 'blue' : h < 290 ? 'purple' : 'magenta'
  return `${dark}${name}`
}

export function buildImages(opts: { mood: Mood; winnerColor: string; close: boolean }): NewsImage[] {
  const col = colourName(opts.winnerColor)
  const hero: NewsImage = opts.mood === 'hung'
    ? {
      slot: 'hero',
      prompt: `anxious crowd of supporters watching election results on a giant outdoor screen at night, mixed party colours, tense faces, wide shot, ${STYLE}`,
      caption: { en: 'Supporters watch the results come in as the count goes down to the wire.', zh: '支持者在计票进入白热化之际，紧盯大屏幕上的成绩。' },
      color: opts.winnerColor,
    }
    : {
      slot: 'hero',
      prompt: `jubilant supporters in ${col} T-shirts waving ${col} flags and cheering at a night-time election gathering outside a stadium, confetti in the air, wide shot, ${STYLE}`,
      caption: opts.mood === 'upset'
        ? { en: 'Supporters celebrate a historic result outside a counting-night gathering point.', zh: '支持者在点票夜集合地点外庆祝历史性成绩。' }
        : { en: 'Supporters cheer as results are announced on election night.', zh: '选举成绩揭晓时，支持者欢呼庆祝。' },
      color: opts.winnerColor,
    }
  const out: NewsImage[] = [
    hero,
    {
      slot: 'campaign',
      prompt: `evening election rally on an open field beside HDB public housing blocks, large crowd holding small flags, brightly lit stage in the distance, ${STYLE}`,
      caption: { en: 'Crowds turned out at rallies across the heartland during the nine-day campaign.', zh: '在为期九天的竞选期间，各地群众大会吸引大批民众出席。' },
      color: '#64748b',
    },
    {
      slot: 'voters',
      prompt: `Singaporean voters of different ages and races queueing patiently at a polling station in the void deck of an HDB block, morning, election officials at a table, ${STYLE}`,
      caption: { en: 'Voters queue at a polling station on Polling Day.', zh: '选民在投票日到投票站排队投票。' },
      color: '#0f766e',
    },
  ]
  if (opts.close) out.push({
    slot: 'count',
    prompt: `election officials counting paper ballots at long tables in a school hall counting centre at night, observers watching, ${STYLE}`,
    caption: { en: 'Ballots are counted at a counting centre late into the night.', zh: '点票中心工作人员连夜点算选票。' },
    color: '#475569',
  })
  return out
}

/** Pollinations.ai builds an image from the prompt in the URL; the seed keeps it stable for a given night. */
export function pollinationsUrl(prompt: string, seed: number, width = 1024, height = 576): string {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed % 1_000_000}&nologo=true`
}
