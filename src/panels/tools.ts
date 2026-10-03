import { Eraser, Hand, Lasso, MousePointer2, PaintBucket, Paintbrush, type LucideIcon } from 'lucide-react'
import type { Tool } from '../state/store'

/** The map drawing tools, shared by the Draw panel and the phone toolbar. */
export const TOOLS: { id: Tool; label: string; key: string; icon: LucideIcon; hint: string }[] = [
  { id: 'inspect', label: 'Select', key: 'V', icon: MousePointer2, hint: 'Click an area to select its constituency' },
  { id: 'paint', label: 'Paint', key: 'B', icon: Paintbrush, hint: 'Click or drag over areas to add them to the active constituency' },
  { id: 'fill', label: 'Fill', key: 'G', icon: PaintBucket, hint: 'Click an area: it and every connected area of the same constituency join the active one' },
  { id: 'lasso', label: 'Lasso', key: 'L', icon: Lasso, hint: 'Drag a freehand loop; every area inside joins the active constituency' },
  { id: 'erase', label: 'Erase', key: 'E', icon: Eraser, hint: 'Click or drag to remove areas from their constituency' },
  { id: 'pan', label: 'Pan', key: 'H', icon: Hand, hint: 'Drag to move the map (or hold Space with any tool)' },
]
