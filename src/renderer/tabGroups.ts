export const GROUP_COLORS = ['blue', 'violet', 'teal', 'amber', 'rose', 'slate'] as const
export type GroupColor = typeof GROUP_COLORS[number]
export type GroupMeta = { color: GroupColor; collapsed: boolean }
export type GroupMap = Record<string, GroupMeta>

export function nextGroupName(names: string[]): string {
  const taken = new Set(names.map((name) => name.toLocaleLowerCase()))
  for (let n = 1; ; n++) {
    const name = `Group ${n}`
    if (!taken.has(name.toLocaleLowerCase())) return name
  }
}

export function cleanGroupName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 32)
}

export function moveIntoGroup<T extends { id: string; group?: string }>(tabs: T[], id: string, group: string): T[] {
  const moving = tabs.find((tab) => tab.id === id)
  if (!moving) return tabs
  const rest = tabs.filter((tab) => tab.id !== id)
  let lastIndex = -1
  for (let index = 0; index < rest.length; index++) {
    if (rest[index].group === group) lastIndex = index
  }
  const originalIndex = tabs.findIndex((tab) => tab.id === id)
  const insertAt = lastIndex < 0 ? Math.min(originalIndex, rest.length) : lastIndex + 1
  rest.splice(insertAt, 0, { ...moving, group })
  return rest
}

export function moveBeforeTab<T extends { id: string; group?: string }>(tabs: T[], id: string, beforeId: string): T[] {
  if (id === beforeId) return tabs
  const moving = tabs.find((tab) => tab.id === id)
  const target = tabs.find((tab) => tab.id === beforeId)
  if (!moving || !target) return tabs
  const rest = tabs.filter((tab) => tab.id !== id)
  const insertAt = rest.findIndex((tab) => tab.id === beforeId)
  rest.splice(insertAt, 0, { ...moving, group: target.group })
  return rest
}

export function loadGroupMap(raw: string | null): GroupMap {
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    const entries = Object.entries(value).filter(([name, meta]) => {
      if (!cleanGroupName(name) || name.length > 32 || !meta || typeof meta !== 'object') return false
      const item = meta as Partial<GroupMeta>
      return GROUP_COLORS.includes(item.color as GroupColor) && typeof item.collapsed === 'boolean'
    })
    return Object.fromEntries(entries.slice(0, 40)) as GroupMap
  } catch {
    return {}
  }
}
