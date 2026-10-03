/** Small wording helpers shared by the generated reports. */

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
export const listAnd = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`)
/** "Sengkang GRC" → "sengkang", for comparing names across types */
export const stripType = (n: string) => n.replace(/ (GRC|SMC)$/i, '').trim().toLowerCase()

/** "YIO CHU KANG WEST" → "Yio Chu Kang West" */
export const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-/(])(\w)/g, (m) => m.toUpperCase())

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty']
/** Numbers up to twenty in words, as official documents write them; larger ones as figures. */
export const numberWord = (n: number) => WORDS[n] ?? fmtInt(n)
export const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const fmtInt = (v: number) => Math.round(v).toLocaleString('en-SG')
/** "about 28,400": rounded to the nearest hundred, the way boundary reports quote elector counts */
export const about = (v: number) => `about ${fmtInt(Math.round(v / 100) * 100)}`

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** "3 October 2026" */
export const longDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
