import "server-only";
import { createSafeEvent, type SafeEvent } from "@math-vocabulary-hunt/platform-core";
export interface MonitoringAdapter { emit(event: SafeEvent): void | Promise<void>; }
export class ConsoleMonitoringAdapter implements MonitoringAdapter { emit(event: SafeEvent) { console.info(JSON.stringify(event)); } }
const recent = new Map<string, number>();
export function emitOperationalEvent(adapter: MonitoringAdapter, event: SafeEvent, now=Date.now()) {
  const safe=createSafeEvent(event); if (!safe) return false;
  const key=`${safe.category}:${safe.code}:${safe.correlationId}`; const previous=recent.get(key) ?? 0;
  if (now-previous<5_000) return false; recent.set(key,now); if(recent.size>500) recent.delete(recent.keys().next().value!);
  void adapter.emit(safe); return true;
}

