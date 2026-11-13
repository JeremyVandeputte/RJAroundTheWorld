import type { Segment } from "@/lib/search";

/** Text with the searched words highlighted. Plain text only: nothing is parsed as HTML. */
export function Highlighted({ segments }: { segments: Segment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="rounded-sm bg-amber-200 px-0.5 text-inherit">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}
