/**
 * State facts that record the last successful Vault check. The scheduled Daily Review (agy) wrote
 * `last_successful_review_at`; since 2026-11-13 the read-only VaultAudit writes `last_successful_audit_at`
 * under its own entity. Both count, so history keeps the old review and the freshness check follows the
 * newest of either.
 */
export const VAULT_CHECKPOINT_FACTS: ReadonlyArray<{ entityKeys: readonly string[]; factKey: string }> = [
  {
    entityKeys: ['obsidian-vault-daily-review', 'automation/obsidian-vault-daily-review'],
    factKey: 'last_successful_review_at',
  },
  {
    entityKeys: ['obsidian-vault-daily-audit', 'automation/obsidian-vault-daily-audit'],
    factKey: 'last_successful_audit_at',
  },
];

/** SQL condition (no leading AND) and its parameters matching any Vault checkpoint fact. */
export function vaultCheckpointWhere(): { sql: string; params: string[] } {
  const parts: string[] = [];
  const params: string[] = [];
  for (const fact of VAULT_CHECKPOINT_FACTS) {
    parts.push(`(LOWER(entity_key) IN (${fact.entityKeys.map(() => '?').join(',')}) AND fact_key = ?)`);
    params.push(...fact.entityKeys, fact.factKey);
  }
  return { sql: `(${parts.join(' OR ')})`, params };
}
