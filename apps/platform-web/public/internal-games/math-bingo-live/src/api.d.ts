// Types for the parts of api.js that TypeScript code (tests) imports.
export declare function pollInterval(base: number, playerCount: number): number;
export declare const DEADLINE_SPREAD_MS: number;
export declare const POLL_TIMEOUT_MS: number;
export declare const ACTION_TIMEOUT_MS: number;
export declare function reconcile<T extends { gameNumber: number; version: number; progress?: number; questionNumber?: number; me?: unknown }>(previous: T | null, next: T | null): T | null;
export declare function liveRequest(endpoint: string, body: unknown, options?: { signal?: AbortSignal; timeoutMs?: number }): Promise<Record<string, unknown>>;
export declare function createLiveSession(options: Record<string, unknown>): {
  readonly state: unknown;
  start(initialState?: unknown): void;
  pollNow(): void;
  act(action: string, extra?: Record<string, unknown>): Promise<Record<string, unknown>>;
  stop(): void;
};
