const AGENTMEM_TOOL_NAMES = new Set([
  'get_memory_details',
  'get_memory_state',
  'get_project_context',
  'list_procedural_skills',
  'memory_timeline',
  'promote_skill_candidate',
  'query_memory',
  'record_memory',
  'record_procedural_skill_feedback',
  'search_memory',
  'set_memory_state',
  'set_procedural_skill_status',
]);

export function shouldSkipAgentMemoryToolLog(toolName: string): boolean {
  const normalized = String(toolName || '').trim().toLowerCase();
  if (!normalized) return false;

  if (normalized.includes('agentmem')) {
    return true;
  }

  const lastSegment = normalized.split(/[.:/\\]/).pop() || normalized;
  return AGENTMEM_TOOL_NAMES.has(lastSegment);
}
