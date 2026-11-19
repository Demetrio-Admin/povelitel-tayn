import { CORE } from '../../src/config/horizon/rules.js';
import { HORIZON_TABLES } from '../../src/config/horizon/tables.generated.js';

export function horizonRules() {
  return { balanceVersion: CORE.balance_version, tables: HORIZON_TABLES };
}
