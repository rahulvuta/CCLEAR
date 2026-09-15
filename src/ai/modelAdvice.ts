export type ModelAdvice = { name: string; reason: string; tested: boolean }

/**
 * Recommendation by installed memory. Only the 4B default has been measured on this project
 * (16 GB Apple Silicon); smaller options are offered honestly as untested.
 */
export function recommendModel(ramGB: number): ModelAdvice {
  if (ramGB >= 12) return { name: 'qwen3:4b', reason: 'Measured fast and accurate on 16 GB Macs.', tested: true }
  return {
    name: 'qwen3:1.7b',
    reason: 'Smaller and lighter for 8 GB Macs. Not yet benchmarked for CCLEAR, so summaries may be rougher.',
    tested: false
  }
}

export function hasModel(installed: string[], wanted: string): boolean {
  return installed.some((n) => n === wanted || n === `${wanted}:latest` || n.startsWith(`${wanted}:`) && !wanted.includes(':'))
}
