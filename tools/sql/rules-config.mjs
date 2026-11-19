import { serverRules } from '../../src/config/serverRules.js';
import { CORE } from '../../src/config/horizon/rules.js';
import { HORIZON_TABLES } from '../../src/config/horizon/tables.generated.js';

// SQL keeps the existing rules at their original keys. Version 41 data is selected explicitly.
export function databaseRules() {
  return { ...serverRules(), horizon: { balanceVersion: CORE.balance_version, tables: HORIZON_TABLES } };
}
