"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 2_000;
const MAX_POLLS = 30;

export function CheckoutStatusPoller() {
  const router = useRouter();
  const [polls, setPolls] = useState(0);

  useEffect(() => {
    if (polls >= MAX_POLLS) return;
    const timer = window.setTimeout(() => {
      setPolls((value) => value + 1);
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [polls, router]);

  return <div className="checkout-polling" role="status" aria-live="polite">
    <span className="button-spinner" aria-hidden="true" />
    <p>{polls < MAX_POLLS ? "Checking the server for verified access…" : "Verification is taking longer than expected. Your subscription status remains unchanged until the server confirms it."}</p>
  </div>;
}
