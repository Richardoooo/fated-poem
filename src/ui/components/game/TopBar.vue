<script setup lang="ts">
import { useUIStore } from '../../stores/ui-store'
import { useGameStore } from '../../stores/game-store'

const ui = useUIStore()
const game = useGameStore()
</script>

<template>
  <div class="top-bar">
    <button class="top-btn" @click="ui.navigate('home')" title="回到首页">
      ← 首页
    </button>
    <button class="top-btn" @click="game.toggleFullscreen()" title="全屏">
      {{ game.fullscreenStatus ? '⛶ 退出' : '⛶ 全屏' }}
    </button>
  </div>
</template>

<style scoped>
.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 36px;
  padding: 0 8px;
  background: var(--theme-title-bar-bg);
  border-bottom: 1px solid var(--theme-card-border);
  flex-shrink: 0;
}
.top-btn {
  background: none;
  border: none;
  color: var(--theme-title-bar-icon);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 10px;
  border-radius: var(--theme-radius-sm, 4px);
  transition: background 150ms;
  font-family: inherit;
}
.top-btn:hover {
  background: var(--theme-title-bar-btn-hover);
}
</style>
