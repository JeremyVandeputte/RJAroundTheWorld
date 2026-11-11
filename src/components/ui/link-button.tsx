import Link from "next/link";
import type { ReactNode } from "react";

const variants = {
  primary: "bg-accent text-white hover:bg-accent/90",
  secondary: "border border-line bg-white text-ink hover:bg-paper",
};

/** Link styled like a button, for navigation to a form or a page. */
export function LinkButton({
  href,
  children,
  variant = "secondary",
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof variants;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-base font-medium transition-colors ${variants[variant]}`}
    >
      {children}
    </Link>
  );
}
