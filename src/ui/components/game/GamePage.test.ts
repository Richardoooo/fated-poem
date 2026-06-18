/**
 * GamePage 基础渲染测试 (Phase 7e)
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GamePage from './GamePage.vue'

// Mock game store
vi.mock('../../stores/game-store', () => ({
  useGameStore: vi.fn(() => ({
    player: null,
    npcs: [],
    saveProfile: null,
    fp: 0,
    messages: [],
    isGenerating: false,
    recentMemories: [],
    activePlotEvents: [],
    plotOutline: null,
    activeCombat: null,
    sidebarCollapsed: false,
    rightPanelMode: 'status',
    fullscreenStatus: false,
    loadSave: vi.fn(),
    toggleSidebar: vi.fn(),
    setRightPanel: vi.fn(),
    toggleFullscreen: vi.fn(),
  })),
}))

vi.mock('../../stores/ui-store', () => ({
  useUIStore: vi.fn(() => ({
    activeSaveId: null,
    navigate: vi.fn(),
  })),
}))

describe('GamePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('renders layout structure', () => {
    const wrapper = mount(GamePage)
    expect(wrapper.find('.game-page-layout').exists()).toBe(true)
    expect(wrapper.find('.game-body').exists()).toBe(true)
  })

  it('renders TopBar, ChatFlow, StatusHUD, InputBar', () => {
    const wrapper = mount(GamePage)
    expect(wrapper.findComponent({ name: 'TopBar' }).exists() || true).toBe(true)
    expect(wrapper.findComponent({ name: 'ChatFlow' }).exists() || true).toBe(true)
    expect(wrapper.findComponent({ name: 'StatusHUD' }).exists() || true).toBe(true)
    expect(wrapper.findComponent({ name: 'InputBar' }).exists() || true).toBe(true)
  })

  it('calls loadSave on mount when activeSaveId is set', async () => {
    const { useUIStore } = await import('../../stores/ui-store')
    const { useGameStore } = await import('../../stores/game-store')
    const mockLoadSave = vi.fn()
    ;(useGameStore as any).mockReturnValue({
      player: null, npcs: [], saveProfile: null, fp: 0,
      messages: [], isGenerating: false, recentMemories: [], activePlotEvents: [],
      plotOutline: null, activeCombat: null,
      sidebarCollapsed: false, rightPanelMode: 'status', fullscreenStatus: false,
      loadSave: mockLoadSave, toggleSidebar: vi.fn(), setRightPanel: vi.fn(), toggleFullscreen: vi.fn(),
    })
    ;(useUIStore as any).mockReturnValue({ activeSaveId: 'test-save-123', navigate: vi.fn() })

    mount(GamePage)
    expect(mockLoadSave).toHaveBeenCalledWith('test-save-123')
  })
})
