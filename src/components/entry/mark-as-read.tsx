"use client";

import { useEffect } from "react";
import { markEntryReadAction } from "@/server/actions/reads";

/** Records, once the entry is on screen, that the viewer has read it. Shows nothing. */
export function MarkAsRead({ entryId }: { entryId: number }) {
  useEffect(() => {
    // Offline or failing: the entry simply stays "new" until next time.
    markEntryReadAction(entryId).catch(() => undefined);
  }, [entryId]);
  return null;
}
