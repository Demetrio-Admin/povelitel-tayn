// Fixed, limited recovery channels. No automatic growth with player strength.
export const ENEMY_TACTICS = {
 frost_collector_elite: { kind: 'shield', amount: 60, uses: 2, prep: 2.4, below: .9, cooldown: 15, interruptBy: ['telekinesis'] },
 experimental_construct: { kind: 'shield', amount: 80, uses: 2, prep: 2.6, below: .9, cooldown: 16, interruptBy: ['telekinesis_heavy'] },
 frost_alpha: { kind: 'heal', amount: 60, uses: 3, prep: 2.6, below: .75, cooldown: 16, interruptBy: ['telekinesis_heavy'] },
 barrow_warden: { kind: 'shield', amount: 100, uses: 2, prep: 2.8, below: .8, cooldown: 18, interruptBy: ['telekinesis_heavy'] },
 severin_boss: { minPhase: 2, kind: 'heal', amount: 65, uses: 2, prep: 2.8, below: .4, cooldown: 18, interruptBy: ['telekinesis_heavy'] },
};
