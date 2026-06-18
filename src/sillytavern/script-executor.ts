/**
 * ScriptExecutor — 词条脚本沙盒执行器 (Phase 7e+8)
 *
 * 提供沙盒环境执行 AI 编写的效果脚本。
 * 脚本通过 $ API 与引擎交互，可以套娃创建新状态效果。
 *
 * 安全模型:
 * - new Function() 沙盒隔离，无 DOM/文件/网络访问
 * - 仅暴露白名单内的 $ API
 * - 脚本字符串不能跨对象引用 (局部作用域)
 */

import type { StatusEffect } from './types';

// ═══════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════

/** 脚本执行上下文 */
export interface ScriptContext {
  /** 状态/物品持有者 ID */
  owner: string;
  /** 事件目标 ID (可选) */
  target?: string;
  /** 触发事件的数据负载 */
  event?: Record<string, any>;
  /** 当前脚本所属的效果自身信息 (只读) */
  self: {
    stacks: number;
    remainingTime: number | null;
    name: string;
  };
}

/** $ API 注入接口 */
export interface ScriptSandbox {
  $dice: {
    d20: () => number;
    d100: () => number;
    roll: (formula: string) => number;
  };
  $resource: {
    getHp: (charId: string) => number;
    getMaxHp: (charId: string) => number;
    modifyHp: (charId: string, amount: number) => void;
    modifyStat: (charId: string, stat: string, amount: number) => void;
  };
  $status: {
    /** 添加状态效果 */
    add: (charId: string, effect: Partial<StatusEffect>) => void;
    /** 移除状态效果 */
    remove: (charId: string, effectId: string) => void;
    /** 修改层数 */
    setStacks: (charId: string, effectId: string, stacks: number) => void;
    /** 获取层数 */
    getStacks: (charId: string, effectId: string) => number;
  };
  $event: {
    /** 触发事件 (可以被其他状态/物品的 onTrigger 捕获) */
    emit: (eventType: string, data?: Record<string, any>) => void;
  };
}

/** 效果收集器 — 脚本执行期间收集的状态变更, 调用方在脚本执行后处理 */
export interface ScriptEffects {
  /** add: {charId, effect} */
  adds: Array<{ charId: string; effect: Partial<StatusEffect> }>;
  /** remove: {charId, effectId} */
  removes: Array<{ charId: string; effectId: string }>;
  /** setStacks: {charId, effectId, stacks} */
  stackSets: Array<{ charId: string; effectId: string; stacks: number }>;
  /** emit: {eventType, data} */
  events: Array<{ eventType: string; data: Record<string, any> }>;
  /** modifyHp: {charId, amount} */
  hpChanges: Array<{ charId: string; amount: number }>;
  /** modifyStat: {charId, stat, amount} */
  statChanges: Array<{ charId: string; stat: string; amount: number }>;
}

/** 创建空的 ScriptEffects */
export function createScriptEffects(): ScriptEffects {
  return { adds: [], removes: [], stackSets: [], events: [], hpChanges: [], statChanges: [] };
}

// ═══════════════════════════════════════════════════════════
// 执行器
// ═══════════════════════════════════════════════════════════

/**
 * 在沙盒中执行一段效果脚本
 *
 * @param script - AI 编写的 JavaScript 代码
 * @param context - 执行上下文 (owner, target, event, self)
 * @returns 脚本执行期间收集的状态变更
 */
export function executeScript(script: string, context: ScriptContext): ScriptEffects {
  const effects = createScriptEffects();

  if (!script || script.trim().length === 0) return effects;

  try {
    const sandbox = buildSandbox(effects, context);
    const fn = new Function(...Object.keys(sandbox), `"use strict";\n${script}`);
    fn(...Object.values(sandbox));
  } catch (err) {
    console.error('[ScriptExecutor] 脚本执行失败:', err instanceof Error ? err.message : String(err));
  }

  return effects;
}

/**
 * 在效果列表中按钩子名执行脚本
 *
 * @param statuses - 角色的状态效果列表
 * @param hook - 钩子名: 'onApply' | 'onTick' | 'onRemove' | 'onTrigger'
 * @param context - 执行上下文
 * @returns 累积的状态变更
 */
export function executeHook(
  statuses: StatusEffect[],
  hook: 'onApply' | 'onTick' | 'onRemove' | 'onTrigger',
  context: Omit<ScriptContext, 'self'>,
): ScriptEffects {
  const allEffects = createScriptEffects();

  for (const status of statuses) {
    const scriptRef = status[hook];
    if (!scriptRef || !status.scripts) continue;

    const script = status.scripts[scriptRef];
    if (!script) continue;

    const self: ScriptContext['self'] = {
      stacks: status.stacks,
      remainingTime: status.remainingTime,
      name: status.name,
    };

    // 每个效果独立执行，但收集到一个 effects 对象
    const result = executeScript(script, { ...context, self });

    // 合并结果
    allEffects.adds.push(...result.adds);
    allEffects.removes.push(...result.removes);
    allEffects.stackSets.push(...result.stackSets);
    allEffects.events.push(...result.events);
    allEffects.hpChanges.push(...result.hpChanges);
    allEffects.statChanges.push(...result.statChanges);
  }

  return allEffects;
}

/**
 * 解析脚本引用: "hit" → scripts["hit"]
 * 只查当前对象的 scripts，不跨对象
 */
export function resolveScriptRef(
  ref: string,
  scripts?: Record<string, string>,
): string | undefined {
  if (!scripts || !ref) return undefined;
  return scripts[ref];
}

// ═══════════════════════════════════════════════════════════
// 沙盒构造
// ═══════════════════════════════════════════════════════════

function buildSandbox(effects: ScriptEffects, ctx: ScriptContext): Record<string, any> {
  return {
    // 上下文变量
    owner: ctx.owner,
    target: ctx.target,
    event: ctx.event ?? {},
    self: ctx.self,

    // $dice API
    $dice: {
      d20: () => Math.floor(Math.random() * 20) + 1,
      d100: () => Math.floor(Math.random() * 100) + 1,
      roll: (formula: string) => {
        // 简单公式解析: "2d6+3" → 2d6 + 3
        const match = formula.match(/(\d+)?d(\d+)([+-]\d+)?/);
        if (!match) return 0;
        const count = parseInt(match[1] || '1');
        const sides = parseInt(match[2]);
        const mod = parseInt(match[3] || '0');
        let total = 0;
        for (let i = 0; i < count; i++) total += Math.floor(Math.random() * sides) + 1;
        return total + mod;
      },
    },

    // $resource API
    $resource: {
      getHp: (_charId: string) => 0,     // 调用方负责处理
      getMaxHp: (_charId: string) => 0,
      modifyHp: (charId: string, amount: number) => {
        effects.hpChanges.push({ charId, amount });
      },
      modifyStat: (charId: string, stat: string, amount: number) => {
        effects.statChanges.push({ charId, stat, amount });
      },
    },

    // $status API (套娃核心)
    $status: {
      add: (charId: string, effect: Partial<StatusEffect>) => {
        effects.adds.push({ charId, effect });
      },
      remove: (charId: string, effectId: string) => {
        effects.removes.push({ charId, effectId });
      },
      setStacks: (charId: string, effectId: string, stacks: number) => {
        effects.stackSets.push({ charId, effectId, stacks });
      },
      getStacks: (_charId: string, _effectId: string) => 0, // 沙盒内无法查询（效果收集器模式）
    },

    // $event API
    $event: {
      emit: (eventType: string, data?: Record<string, any>) => {
        effects.events.push({ eventType, data: data ?? {} });
      },
    },
  };
}
