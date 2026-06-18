<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useUIStore } from './stores/ui-store'
import { useThemeStore } from './stores/theme-store'
import ToastContainer from './components/shared/ToastContainer.vue'

const theme = useThemeStore()
const ui = useUIStore()

// 懒加载所有页面（和原来 router 一样的异步加载）
const HomePage = defineAsyncComponent(() => import('./components/home/HomePage.vue'))
const CreatePage = defineAsyncComponent(() => import('./components/create/CreatePage.vue'))
const GamePage = defineAsyncComponent(() => import('./components/game/GamePage.vue'))
const SettingsPage = defineAsyncComponent(() => import('./components/settings/SettingsPage.vue'))
const WorkshopPage = defineAsyncComponent(() => import('./components/workshop/WorkshopPage.vue'))

const viewComponent = computed(() => {
  switch (ui.currentView) {
    case 'create':   return CreatePage
    case 'game':     return GamePage
    case 'settings': return SettingsPage
    case 'workshop': return WorkshopPage
    default:         return HomePage
  }
})
</script>

<template>
  <div class="app-shell">
    <transition name="fade" mode="out-in">
      <component :is="viewComponent" :key="ui.currentView" />
    </transition>
    <ToastContainer />
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
  background: var(--theme-window-bg);
  color: var(--theme-text-primary);
  font-family: var(--theme-font-body);
  transition: background 0.3s ease, color 0.3s ease;
}
</style>
