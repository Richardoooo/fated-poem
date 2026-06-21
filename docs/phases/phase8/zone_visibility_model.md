# Phase 8: 变量区可见性模型 — 完整设计

> 为全部 11 个 Agent 定义 8 个 Variable Zone 的可见性矩阵 + 具体场景示例 + 注入格式
>
> 日期：2026-06-21 | 基于 `phase8_plan.md` 和现有代码审计

---

## 一、8 个 Variable Zone 定义

### 1.1 数据结构

每个 Zone 是三层自描述容器（对齐 phase8_plan.md §变量区数据结构设计）：

```typescript
interface VariableZone {
  config: ZoneConfig;              // 注入行为控制
  visibility: string[];            // Agent ID 可见白名单
  content: Record<string, any>;    // 纯字典，实际数据
}

interface ZoneConfig {
  orderBy?: string;       // 注入排序字段
  limit?: number;         // 注入截断上限
  injectAs?: 'json' | 'list' | 'table' | 'summary';
}
```

### 1.2 Zone 总览

| # | Zone ID | 内容 | 写入方 | 状态 |
|---|---------|------|--------|------|
| 1 | `memory` | 记忆条目 `{MEM0001: {content, keywords, importance, timeRange, ...}}` | `memory_summary` | ✅ Active |
| 2 | `npc` | 所有角色（含主角），`type` 区分 player/npc/monster/summon | `char_update`, `char_gen` | ✅ Active |
| 3 | `world` | 世界状态：时间/地点/天气/季节/月相/纪元 | `vars_update` | ✅ Active |
| 4 | `quest` | 剧情事件/任务：活跃/待触发/已完成/失败 | `plot_pre_check`, `plot_post_check` | ✅ Active |
| 5 | `craft` | 制作项目：锻造/炼金/烹饪/裁缝 | `craft_gen`, `vars_update` | ✅ Active |
| 6 | `combat` | 活跃战斗状态 | `combat-resolver` (引擎直写) | ✅ Active |
| 7 | `outline` | 剧情大纲 + 世界线状态 | `plot_outline`, `plot_post_check` | 🆕 Reserved |
| 8 | `variable` | 自由变量（旗标/计数）`{user: {...}, sys: {...}}` | `vars_update` | 🆕 空容器 |

### 1.3 可见性级别

| 级别 | 标识 | 含义 |
|------|------|------|
| **FULL** | ✅ | Agent 看到完整内容 |
| **SUMMARY** | 📋 | Agent 看到摘要/截断版本（字段白名单过滤 + 文本截断） |
| **KEYS** | 🔑 | Agent 仅看到 ID/名称/类型等索引信息 |
| **NONE** | ❌ | Agent 完全看不到此 Zone |

---

## 二、完整可见性矩阵（11 Agent × 8 Zone）

| Agent | memory | npc | world | quest | craft | combat | outline | variable |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **memory_recall** | ✅ FULL¹ | 🔑 KEYS | 🔑 KEYS² | 🔑 KEYS³ | ❌ | ❌ | ❌ | ❌ |
| **plot_pre_check** | 📋 SUMMARY⁴ | ✅ FULL | ✅ FULL | ✅ FULL | ❌ | ❌ | ✅ FULL | 🔑 KEYS⁵ |
| **story** | 📋 SUMMARY⁶ | 📋 SUMMARY⁷ | ✅ FULL | 📋 SUMMARY⁸ | 📋 SUMMARY⁹ | ✅ FULL | 📋 SUMMARY¹⁰ | ❌ |
| **vars_update** | ❌ | 🔑 KEYS¹¹ | ✅ FULL | ❌ | 🔑 KEYS | 🔑 KEYS | ❌ | ✅ FULL |
| **char_update** | ❌ | 混合¹² | ✅ FULL | ❌ | 🔑 KEYS | ✅ FULL¹³ | ❌ | ❌ |
| **memory_summary** | 📋 SUMMARY¹⁴ | 🔑 KEYS | 📋 SUMMARY¹⁵ | 🔑 KEYS | ❌ | 🔑 KEYS¹⁶ | ❌ | ❌ |
| **plot_post_check** | 📋 SUMMARY¹⁷ | 📋 SUMMARY¹⁸ | ✅ FULL | ✅ FULL | ❌ | 📋 SUMMARY¹⁹ | ✅ FULL²⁰ | ❌ |
| **plot_outline** | ❌ | ✅ FULL²¹ | ✅ FULL | 🔑 KEYS²² | ❌ | ❌ | ✅ FULL²³ | ❌ |
| **craft_gen** | ❌ | 📋 SUMMARY²⁴ | ✅ FULL | ❌ | ✅ FULL | ❌ | ❌ | 🔑 KEYS²⁵ |
| **char_gen** | ❌ | 🔑 KEYS²⁶ | ✅ FULL | ❌ | ❌ | ❌ | ❌ | 📋 SUMMARY²⁷ |
| **item_gen** | ❌ | 🔑 KEYS²⁸ | ✅ FULL | ❌ | ❌ | ❌ | ❌ | 🔑 KEYS²⁹ |

### 注解

1. **memory_recall → memory FULL**: 完整记忆正文 + keywords + importance + timeRange。**排除**: `hiddenLine`（引擎专用暗线）和 `embedding` 向量。
2. **memory_recall → world KEYS**: 仅 `{time, location}`，用于时间/空间邻近度过滤。
3. **memory_recall → quest KEYS**: 仅 `{id, title, status}`，用于任务相关记忆匹配。
4. **plot_pre_check → memory SUMMARY**: 仅 `{id, relevance, reason, importance}`，不含正文。
5. **plot_pre_check → variable KEYS**: 仅触发条件中引用的变量键（扫描 `{{...}}` 模式）。
6. **story → memory SUMMARY**: 全文注入但 **排除 hiddenLine**。记忆正文是叙事核心素材。
7. **story → npc SUMMARY**: 仅 name/type/tier/HP/MP/SP/location/currentAction/statusEffects(name+time)。**排除**: 五维/装备详情/技能详情/背包/登神长阶/money（防止全知叙事）。
8. **story → quest SUMMARY**: 仅 active 事件的 title + chapterGoal(100字) + status。**排除**: pending 事件、触发条件。
9. **story → craft SUMMARY**: 仅 completed/in_progress 项目的 product + quality + resultNarrative。
10. **story → outline SUMMARY**: ⚠️ **最关键屏蔽** — 仅当前章节 title + 100字 chapterGoal。**绝不**注入完整大纲。
11. **vars_update → npc KEYS**: 仅 id + name + type + location，用于构造变量路径引用。
12. **char_update → npc 混合**: 目标角色 FULL（需完整数据更新），其他角色 KEYS（仅 name/location/relationship 做上下文）。通过 `targetCharacterId` 实现 per-call 过滤。
13. **char_update → combat FULL**: 仅当目标角色在 participants 列表中时注入。
14. **memory_summary → memory SUMMARY**: 最近 5-10 条，content 截断到 200 字。用于去重判断。
15. **memory_summary → world SUMMARY**: `{time, location, weather, season}`。用于 timeRange 和叙事风味。
16. **memory_summary → combat KEYS**: 仅 `{participants, summary}`。用于 importance 校准（战斗 = 7-8 分起步）。
17. **plot_post_check → memory SUMMARY**: 最近 3 条，仅 id + importance + timeRange + 首句摘要。
18. **plot_post_check → npc SUMMARY**: 仅 name/type/tier/location/currentAction/HP变化方向/最新关系变化。
19. **plot_post_check → combat SUMMARY**: 仅 `{outcome, casualties, significantEvents[]}`。不含 8 步伤害管线。
20. **plot_post_check → outline FULL (读写)**: 读取完整大纲判断世界线偏差，`changeLevel >= moderate` 时修改大纲。
21. **plot_outline → npc FULL (设计视图)**: 完整 identity/background/personality/ascension。**排除运行时状态**: HP/MP/SP/statusEffects/inventory。
22. **plot_outline → quest KEYS+SUMMARY**: 扩写模式：现有章节标题+摘要。新建模式：空。
23. **plot_outline → outline 特殊**: 新建=NONE，扩写=FULL（当前大纲作为扩展锚点）。
24. **craft_gen → npc SUMMARY (制作者+材料提供者)**: 制作者 FULL + 材料提供者仅 name+providedMaterials。其他所有角色的五维/背包/技能全部屏蔽。
25. **craft_gen → variable KEYS**: 仅制作相关参考值：`{forgeQuality, workshopTier, materialScarcity, regionTechLevel}`。
26. **char_gen → npc KEYS**: 仅 `{id, name, race, type, tier}`，避免重名 + 判断关系。**屏蔽**所有现有角色的五维/背包，防止新 NPC 属性被污染。
27. **char_gen → variable SUMMARY**: 仅 faction_standing + region_state 子集，提供世界观一致性锚点。屏蔽 `user.*`。
28. **item_gen → npc KEYS**: 仅目标角色 `{id, name, race, tier, occupation}` + 其他角色 name 列表（避免签名装备冲突）。**主数据源**是 `agentOutputs['char_gen']`，非 npc zone。
29. **item_gen → variable KEYS**: 仅物品风格参考：`{regionStyle, faction, economyLevel, techLevel}`。

---

## 三、关键设计原则

### 3.1 防止全知叙事的三重屏蔽

| 屏蔽项 | 影响 Agent | 机制 |
|--------|-----------|------|
| **完整大纲** | story | 只给 100 字章节目标摘要 |
| **hiddenLine** | story, memory_recall, memory_summary | Zone 注入层统一剥离 |
| **角色五维/背包** | story | npc zone 降级到 SUMMARY |
| **未触发剧情** | story | quest zone 只给 active 事件 |

### 3.2 防止生成偏差的三重屏蔽

| 屏蔽项 | 影响 Agent | 机制 |
|--------|-----------|------|
| **大纲** | char_gen, item_gen, craft_gen | ❌ NONE — 防止"预知未来"导致 NPC/物品/效果生成带有剧情目的 |
| **记忆** | char_gen, item_gen, craft_gen, plot_outline | ❌ NONE — 防止历史事件驱动生成决策 |
| **其他角色详情** | char_gen, item_gen | 🔑 KEYS — 防止 NPC 属性互相污染 |

### 3.3 char_update 并行过滤（per-call 而非 per-agent）

char_update 在 Stage 3 对 N 个角色并行执行。不是"整个 Agent 看什么"，而是"**每次调用**看什么"：

```
调用 for "player":     player FULL + npc_001 KEYS + npc_002 KEYS
调用 for "npc_001":    npc_001 FULL + player KEYS + npc_002 KEYS
调用 for "npc_002":    npc_002 FULL + player KEYS + npc_001 KEYS
```

通过 `AgentContext.targetCharacterId` 实现 per-call 的 npc zone 过滤。

### 3.4 plot_pre_check 作为大纲守门人

`plot_pre_check` 是 **唯一** 能读到完整 `outline` zone 的常态 Agent。它充当守门人：
1. 读取完整大纲 → 判断哪些事件应触发
2. 提炼 ~100 字章节目标 → 注入 story Agent
3. story Agent **永远**看不到完整大纲

### 3.5 Marker 触发 Agent 的特殊注入

craft_gen / char_gen / item_gen 仅在检测到对应 XML 标记时触发，注入逻辑与常规 Agent 不同：

- **craft_gen**: 额外注入 `craft` zone 全量（历史项目，防效果重名）
- **char_gen**: `<char_detect>` 的 bodyText 作为核心输入（Story AI 对新角色的叙事描述）
- **item_gen**: **主数据源**是 `agentOutputs['char_gen']`（char_gen 完整 JSON），zone 仅为辅助

---

## 四、各 Agent 场景示例

### 4.1 memory_recall（Stage 0）

**场景：直接匹配 — 地点查询**

```
用户: "铁匠铺怎么走来着？上次那个委托完成了吗？"

输入 Zone:
  memory (FULL 60条): 含 MEM0001(白曜城地图, importance:7), MEM0002(铁匠委托, importance:8, keywords:["铁匠铺","委托","铁矿石"])
  npc (KEYS): [player 亚瑟, npc_003 铁匠老罗, npc_007 艾琳]
  world (KEYS): {time: "光辉纪元001年-05月-25日-10:00", location: "白曜城-五馆街"}
  quest (KEYS): [quest_001 铁匠的委托 | active]

输出:
{"memories": [
  {"id": "MEM0002", "relevance": 0.95, "reason": "铁匠委托直接匹配，用户正在询问委托完成情况"},
  {"id": "MEM0001", "relevance": 0.85, "reason": "白曜城地图信息包含铁匠铺位置"}
]}
```

**Embedding 路径**: 当 model 名含 "embedding" 时，不走 LLM，改为 `computeEmbedding(userInput)` → `cosineSimilarity()` → top-K 阈值过滤。输出格式相同。

### 4.2 plot_pre_check（Stage 0）

**场景：标准触发 — 进入铁匠铺**

```
用户: "我推开铁匠铺的门"

输入 Zone:
  quest (FULL): [evt_01 铁匠的请求 | pending | triggerCondition: "{{location}}包含'铁匠铺'"]
  outline (FULL): "第一章：与铁匠公会建立联系..."
  npc (FULL): player location=白曜城-市集 → 前往铁匠铺
  world (FULL): location=白曜城-市集

输出:
{"triggeredEvents": [
  {"id": "evt_01", "reason": "主角正进入铁匠铺——满足触发条件。当前章节大纲要求与铁匠公会建立联系。"}
],
"relevantBackground": "铁匠公会最近缺少矿石原料...完成此委托将解锁北境矿场的线索。",
"outlineRelevance": "第一章要求与铁匠公会建立联系，evt_01是通往后续章节的关键路径节点。"}
```

→ `relevantBackground` 作为 ~100 字摘要注入 story Agent 的 prompt。

### 4.3 story（Stage 1）

**场景：探索 → 进入铁匠铺**

```
用户: "我推开铁匠铺的门"

输入 Zone:
  memory (SUMMARY): MEM0003 铁匠委托 (importance:7), MEM0001 白曜城地理 (importance:5)
  npc (SUMMARY): player (HP 85/100, MP 40/50, location:市集, 待机中), npc_001 铁匠 (HP 120/120, location:铁匠铺, 锻造中)
  world (FULL): 时间:16:30, 天气:晴朗, 季节:春季
  quest (SUMMARY): quest_001 "铁匠的请求" active, chapterGoal: "与铁匠公会建立联系..."
  outline (SUMMARY): 第1章 "白曜城的新人冒险者", chapterGoal: "抵达白曜城，建立初步人脉"

输出:
<thinking>玩家进入铁匠铺，需要描述铁匠铺环境和铁匠的反应</thinking>
<maintext>你推开沉重的橡木门，热浪和金属撞击声扑面而来。
"哦，是你啊，"老铁匠咧嘴一笑，"上次说的那批铁矿石带来了吗？我这正缺材料呢。"
...</maintext>
<option>拿出铁矿石交给铁匠
询问最近城里的情况
看看墙上挂着的武器</option>
<sum>你进入铁匠铺，铁匠询问铁矿石的情况</sum>
<vars>{"位置": "北方-诺斯加德-白曜城-五馆街-铁匠铺"}</vars>
```

### 4.4 vars_update（Stage 2）

**场景：购物 + 移动**

```
story 输出: <maintext>你花50G从铁匠那里买了一把新的铁剑...</maintext>
            <vars>{"位置":"...铁匠铺"}</vars>

输入 Zone:
  npc (KEYS): player (位置:市集), npc_001 (老铁匠, 位置:铁匠铺)
  world (FULL): 时间:16:30, 位置:白曜城-市集, 天气:晴朗

输出:
{"replace": [{"path": "world.location", "value": "北方-诺斯加德-白曜城-五馆街-铁匠铺"}],
 "delta": [{"path": "char.player.money", "amount": -50}],
 "insert": [{"path": "char.player.inventory", "value": {"name": "铁剑", "type": "weapon", "quantity": 1}}],
 "delta_time": 30}
```

### 4.5 char_update（Stage 3，并行×N）

**场景：玩家受伤 + 吃药（target = player）**

```
story 输出: <maintext>地精的匕首划过了你的手臂(HP-12)...你取出治疗药水一饮而尽(HP+20)...</maintext>

输入 npc zone (混合):
  🎯 当前角色 (FULL): player - HP:85/200, 背包: 治疗药水×2, 状态效果: []
  👥 其他角色 (KEYS): npc_001 老铁匠 - 位置:铁匠铺, npc_002 艾琳 - 位置:北境森林

输出:
{"characters": [{"id": "player", "changes": {
  "hp": 93,
  "inventory": [{"action": "remove", "itemId": "item_potion_001", "quantity": 1}],
  "statusEffects": [{"action": "add", "effect": {"name": "轻微出血", "category": "减益", "remainingTime": 30}}]
}}]}
```

### 4.6 memory_summary（Stage 4）

**场景：常规任务完成**

```
story 输出: <maintext>你把10块铁矿石整齐地码在柜台上。铁匠满意地清点了一下，支付了50G报酬。
           "不过这矿石成色有点眼熟...你不会是从北境矿场那边弄来的吧？最近那边可不太平..."</maintext>

输入 Zone:
  memory (SUMMARY 最近5条): MEM0001, MEM0002(铁匠委托, importance:8), ...
  npc (KEYS): player 亚瑟, npc_003 铁匠老罗
  world (SUMMARY): 时间:光辉纪元001年-05月-24日-15:00, 地点:铁匠铺, 天气:晴, 季节:春
  quest (KEYS): quest_001 铁匠的委托 | active

输出:
{"content": "主角按照约定前往白曜城铁匠铺，将收集到的10块铁矿石交给了铁匠老罗...铁匠还警告主角北境矿场近期有山贼盘踞...",
 "hiddenLine": "铁匠委托完成，北境矿场山贼线索浮现，铁匠对主角信任+1",
 "keywords": ["铁匠铺", "委托完成", "铁矿石", "北境矿场", "山贼", "报酬"],
 "importance": 6,
 "timeRangeStart": "光辉纪元001年-05月-24日-15:00",
 "timeRangeEnd": "光辉纪元001年-05月-24日-15:30"}
```

### 4.7 plot_post_check（Stage 5）

**场景：世界线中等变动 — NPC 加入队伍**

```
story 输出: "'我会和你一起去，'艾琳说道，她把弓甩到肩上..."

输入 Zone:
  quest (FULL): evt_04 "调查矿场" active (原计划单人)
  npc (SUMMARY): 艾琳 type=npc, relationships: {"player_1": "盟友"}
  outline (FULL): "第一章...主角独自调查矿场。第二章：孤身深入..."
  combat (SUMMARY): null

输出:
{"worldLineChanged": true, "changeLevel": "moderate",
 "outlineChanges": {"action": "addChapter", "changes": "第二章从'孤身深入'改为'双人成行'。新增1.5章：与艾琳在矿场建立羁绊。"},
 "eventUpdates": [{"id": "evt_04", "action": "update", "changes": {"description": "与艾琳组队调查矿场（原为独自前往）"}}],
 "newChildEvents": [
   {"title": "艾琳的过去", "description": "在旅途中了解艾琳的背景", "triggerCondition": "旅途中或扎营时", "depth": 2},
   {"title": "协同作战", "description": "与艾琳并肩作战建立默契", "triggerCondition": "在矿场触发战斗遭遇", "depth": 2}
 ]}
```

### 4.8 plot_outline（按需）

**场景：新建主线大纲**

```
输入 Zone:
  npc (FULL 设计视图): player 凯恩 - 铁匠学徒 Lv.3 T1, 背景:"在边境锻造坊长大...渴望见识更广阔的世界"
  world (FULL): 纪元:光辉纪元001年, 区域:白曜城/诺斯加德联盟
  quest (KEYS): [] (新存档)
  Plot Config: mode=main, durationYears=2, genrePreference=["combat","mystery"]

输出:
{"content": "# 命定之诗：铁砧之火\n\n## 第一章：白曜城的铁匠学徒\n...",
 "chapters": [
   {"title": "白曜城的铁匠学徒", "summary": "介绍凯恩的日常生活...", "keyEvents": ["学徒委托","矿场干扰","发现遗迹入口"], "estimatedDuration": "2-3周"},
   {"title": "遗迹低语", "summary": "凯恩深入古代遗迹...", "keyEvents": ["遗迹一层探索","发现血统真相","Boss战"], "estimatedDuration": "3-4周"}
 ],
 "selfCritique": {"score": 7, "strengths": ["清晰的三幕式英雄之旅结构","很好地利用了锻造背景"], "weaknesses": ["中期情感驱动力不足"], "suggestions": ["引入竞争弧光——另一位年轻冒险者推动彼此成长"]}}
```

### 4.9 craft_gen（Stage 1 阻塞）

**场景：锻造长剑**

```
Trigger: <craft_request industry="锻造" product="长剑" targetQuality="普通" materials="铁矿石×5, 木炭×2"/>

输入 Zone:
  npc (SUMMARY 制作者+提供者): 凯恩 FULL (STR:12, 锻造Lv.4, 背包:铁矿石×5+木炭×2) + 老铁匠 KEYS (材料提供:无)
  world (FULL): 地点=铁匠铺, 天气=晴, 季节=夏, 设施=标准锻造台+淬火槽
  craft (FULL): 2个历史项目 — iron_bracers(普通,完成), refined_arrows(普通,完成)
  variable (KEYS): {forgeQuality:"standard", workshopTier:1}

输出:
{"difficultyJudgment": {"dcModifier": 0, "reasoning": "T2角色锻造普通品质，材料充足，无环境惩罚"},
 "creativeEffects": [
   {"name": "精铁刃", "description": "剑刃经过精细打磨，攻击力+10%", "type": "增益"},
   {"name": "平衡握柄", "description": "握柄配重精确调整，命中率+5%", "type": "增益"}
 ],
 "effectDeclarations": ["攻击力:+12", "命中率:+5%"],
 "narrativeFlavor": "你握紧铁锤，将烧红的铁块放在铁砧上。火星四溅，叮叮当当的锻打声回荡在铁匠铺中...一把闪烁着寒光的长剑逐渐成型。",
 "craftToolCall": {"industry": "锻造", "productName": "长剑", "targetQuality": "普通", "quantity": 1, "materials": ["铁矿石×3", "木炭×1"]}}
```

→ Code 执行 `$craft.startProject()` → 结果卡片注入历史 → auto-continue Story AI。

### 4.10 char_gen（Stage 2 异步）

**场景：酒馆遇见精灵巡林者**

```
Trigger: <char_detect characterName="艾琳" characterType="npc">
         一位银发的精灵少女走进酒馆。她背着长弓，腰间挂着箭袋，翠绿色的眼眸警觉而锐利...
         </char_detect>

输入 Zone:
  npc (KEYS): [player_001 | 凯恩 | Human | player | T2], [npc_001 | 老铁匠 | Human | npc | T1]
  world (FULL): 时间=光辉纪元001年-06月-20日-19:45, 地点=白曜城-酒馆, 季节=秋
  variable (SUMMARY): {诺斯加德联盟=友好, 翡翠之心=中立, 北境矿场=不稳定}

输出:
{"name": "艾琳", "race": "精灵", "tier": 2, "level": 8,
 "attributes": {"str":4,"dex":10,"con":5,"int":7,"spi":8},
 "identity": ["巡林者","北方游侠","翡翠之心使者"],
 "occupation": ["弓箭手","侦察兵"],
 "background": "艾琳出身于翡翠之心森林的银叶精灵部落...她正在追查一群与北境矿场山贼有关的走私者，专程来酒馆打探消息。",
 "appearance": "身材纤细但肌肉线条分明。银白色长发扎成高马尾。翠绿色眼眸中透着锐利...",
 "personality": "冷静果断，对陌生人保持礼貌的距离。观察力极强——进入酒馆第一件事就是扫视每个角落。",
 "ascension": {"enabled": false}}
```

→ 链式触发 item_gen → `assembleCharacterState()` → StateManager 写入。

### 4.11 item_gen（Stage 2 链式）

**场景：为精灵巡林者生成装备**

```
Primary Input (agentOutputs['char_gen']):
  {"name":"艾琳","race":"精灵","tier":2,"level":8,"attributes":{"str":4,"dex":10,...},"identity":["巡林者",...],...}

输入 Zone (辅助):
  npc (KEYS): 目标=艾琳(精灵,T2,弓箭手/侦察兵), 其他=[凯恩,老铁匠]
  world (FULL): 区域=白曜城/诺斯加德联盟, 季节=秋
  variable (KEYS): {regionStyle:"northern_pragmatic", faction:"诺斯加德联盟"}

输出:
{"skills": [
  {"name":"精准射击","description":"命中率+20%，造成120%伤害","type":"active","cost":{"type":"SP","amount":15},"cooldown":3},
  {"name":"自然感知","description":"被动提升环境感知，闪避率+10%","type":"passive"}
],
"equipment": [
  {"slot":"武器","name":"精灵长弓","description":"由翡翠之心精灵工匠用银月木打造...","stats":{"攻击力":18,"敏捷":2},"durability":120,"quality":"优良"},
  {"slot":"护甲","name":"巡林者皮甲","description":"深绿色轻量化皮甲...","stats":{"防御力":8,"敏捷":1},"durability":100,"quality":"普通"}
],
"inventory": [
  {"name":"白羽箭袋","description":"装有30支精制箭矢的箭袋","quantity":1,"type":"消耗品","rarity":"普通"},
  {"name":"草药包","description":"装有基础疗伤草药的布袋","quantity":3,"type":"消耗品","rarity":"普通"}
]}
```

---

## 五、注入格式示例

### 5.1 npc zone @ SUMMARY（story Agent）

```
## 👥 在场角色

┌──────────────────────────────────────────────────────────────┐
│ [你] 亚瑟 · 人类 · T2 中坚 · Lv.5                            │
│ HP: 85/200  MP: 40/125  SP: 30/125                           │
│ 位置: 北方-诺斯加德-白曜城-五馆街-铁匠铺                      │
│ 状态: 与铁匠交谈                                              │
│ 状态效果: 无                                                  │
├──────────────────────────────────────────────────────────────┤
│ [铁匠] 老铁匠 · 人类 · T1 普通                                │
│ HP: 120/120                                                  │
│ 位置: 北方-诺斯加德-白曜城-五馆街-铁匠铺                      │
│ 状态: 正在锻造                                                │
│ 状态效果: 轻微烧伤 (剩余 15 分钟)                              │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 npc zone @ KEYS（char_gen Agent）

```
=== 已有角色 (npc zone — KEYS only) ===

以下角色已存在于当前存档。新生成角色名必须与此列表无冲突。

| ID | Name | Race | Type | Tier |
|----|------|------|------|------|
| player_001 | 凯恩 | 人类 | player | T2 |
| npc_001 | 老铁匠 | 人类 | npc | T1 |

注意: 上述角色的五维/技能/装备/背包已被安全屏蔽。此列表仅用于重名检查和关系判断。
```

### 5.3 npc zone @ 混合（char_update Agent）

```
## 🎯 当前角色 (完整状态) — targetCharacterId = "player"

[player FULL CharacterState — 五维/装备/技能/背包/登神长阶 全部可见]

## 👥 其他角色 (索引)

npc_001 (老铁匠) — 人类 · T1 普通 — 位置: 白曜城-铁匠铺 — 关系: 友好
npc_002 (艾琳) — 精灵 · T2 中坚 — 位置: 北境森林 — 关系: 中立
```

### 5.4 outline zone @ SUMMARY（story Agent）

```
## 📚 剧情大纲 (当前章节)

当前进度: 第 1 章 / 共 5 章
章节: 白曜城的新人冒险者
目标: 主角抵达白曜城，通过铁匠公会建立人脉，发现北境古墓的线索
```

### 5.5 outline zone @ FULL（plot_pre_check Agent）

```
═══════════════════════════════════════
█  ZONE: outline (FULL)
═══════════════════════════════════════
大纲版本: v3 | 世界线状态: stable | 已确认: true

# 第一章：白曜城的新人冒险者

主角抵达北方重镇白曜城，在这里开始冒险者生涯...

## 章节结构
[1] 白曜城的初遇
    摘要: 主角抵达白曜城，完成铁匠委托任务，了解城中势力
    关键事件: 抵达白曜城 | 铁匠委托 | 北境古墓传闻
    预计时长: 1-2周（游戏时间）
═══════════════════════════════════════
```

---

## 六、实施指南

### 6.1 新增类型定义 (`context-visibility.ts`)

```typescript
export type VisibilityLevel = 'FULL' | 'SUMMARY' | 'KEYS' | 'NONE';
export type ZoneId = 'memory' | 'npc' | 'world' | 'quest' | 'craft' | 'combat' | 'outline' | 'variable';

export interface AgentZoneVisibility {
  memory: VisibilityLevel; npc: VisibilityLevel; world: VisibilityLevel;
  quest: VisibilityLevel; craft: VisibilityLevel; combat: VisibilityLevel;
  outline: VisibilityLevel; variable: VisibilityLevel;
}

export function getAgentZoneVisibility(agentId: string): AgentZoneVisibility {
  return VISIBILITY_MATRIX[agentId] ?? DEFAULT_VISIBILITY;
}

export function filterZoneContent(
  zoneId: ZoneId, content: Record<string, any>,
  visibility: VisibilityLevel, agentId: string, ctx?: AgentContext
): string | null { /* FULL/SUMMARY/KEYS/NONE 分发 */ }
```

### 6.2 修改 AgentContext (types.ts)

新增字段：`zones: Record<string, VariableZone>`、`zoneVisibility: ZoneVisibilityMatrix`、`targetCharacterId?: string`

### 6.3 重构 buildAgentMessages (agent-templates.ts)

Part 3（变量区）从手工 `variableContext(ctx)` 改为基于 zone visibility 矩阵的 `buildZoneSection(agentId, ctx)`。

### 6.4 迁移路径

1. **Step A**: 新建 `context-visibility.ts`，实现可见性矩阵 + zone 过滤
2. **Step B**: `AgentContext` 新增 `zones` 字段，写 `buildZoneContext()` 组装现有字段到 zone 字典
3. **Step C**: 修改各 Agent 的 `variableContext()` 从 `ctx.zones` 读取（旧函数保留为 fallback）
4. **Step D**: `buildAgentMessages()` 中集中调用 `filterZoneContent()`，移除各 Agent 的手工过滤

---

## 七、Prompt 四部分最终结构

```
┌──────────────────────────────────────────┐
│  预设 (Preset)                           │  ← 不共享，per-agent 固定
│  Agent 职责 / 思维链 / 输出格式           │
├──────────────────────────────────────────┤
│  世界书 (World Books)                    │  ← 部分共享，按 worldBookIds 分配
│  constant entries + keyword-matched      │
├──────────────────────────────────────────┤
│  变量区 (Variable Zones)                 │  ← 部分共享，按 visibility matrix
│  8 zones × 4 可见性级别                  │
├──────────────────────────────────────────┤
│  正文/用户输入 (Body)                     │  ← 共享，对话历史 + userInput
│  最近 N 轮对话 + 本轮用户输入              │
└──────────────────────────────────────────┘
```

---

## 八、待解决设计问题

1. **`variable` zone SUMMARY vs KEYS 边界**: 当前为空容器。未来 `user.*` 变量增长时，需定义 SUMMARY 白名单（推荐按前缀：`sys.faction_standing.*` + `sys.region_state.*`）
2. **material provider 自动检测**: craft_gen 的 npc SUMMARY 需要扫描 marker 的 `materials` 字段，逆向匹配背包中持有这些材料的在场角色
3. **同轮多 char_detect 重名检测**: 如果同一轮引入 3 个 NPC，char_gen 调用间需要互斥名称列表
4. **item_gen 对 craft zone 的可见性**: 当前 NONE，若未来需要引用制作物品防效果重名，可能升级到 KEYS
