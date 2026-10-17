/** Returns a transformer that prefixes each line start with an ISO timestamp, carrying partial-line state across chunks. */
export function createLineTimestamper(now: () => string = () => new Date().toISOString()) {
  let atLineStart = true;
  return (chunk: string): string => {
    let out = '';
    for (const part of chunk.split(/(?<=\n)/)) {
      if (!part) continue;
      if (atLineStart) out += `${now()} `;
      out += part;
      atLineStart = part.endsWith('\n');
    }
    return out;
  };
}

/** Wraps process.stderr.write so worker.err.log lines carry timestamps. Idempotent. */
export function installTimestampedStderr(stream: NodeJS.WriteStream = process.stderr): void {
  const marked = stream as NodeJS.WriteStream & { __agentmemTimestamped?: boolean };
  if (marked.__agentmemTimestamped) return;
  marked.__agentmemTimestamped = true;
  const original = stream.write.bind(stream) as (...args: any[]) => boolean;
  const stamp = createLineTimestamper();
  (stream as any).write = (chunk: any, ...rest: any[]) => {
    const text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) || chunk instanceof Uint8Array ? Buffer.from(chunk).toString('utf8') : String(chunk);
    const encodingArgs = typeof rest[0] === 'string' ? rest.slice(1) : rest;
    return original(stamp(text), ...encodingArgs);
  };
}
