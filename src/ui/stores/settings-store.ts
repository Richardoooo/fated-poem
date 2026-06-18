/**
 * 设置持久化 Store — 通用 key-value 自动存 localStorage
 *
 * 用法：
 *   const s = useSettingsStore()
 *   s.settings.apiPool = [...]        // 写入 → 自动存
 *   s.settings.任意新字段 = 值         // 加新设置零改动
 *
 * 设计：一个 ref 装所有设置，deep watch 自动写 localStorage。
 */
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

// ===== 类型 =====

export interface ApiEntry {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  maskedKey: string
  model: string
  models: string[]
}

export interface PresetItem {
  id: string
  name: string
  description?: string
  mainPrompt?: string
  system_prompt?: string
  temperature?: string
  maxTokens?: string
  topP?: string
  freqPen?: string
  presPen?: string
  prompts?: { name: string; content: string; enabled: boolean; role: string }[]
}

// ===== 默认值 =====

const STORAGE_KEY = 'fated-poem-settings'

function getDefaults(): Record<string, any> {
  return {
    // API 池
    apiPool: [] as ApiEntry[],

    // Agent 配置
    activeAgent: null as string | null,
    agentModels: {} as Record<string, string>,
    agentWorldbookEnabled: {} as Record<string, boolean>,
    agentWorldbookIds: {} as Record<string, string[]>,
    agentPrompts: {} as Record<string, string>,
    agentPromptEdited: false,
    agentDirty: {} as Record<string, boolean>,

    // 预设系统 (ChatPreset)
    presets: [] as PresetItem[],
    activePresetId: '',

    // 剧情系统
    plotMode: 'off' as string,
    plotDuration: 5,
    plotDifficulty: 'dynamic' as string,
    plotAllowExternalNPC: true,
    plotGenres: ['combat', 'social'] as string[],
    plotCustomPref: '',

    // 记忆 & 缓存
    memoryRecallCount: 20,
    memoryCompressionThreshold: 100,
    memorySnapshotLimit: 30,
    memoryCacheStrategy: 'balanced' as string,
  }
}

// ===== Store =====

export const useSettingsStore = defineStore('settings', () => {
  // 从 localStorage 恢复
  let saved: Record<string, any> = {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) saved = JSON.parse(raw)
  } catch { /* 解析失败用默认值 */ }

  // 合并：已存值覆盖默认值（支持未来新增字段自动补默认值）
  const defaults = getDefaults()
  const merged = { ...defaults, ...saved }

  const settings = ref<Record<string, any>>(merged)

  // deep watch → 自动存
  watch(settings, (val) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(val))
    } catch { /* quota exceeded 等极端情况静默失败 */ }
  }, { deep: true })

  /** 手动触发存储（正常情况下不需要调用，deep watch 自动处理） */
  function saveNow() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value))
    } catch { /* 静默 */ }
  }

  /** 重置所有设置为默认值 */
  function resetAll() {
    settings.value = getDefaults()
    saveNow()
  }

  /** 获取浏览器存储用量 */
  async function getStorageUsage(): Promise<{ used: number; quota: number; pct: number } | null> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const est = await navigator.storage.estimate()
        const used = est.usage ?? 0
        const quota = est.quota ?? 0
        return { used, quota, pct: quota > 0 ? (used / quota) * 100 : 0 }
      }
    } catch { /* 浏览器不支持 */ }
    return null
  }

  return { settings, saveNow, resetAll, getStorageUsage }
})
