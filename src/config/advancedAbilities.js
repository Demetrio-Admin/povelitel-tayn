// Additive to the existing I–III data; branch overlays are applied after the old branch tradeoffs.
export function addAdvancedAbilities(abilities) {
  const b = abilities;
  const overlays = {
    telekinesis: {
      4: { lord: { interruptWard: { amount: 40, sec: 8, cooldown: 12 } }, breaker: { doubleCast: { windowSec: 2.5, count: 3 } } },
      5: { lord: { interruptWard: { amount: 80, sec: 8, cooldown: 12 }, nextThrowBonus: .5 }, breaker: { doubleCast: { windowSec: 2.5, count: 3 }, thirdThrowBonus: .8 } },
    },
    fire: {
      4: { arsonist: { burn: { dps: 6, durationSec: 10 }, burnStacks: 2 }, blaster: { burn: { dps: 5, durationSec: 11 }, detonate: 1 } },
      // More than two ordinary 8s cooldowns: three independent layers can actually overlap.
      5: { arsonist: { burn: { dps: 7, durationSec: 18 }, burnStacks: 3, fullBurnAntiheal: .3 }, blaster: { burn: { dps: 6, durationSec: 12 }, detonate: 1.75 } },
    },
    seal: {
      4: { seer: { flash: { sec: 5, vulnerability: .2 } }, piercer: { shieldPierce: .5 } },
      5: { seer: { flash: { sec: 6, vulnerability: .25 }, comboMana: 10 }, piercer: { shieldPierce: .75, shieldDamage: .4 } },
    },
    ice: {
      4: { frost: { slow: { pct: .6, sec: 6 }, frostWeaken: .3 }, shard: { brittle: { sec: 5, bonus: .9 }, shatter: { mult: 2.6 } } },
      5: { frost: { slow: { pct: .65, sec: 6 }, frostWeaken: .4 }, shard: { brittle: { sec: 5, bonus: 1.1 }, shatter: { mult: 3 } } },
    },
  };
  for (const [id, levels] of Object.entries(overlays)) for (const [lv, branches] of Object.entries(levels)) {
    b[id].levels[lv] = { ...b[id].levels[3], label: `${b[id].name} ${Number(lv) === 4 ? 'IV' : 'V'}`, advancedBranches: branches };
  }
  b.storm = { name: 'Гроза', color: 'storm', levels: {}, branches: {
    discharge: { name: 'Разряд', fromLevel: 3, text: 'Полный разряд наносит дополнительный удар.', tradeoff: 'Нужны три заряда от других Даров.' },
    field: { name: 'Поле', fromLevel: 3, text: 'Полный разряд ослабляет противника.', tradeoff: 'Меньше прямого урона, чем у Разряда.' },
  } };
  for (let lv = 1; lv <= 5; lv++) b.storm.levels[lv] = { label: `Гроза ${['','I','II','III','IV','V'][lv]}`, damage: 12 + lv * 4,
    manaCost: 16 + lv * 2, cooldownSec: 8, castSec: .25, chargeBonus: .2 + lv * .05, maxCharges: 3,
    advancedBranches: lv >= 3 ? { discharge: { fullDischarge: [.5,.75,1][lv-3] }, field: { stormField: { reduction: [.15,.2,.3][lv-3], sec: [4,6,8][lv-3], mana: lv === 5 ? 20 : 0 } } } : {} };
}
