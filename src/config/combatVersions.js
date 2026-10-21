// A saved context selects its physics for its entire replay. Unknown requests use the oldest protocol.
export const COMBAT_BALANCE_VERSION = 39;
export const combatBalanceVersion = value => [30, 38, 39].includes(value) ? value : 29;
