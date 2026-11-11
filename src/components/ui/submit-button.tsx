"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

type SubmitButtonProps = {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "danger";
};

const variants = {
  primary: "bg-accent text-white hover:bg-accent/90",
  secondary: "border border-line bg-white text-ink hover:bg-paper",
  danger: "bg-red-700 text-white hover:bg-red-800",
};

/** Submit button that disables itself while its form is being sent. */
export function SubmitButton({ children, pendingLabel, variant = "primary" }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-base font-medium transition-colors disabled:opacity-60 ${variants[variant]}`}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
