import { RuntimeMemoryPolicy } from './db';

export const READ_DISABLED_MESSAGE =
  'AgentMemory read access is currently disabled by the global runtime policy.';

export const WRITE_DISABLED_MESSAGE =
  'AgentMemory write access is currently disabled by the global runtime policy.';

export function normalizeRuntimePolicy(
  policy: Partial<Pick<RuntimeMemoryPolicy, 'readEnabled' | 'writeEnabled'>>
): Pick<RuntimeMemoryPolicy, 'readEnabled' | 'writeEnabled'> {
  return {
    readEnabled: policy.readEnabled !== false,
    writeEnabled: policy.writeEnabled !== false,
  };
}
