import "server-only";

import { randomUUID } from "node:crypto";

import { createSafeEvent, type SafeEvent } from "@math-vocabulary-hunt/platform-core";

/**
 * A `SafeEvent` plus the emitter's stamp.
 *
 * `eventId` is the store-wide identity of one emission. The same line reaches
 * the security store by two routes — persisted in-process and delivered back
 * by the platform log drain — and this id is what lets the store keep one row
 * instead of two. `emittedAt` is the server clock at emission; the read path
 * prefers it to its own clock and never accepts a client's.
 */
export type EmittedEvent = SafeEvent & Readonly<{ eventId: string; emittedAt: string }>;

export interface MonitoringAdapter {
  emit(event: EmittedEvent): void | Promise<void>;
}

export class ConsoleMonitoringAdapter implements MonitoringAdapter {
  emit(event: EmittedEvent) {
    console.info(JSON.stringify(event));
  }
}

const recent = new Map<string, number>();

export function emitOperationalEvent(adapter: MonitoringAdapter, event: SafeEvent, now = Date.now()) {
  const safe = createSafeEvent(event);
  if (!safe) return false;
  const key = `${safe.category}:${safe.code}:${safe.correlationId}`;
  const previous = recent.get(key) ?? 0;
  if (now - previous < 5_000) return false;
  recent.set(key, now);
  if (recent.size > 500) recent.delete(recent.keys().next().value!);
  void adapter.emit(Object.freeze({
    ...safe,
    eventId: randomUUID().replace(/-/g, ""),
    emittedAt: new Date(now).toISOString()
  }));
  return true;
}
