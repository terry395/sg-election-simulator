import { ShieldCheck } from 'lucide-react'
import { DISCLAIMER_SHORT } from '../data/disclaimer'

/**
 * Persistent disclaimer strip at the bottom of the app. On phones each simulator places it
 * above its bottom tab bar, so the tabs stay at the screen edge within thumb reach.
 */
export function Footer({ className = '' }: { className?: string }) {
  return (
    <footer className={`flex shrink-0 items-center gap-1.5 border-t border-slate-800 bg-slate-950 px-4 py-1 text-[10px] text-slate-500 phone:px-3 phone:py-0.5 phone:text-[9px] phone:leading-tight ${className}`}>
      <ShieldCheck size={12} className="shrink-0" aria-hidden />
      <span>{DISCLAIMER_SHORT} Not affiliated with the Elections Department or any political party.</span>
    </footer>
  )
}
