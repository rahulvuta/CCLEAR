export const MARK_COLORS = {
  yellow: 'rgba(250, 204, 21, .42)',
  mint: 'rgba(74, 222, 128, .34)',
  blue: 'rgba(96, 165, 250, .36)',
  pink: 'rgba(244, 114, 182, .34)',
  violet: 'rgba(167, 139, 250, .38)'
} as const

export type MarkColor = keyof typeof MARK_COLORS
export const MARK_COLOR_NAMES = Object.keys(MARK_COLORS) as MarkColor[]

export function markColor(raw: string | null | undefined): MarkColor {
  return raw && Object.hasOwn(MARK_COLORS, raw) ? raw as MarkColor : 'yellow'
}

export function requestedMarkColor(text: string): MarkColor | undefined {
  const match = text.match(/\b(?:in|with|using)\s+(?:a\s+)?(yellow|mint|green|blue|pink|violet|purple)\b/i)
  if (!match) return undefined
  const color = match[1].toLowerCase()
  return color === 'green' ? 'mint' : color === 'purple' ? 'violet' : markColor(color)
}
