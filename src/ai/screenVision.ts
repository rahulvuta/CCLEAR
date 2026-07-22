import { isWeatherQuery } from './webLookup'

const EXPLICIT_VISION_RE =
  /\b(on (my|the) screen|what do you see|look at (this|my|the)|on this page|what(?:'s| is) shown|what is this|read this|in the screenshot|what(?:'s| is) on (my|the) (screen|page))\b/i
const VISUAL_UI_RE =
  /\b(button|image|chart|graph|error message|popup|price shown|what does this say|what does it say|logo|banner|menu|sidebar)\b/i
const DEICTIC_QUESTION_RE =
  /\b(what|where|which|how much|how many|who)\b.*\b(this|here|that|these|those)\b/i
const TIME_SENSITIVE_RE =
  /\b(today|tonight|latest|current|news|score|weather|forecast|stock price|exchange rate|20(2[4-9]|3\d))\b/i

export function needsScreenVision(message: string): boolean {
  const t = message.trim()
  if (!t) return false

  if (isWeatherQuery(t) && !EXPLICIT_VISION_RE.test(t)) return false
  if (TIME_SENSITIVE_RE.test(t) && !EXPLICIT_VISION_RE.test(t) && !VISUAL_UI_RE.test(t)) return false

  if (EXPLICIT_VISION_RE.test(t)) return true
  if (VISUAL_UI_RE.test(t)) return true
  if (DEICTIC_QUESTION_RE.test(t)) return true

  return false
}
