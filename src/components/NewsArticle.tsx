import { useEffect, useMemo, useState } from 'react'
import { ImageIcon, Newspaper, Sparkles, X } from 'lucide-react'
import { useStore } from '../state/store'
import { useDerived } from '../state/derived'
import { useNight } from '../state/night'
import { useNightReport } from './ElectionReport'
import { Hemicycle } from './Hemicycle'
import { buildNewsArticle, type NewsArticle as Article, type NewsLang } from '../model/news'
import { pollinationsUrl, type NewsImage } from '../model/newsImages'
import { useAiImages } from '../lib/aiImages'

const IMAGES_KEY = 'sg-election-sim:news-images'

const NOTICE: Record<NewsLang, string> = {
  en: 'Mock article · Simulation · Not real news',
  zh: '模拟报道 · 非真实新闻',
}
const DISCLAIMER: Record<NewsLang, string> = {
  en: 'This is a mock news article written automatically by the GE2030 Simulator from one user\'s simulated election, for entertainment and learning. It is not real news. It was not written, published or endorsed by The Straits Times, Lianhe Zaobao, SPH Media or any news organisation, and it does not represent any real-life polling, survey or official projection. Pictures are AI-generated illustrations, not photographs of real events or people.',
  zh: '本文由“GE2030模拟器”根据一名用户的模拟选举自动生成，仅供娱乐和学习，并非真实新闻，也不是《联合早报》、《海峡时报》、新报业媒体或任何新闻机构撰写、出版或认可的内容，更不代表任何真实民调、调查或官方预测。文中图片均为AI生成的插图，并非真实事件或人物的照片。',
}
const AI_LABEL: Record<NewsLang, string> = { en: 'AI-generated image', zh: 'AI生成图片' }

/** Mock newspaper write-up of the night (English or Mandarin). View-only, like the mock EBRC report. */
export function NewsArticle() {
  const lang = useNight((s) => s.newsOpen)
  const result = useNight((s) => s.result)
  if (!lang || !result) return null
  return <NewsDialog lang={lang} />
}

function NewsDialog({ lang }: { lang: NewsLang }) {
  const night = useNight()
  const { stats, partyMap } = useDerived()
  const swings = useStore((s) => s.swings)
  const useLeaders = useStore((s) => s.useLeaders)
  const report = useNightReport()
  const close = () => night.setNewsOpen(null)
  // polling day is "today": the article is dated the morning after
  const [date] = useState(() => new Date())
  const [images, setImages] = useState(() => { try { return localStorage.getItem(IMAGES_KEY) === '1' } catch { return false } })
  const allowImages = (v: boolean) => {
    setImages(v)
    try { localStorage.setItem(IMAGES_KEY, v ? '1' : '0') } catch { /* ignore */ }
  }

  const article = useMemo(() => buildNewsArticle({
    report, events: night.events, swings, stats, partyMap, useLeaders, seed: night.seed, date,
  }, lang), [report, night.events, swings, stats, partyMap, useLeaders, night.seed, date, lang])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') useNight.getState().setNewsOpen(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-slate-950/95" role="dialog" aria-label={lang === 'zh' ? '模拟联合早报报道' : 'Mock Straits Times article'}>
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2">
        <Newspaper size={18} className="shrink-0 text-amber-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold">{lang === 'zh' ? '模拟新闻报道' : 'Mock news article'}</div>
          <div className="truncate text-[11px] text-slate-400">Written from your simulated night · not real news</div>
        </div>
        <div className="flex overflow-hidden rounded-md border border-slate-700 text-xs" role="group" aria-label="Language">
          {(['en', 'zh'] as const).map((l) => (
            <button key={l} onClick={() => night.setNewsOpen(l)} aria-pressed={lang === l}
              className={`px-2.5 py-1 ${lang === l ? 'bg-slate-200 font-semibold text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}>
              {l === 'en' ? 'English' : '中文'}
            </button>
          ))}
        </div>
        <button onClick={close} className="p-1 text-slate-400 hover:text-white" aria-label="Close article"><X size={20} /></button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Paper a={article} images={images} allowImages={allowImages} seed={night.seed} />
        <div className="news-print-note">The mock news article is view-only and cannot be printed. {DISCLAIMER.en}</div>
      </div>
    </div>
  )
}

function Paper({ a, images, allowImages, seed }: { a: Article; images: boolean; allowImages: (v: boolean) => void; seed: number }) {
  const night = useNight()
  const { partyMap } = useDerived()
  const lang = a.lang
  const zh = lang === 'zh'
  const img = (slot: NewsImage['slot']) => a.images.find((i) => i.slot === slot)
  const seats = night.result!.seatsByParty
  const total = night.plan!.reduce((n, c) => n + c.seats, 0)
  const [lede, campaign, analysis, next] = a.sections
  // one URL per picture, in reading order, so the queue fills the page from the top
  const urls = useMemo(() => {
    const order: NewsImage['slot'][] = ['hero', 'count', 'campaign', 'voters']
    const out: Partial<Record<NewsImage['slot'], string>> = {}
    order.forEach((slot, i) => {
      const im = a.images.find((x) => x.slot === slot)
      if (im) out[slot] = pollinationsUrl(im.prompt, seed + i, 1024, 512)
    })
    return out
  }, [a.images, seed])
  const request = useAiImages((s) => s.request)
  useEffect(() => {
    if (images) request(Object.values(urls))
  }, [images, urls, request])
  const url = (slot: NewsImage['slot']) => (images ? urls[slot] ?? null : null)

  return (
    <article lang={zh ? 'zh-Hans' : 'en-SG'} className={`news-paper ${zh ? 'zh' : ''} mx-auto my-6 max-w-[960px] px-10 pb-10 pt-4 shadow-2xl phone:my-0 phone:px-4`}>
      <div className="-mx-10 mb-4 bg-amber-300 px-4 py-1 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-amber-950 phone:-mx-4">{NOTICE[lang]}</div>

      {/* masthead */}
      <header className="border-b-4 border-double border-neutral-800 pb-2 text-center">
        <div className="flex items-end justify-between gap-2 text-[11px] text-neutral-600 phone:flex-col phone:items-center">
          <span>{a.dateline}</span>
          <span className="phone:hidden">{zh ? '模拟版' : 'SIMULATED EDITION'}</span>
        </div>
        <div className="news-masthead mt-1 text-[56px] leading-none phone:text-[34px]">{a.masthead}</div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-neutral-500">{zh ? '模拟 · 非真实报章' : 'A simulation · not the real newspaper'}</div>
      </header>

      <div className="mt-4 text-[12px] font-bold uppercase tracking-wider text-rose-700">{a.kicker}</div>
      <h1 className={`mt-1 font-bold leading-tight text-neutral-900 ${zh ? 'text-[34px] phone:text-[24px]' : 'text-[40px] phone:text-[26px]'}`}>{a.headline}</h1>
      <p className={`mt-3 text-neutral-700 ${zh ? 'text-[18px]' : 'text-[19px] italic'} phone:text-[16px]`}>{a.standfirst}</p>
      <div className="mt-3 border-y border-neutral-300 py-1.5 text-[12px] text-neutral-600">{a.byline}</div>

      {!images && <ImageOptIn lang={lang} onAllow={() => allowImages(true)} />}
      <Picture image={img('hero')} lang={lang} url={url('hero')} large />

      <div className="news-body mt-5 text-[16.5px] leading-[1.65] phone:text-[15.5px]">
        <div className="news-cols news-dropcap">{lede.paras.map((p, i) => <p key={i}>{p}</p>)}</div>

        {/* results graphic: real numbers, not AI */}
        <div className="my-6 grid gap-4 rounded-sm border border-neutral-300 bg-white p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="flex flex-col items-center justify-center rounded bg-slate-900 p-3">
            <Hemicycle seats={seats} total={total} parties={partyMap} ncmp={night.result!.ncmp} width={320} government={night.coalition ?? undefined} />
            <div className="mt-1 text-[11px] text-slate-400">{zh ? '新一届国会议席分布' : 'The new Parliament'}</div>
          </div>
          <div>
            <div className="text-[13px] font-bold uppercase tracking-wider text-neutral-700">{a.tableTitle}</div>
            <table className="mt-1 w-full border-collapse text-[13px] tabular">
              <thead>
                <tr className="border-b-2 border-neutral-800 text-left">
                  <th className="py-1 font-semibold">{a.tableHead[0]}</th>
                  <th className="py-1 text-right font-semibold">{a.tableHead[1]}</th>
                  <th className="py-1 text-right font-semibold">{a.tableHead[2]}</th>
                  <th className="py-1 text-right font-semibold">{a.tableHead[3]}</th>
                </tr>
              </thead>
              <tbody>
                {a.table.map((r) => (
                  <tr key={r.party} className="border-b border-neutral-200">
                    <td className="py-1"><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: partyMap[r.party]?.color }} />{r.name}</td>
                    <td className="py-1 text-right font-semibold">{r.seats}</td>
                    <td className="py-1 text-right">{(r.share * 100).toFixed(1)}%</td>
                    <td className={`py-1 text-right ${r.change === null ? 'text-neutral-400' : r.change >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {r.change === null ? '—' : `${r.change >= 0 ? '+' : '−'}${Math.abs(r.change).toFixed(1)}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 border-t-2 border-neutral-800 pt-2 text-[13px] font-bold uppercase tracking-wider text-neutral-700">{a.factbox.title}</div>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
              {a.factbox.rows.map((r) => [
                <dt key={`${r.label}-l`} className="text-neutral-600">{r.label}</dt>,
                <dd key={`${r.label}-v`} className="m-0 text-right font-semibold">{r.value}</dd>,
              ])}
            </dl>
          </div>
        </div>

        <Picture image={img('count')} lang={lang} url={url('count')} />
        <Section heading={campaign.heading} paras={campaign.paras} />
        <Picture image={img('campaign')} lang={lang} url={url('campaign')} />
        <Section heading={analysis.heading} paras={analysis.paras} />
        <Picture image={img('voters')} lang={lang} url={url('voters')} />
        <Section heading={next.heading} paras={next.paras} />
      </div>

      <footer className="mt-8 border-t-2 border-neutral-800 pt-3 text-[12px] leading-snug text-neutral-600">
        <p className="m-0">{DISCLAIMER[lang]}</p>
        {zh && <p className="m-0 mt-2" lang="en">{DISCLAIMER.en}</p>}
        {images && (
          <button onClick={() => allowImages(false)} className="mt-2 text-[11px] text-neutral-500 underline underline-offset-2 hover:text-neutral-800">
            {zh ? '停用AI图片' : 'Turn off AI images'}
          </button>
        )}
      </footer>
    </article>
  )
}

function Section({ heading, paras }: { heading?: string; paras: string[] }) {
  return (
    <section className="mt-6">
      {heading && <h2 className="mb-2 border-t border-neutral-800 pt-2 text-[20px] font-bold text-neutral-900">{heading}</h2>}
      <div className="news-cols">{paras.map((p, i) => <p key={i}>{p}</p>)}</div>
    </section>
  )
}

function ImageOptIn({ lang, onAllow }: { lang: NewsLang; onAllow: () => void }) {
  return (
    <div className="mt-4 flex items-start gap-3 rounded-sm border border-dashed border-neutral-400 bg-white/70 p-3 font-sans text-[13px] text-neutral-700 phone:flex-col">
      <ImageIcon size={18} className="mt-0.5 shrink-0 text-neutral-500" aria-hidden />
      <div className="flex-1">
        <b>{lang === 'zh' ? '为报道生成AI图片？' : 'Add AI-generated pictures?'}</b>{' '}
        {lang === 'zh'
          ? '这会把简短的场景描述（不含任何个人资料）发送到免费的第三方图片服务 Pollinations.ai。图片由AI生成，并非真实照片。'
          : 'This sends short scene descriptions (no personal data) to Pollinations.ai, a free third-party image service. The pictures are made by AI and are not real photos.'}
      </div>
      <button onClick={onAllow} className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-neutral-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-neutral-700">
        <Sparkles size={14} aria-hidden /> {lang === 'zh' ? '生成AI图片' : 'Generate AI images'}
      </button>
    </div>
  )
}

/** An AI picture once the user has allowed it; a drawn placeholder before that or if it fails to load. */
function Picture({ image, lang, url, large }: { image?: NewsImage; lang: NewsLang; url: string | null; large?: boolean }) {
  const entry = useAiImages((s) => (url ? s.byUrl[url] : undefined))
  const retry = useAiImages((s) => s.retry)
  if (!image) return null
  const zh = lang === 'zh'
  const ok = entry?.state === 'ok' && entry.src
  const waiting = entry?.state === 'queued' || entry?.state === 'loading'
  return (
    <figure className={`m-0 ${large ? 'mt-4' : 'my-6'}`}>
      <div className="relative aspect-[2/1] w-full overflow-hidden bg-neutral-200">
        <Placeholder color={image.color} slot={image.slot} />
        {waiting && <div className="news-shimmer absolute inset-0 opacity-60" aria-hidden />}
        {waiting && (
          <span className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded bg-black/60 px-2 py-1 font-sans text-[11px] text-white">
            {entry?.state === 'loading' ? (zh ? '正在生成AI图片…' : 'Generating AI picture…') : (zh ? '排队中：免费服务每次只能生成一张图片' : 'Queued: the free service makes one picture at a time')}
          </span>
        )}
        {entry?.state === 'error' && url && (
          <button onClick={() => retry([url])} className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded bg-black/70 px-2 py-1 font-sans text-[11px] text-white hover:bg-black/90">
            {zh ? '图片服务繁忙，点击重试' : 'The free image service is busy. Try again'}
          </button>
        )}
        {ok && <img src={entry.src} alt={image.caption[lang]} referrerPolicy="no-referrer" className="news-in absolute inset-0 h-full w-full object-cover" />}
        {ok && <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 font-sans text-[10px] text-white">{AI_LABEL[lang]}</span>}
      </div>
      <figcaption className="mt-1.5 text-[12.5px] leading-snug text-neutral-600">
        {image.caption[lang]} <span className="text-neutral-400">{ok ? `(${AI_LABEL[lang]})` : zh ? '（示意图）' : '(Illustration)'}</span>
      </figcaption>
    </figure>
  )
}

/** Simple drawn scene: HDB blocks against a sky in the story's colour. */
function Placeholder({ color, slot }: { color: string; slot: NewsImage['slot'] }) {
  const blocks = [[40, 70], [110, 95], [190, 60], [270, 105], [350, 80], [430, 100], [510, 65], [590, 90], [670, 75], [750, 100]]
  return (
    <svg viewBox="0 0 800 400" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={`sky-${slot}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.85" />
          <stop offset="1" stopColor="#0f172a" stopOpacity="0.95" />
        </linearGradient>
      </defs>
      <rect width="800" height="400" fill={`url(#sky-${slot})`} />
      {blocks.map(([x, h], i) => (
        <g key={i}>
          <rect x={x} y={400 - h * 2.4} width="62" height={h * 2.4} fill="#0b1220" opacity="0.85" />
          {Array.from({ length: Math.floor(h / 9) }, (_, r) => (
            <rect key={r} x={x + 8} y={400 - h * 2.4 + 10 + r * 21} width="46" height="6" fill="#fde68a" opacity={((i + r) % 3) ? 0.35 : 0.7} />
          ))}
        </g>
      ))}
    </svg>
  )
}
