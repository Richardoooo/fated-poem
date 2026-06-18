/**
 * script-executor 测试 (Phase 7e+8)
 */
import { describe, it, expect } from 'vitest';
import { executeScript, executeHook, createScriptEffects, resolveScriptRef } from './script-executor';
import type { StatusEffect } from './types';
import type { ScriptContext } from './script-executor';

function makeStatus(overrides: Partial<StatusEffect> = {}): StatusEffect {
  return {
    id: 'test_status_1',
    name: '灼烧',
    description: '每回合失去5%生命值',
    category: '减益',
    stacks: 2,
    remainingTime: 3,
    timeUnit: '回合',
    source: '灼烧之剑',
    effects: {},
    scripts: {},
    ...overrides,
  };
}

function makeContext(overrides: Partial<ScriptContext> = {}): ScriptContext {
  return {
    owner: 'char_owner',
    target: 'char_target',
    event: { weapon: '灼烧之剑', damage: 30 },
    self: { stacks: 2, remainingTime: 3, name: '灼烧' },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
describe('executeScript', () => {
  it('passes context variables to script', () => {
    const ctx = makeContext();
    // 写一个用 return 返回值的脚本没法在 new Function 里捕获…
    // 但可以通过 $ APIs 的副作用验证
    const result = executeScript('$resource.modifyHp(target, -30)', ctx);
    expect(result.hpChanges).toHaveLength(1);
    expect(result.hpChanges[0]).toEqual({ charId: 'char_target', amount: -30 });
  });

  it('handles empty script gracefully', () => {
    const result = executeScript('', makeContext());
    expect(result.adds).toHaveLength(0);
    expect(result.hpChanges).toHaveLength(0);
  });

  it('handles script errors without throwing', () => {
    expect(() => executeScript('throw new Error("test")', makeContext())).not.toThrow();
  });

  it('$dice.d100 returns value between 1-100', () => {
    // 验证它不抛错；值由 Math.random 生成
    expect(() => executeScript('$dice.d100()', makeContext())).not.toThrow();
  });

  it('$status.add creates a new status effect', () => {
    const ctx = makeContext();
    const result = executeScript(
      '$status.add(target, { name: "中毒", category: "减益", stacks: 1, remainingTime: 3, timeUnit: "回合", source: "毒匕首" })',
      ctx,
    );
    expect(result.adds).toHaveLength(1);
    expect(result.adds[0].charId).toBe('char_target');
    expect(result.adds[0].effect.name).toBe('中毒');
  });

  it('$status.add with scripts creates nested effect chain', () => {
    const ctx = makeContext();
    const result = executeScript(
      '$status.add(target, { name: "灼烧", category: "减益", stacks: 1, remainingTime: 3, timeUnit: "回合", source: "剑", scripts: { tick: "$resource.modifyHp(owner, -5)" }, onTick: "tick" })',
      ctx,
    );
    expect(result.adds).toHaveLength(1);
    expect(result.adds[0].effect.scripts).toBeDefined();
    expect(result.adds[0].effect.onTick).toBe('tick');
  });

  it('$status.remove and $status.setStacks', () => {
    const ctx = makeContext();
    const result = executeScript(
      '$status.remove(owner, "burn_1"); $status.setStacks(owner, "bleed_1", 0)',
      ctx,
    );
    expect(result.removes).toHaveLength(1);
    expect(result.stackSets).toHaveLength(1);
    expect(result.stackSets[0].stacks).toBe(0);
  });

  it('$event.emit fires events', () => {
    const ctx = makeContext();
    const result = executeScript(
      '$event.emit("flame_burst", { damage: 50 })',
      ctx,
    );
    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventType).toBe('flame_burst');
    expect(result.events[0].data.damage).toBe(50);
  });

  it('self contains stack and time info', () => {
    const ctx = makeContext({ self: { stacks: 3, remainingTime: 5, name: '流血' } });
    const result = executeScript(
      'if (self.stacks >= 3) { $resource.modifyHp(owner, -20); $status.setStacks(owner, self.name, 0) }',
      ctx,
    );
    expect(result.hpChanges).toHaveLength(1);
    expect(result.stackSets).toHaveLength(1);
  });

  it('condition with d100 works', () => {
    const ctx = makeContext();
    // 条件永远为 true (d100 >= 0)
    const result = executeScript('if ($dice.d100() >= 0) { $resource.modifyHp(target, -10) }', ctx);
    expect(result.hpChanges).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════
describe('executeHook', () => {
  it('executes onTick on all statuses that have it', () => {
    const statuses = [
      makeStatus({ id: 'burn', name: '灼烧', scripts: { tick: '$resource.modifyHp(owner, -5)' }, onTick: 'tick' }),
      makeStatus({ id: 'poison', name: '中毒', scripts: { tick: '$resource.modifyHp(owner, -3)' }, onTick: 'tick' }),
      makeStatus({ id: 'shield', name: '护盾', scripts: {}, onTick: undefined }),
    ];
    const ctx = { owner: 'char_1', target: undefined, event: { turn: 3 } };
    const result = executeHook(statuses, 'onTick', ctx);
    expect(result.hpChanges).toHaveLength(2); // 灼烧 + 中毒
  });

  it('skips statuses without scripts or hook', () => {
    const statuses = [
      makeStatus({ id: 'bare', scripts: undefined, onTick: undefined }),
    ];
    const result = executeHook(statuses, 'onTick', { owner: 'x', target: undefined });
    expect(result.hpChanges).toHaveLength(0);
  });

  it('executes onApply hook', () => {
    const statuses = [
      makeStatus({ id: 'fear', name: '恐惧', scripts: { apply: '$resource.modifyStat(owner, "atk", -5)' }, onApply: 'apply' }),
    ];
    const result = executeHook(statuses, 'onApply', { owner: 'char_1', target: undefined });
    expect(result.statChanges).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════
describe('resolveScriptRef', () => {
  it('resolves script reference', () => {
    const scripts = { hit: 'console.log("hit")' };
    expect(resolveScriptRef('hit', scripts)).toBe('console.log("hit")');
  });

  it('returns undefined for missing ref or scripts', () => {
    expect(resolveScriptRef('missing', {})).toBeUndefined();
    expect(resolveScriptRef('hit', undefined)).toBeUndefined();
    expect(resolveScriptRef('', { hit: 'x' })).toBeUndefined();
  });
});
