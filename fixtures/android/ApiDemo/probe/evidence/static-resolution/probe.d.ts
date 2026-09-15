/**
 * Android ApiDemo only. Run once per cold App process; no UI navigation is required.
 * Installs a temporary raw Frida Hook and invokes a nonrecursive fixture on main.
 * A depth-2 fallback bounds JS reentry; it cannot prevent every ART native crash.
 * Changes only fixture counters and removes the Hook on completion.
 * @param preparation Read another static method first (default), skip the read, or pre-call the target.
 * @param trigger Invoke through the Frida wrapper (default), a Java call site, or Java reflection.
 */
export declare function probeStaticResolution(
  preparation?: 'snapshot' | 'none' | 'warm-target',
  trigger?: 'java' | 'reflection' | 'bridge',
): Promise<{
  status: 'reproduced' | 'normal' | 'inconclusive';
  pid: number;
  androidVersion: string;
  fridaVersion: string;
  preparation: string;
  trigger: string;
  entrypoint: {address: string; symbol: string} | null;
  entries: number;
  maxDepth: number;
  events: Array<{phase: 'enter' | 'leave'; depth: number}>;
  result: string;
  originalCalls: number;
}>;
