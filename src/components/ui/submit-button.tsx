"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
  /** Sent with the form when this button is the one clicked. */
  name?: string;
  value?: string;
  /** Overrides the pending state detected from the enclosing form. */
  pending?: boolean;
};

const variants = {
  primary: "bg-accent text-white hover:bg-accent/90",
  secondary: "border border-line bg-white text-ink hover:bg-paper",
  danger: "bg-red-700 text-white hover:bg-red-800",
};

/** Submit button that disables itself while its form is being sent. */
export function SubmitButton({ children, pendingLabel, variant = "primary", name, value, pending }: SubmitButtonProps) {
  const status = useFormStatus();
  const isPending = pending ?? status.pending;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={isPending}
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-base font-medium transition-colors disabled:opacity-60 ${variants[variant]}`}
    >
      {isPending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
