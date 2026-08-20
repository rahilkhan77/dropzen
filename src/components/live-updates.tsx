"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function LiveUpdates() {
  const router = useRouter();

  useEffect(() => {
    let source: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;

    const refresh = () => router.refresh();

    try {
      source = new EventSource("/api/employee/events");
      source.addEventListener("notification", refresh);
      source.addEventListener("ready", () => undefined);
      source.onerror = () => {
        source?.close();
        source = null;
        if (!poll) poll = setInterval(refresh, 20000);
      };
    } catch {
      poll = setInterval(refresh, 20000);
    }

    return () => {
      source?.close();
      if (poll) clearInterval(poll);
    };
  }, [router]);

  return null;
}
