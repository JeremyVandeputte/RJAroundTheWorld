"use client";

import { useEffect, useState } from "react";

const formatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

/**
 * A moment shown in the timezone of the device ("12 nov. 2026, 14:32").
 * Filled in after loading: the server does not know where the reader is.
 */
export function LocalDateTime({ iso }: { iso: string }) {
  const [text, setText] = useState("");
  useEffect(() => setText(formatter.format(new Date(iso))), [iso]);
  return <time dateTime={iso}>{text}</time>;
}
