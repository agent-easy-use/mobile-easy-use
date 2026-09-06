export interface ResourceProbeResult {
  passed: boolean;
  api: string;
  result: Record<string, number>;
  oracle: Record<string, number>;
}

/** Compare dynamic R values with the App's compiled R classes. */
export declare function probeResourceResolution(): Promise<ResourceProbeResult>;

/** Verify a missing dynamic resource resolves to zero without poisoning later reads. */
export declare function probeMissingResource(): Promise<ResourceProbeResult>;
