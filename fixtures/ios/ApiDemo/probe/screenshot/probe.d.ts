export interface ScreenshotProbeResult {
  passed: boolean;
  api: string;
  result: unknown;
  oracle?: unknown;
  navigation?: { returnedToMain: boolean };
}

export declare function probeWindowAndElementScreenshot(): Promise<ScreenshotProbeResult>;
export declare function probeDriverFailureScreenshot(): Promise<ScreenshotProbeResult>;
