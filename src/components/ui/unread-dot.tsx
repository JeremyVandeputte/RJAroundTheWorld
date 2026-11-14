/** Small blue dot marking something the viewer has not opened yet. */
export function UnreadDot({ label = "Non lue" }: { label?: string }) {
  return (
    <span className="inline-flex shrink-0 items-center" title={label}>
      <span aria-hidden="true" className="size-2.5 rounded-full bg-blue-600 ring-2 ring-blue-600/20" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
