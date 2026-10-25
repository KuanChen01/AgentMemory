/**
 * Shared agent-facing guidance managed by the installer. Every managed rule/profile
 * surface carries this line so reinstalls keep it. The installer never writes
 * ~/.claude/CLAUDE.md: Claude Code gets the same rule through the record_memory tool docs.
 */
export const AGENTMEM_ENGLISH_RECORDS_MARKER = 'in English, even when the conversation is in another language';
export const AGENTMEM_ENGLISH_RECORDS_RULE = `- Write AgentMemory records (\`record_memory\` title, narrative, facts and concepts) ${AGENTMEM_ENGLISH_RECORDS_MARKER}; keep identifiers, paths, commands and proper names verbatim.`;
