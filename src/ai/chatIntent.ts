export function wantsBrowserAction(message: string): boolean {
  return /\b(go to|take me|get me|find me|open|navigate|find (?:a|an|the)|show me|pull up|play|search for|look up)\b/i.test(
    message
  )
}

export function wantsArticleNavigation(message: string): boolean {
  return /\b(article|read about|news story|write-?up|piece about|story about|why (?:it|that|the|this).*(?:successful|success|won|popular))\b/i.test(
    message
  )
}
