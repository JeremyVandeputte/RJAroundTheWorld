"use client";

import { useEffect, useRef, useState, type ComponentProps } from "react";
import { EyeIcon, EyeOffIcon } from "@/components/ui/icons";

type PasswordFieldProps = Omit<ComponentProps<"input">, "type"> & {
  label: string;
  name: string;
  hint?: string;
};

/**
 * A password input with a button to show what was typed (handy on a phone).
 * The password is hidden again when the form is sent, so that the browser
 * still offers to remember it.
 */
export function PasswordField({ label, name, hint, ...inputProps }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = hint ? `${name}-hint` : undefined;

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const hide = () => setVisible(false);
    form.addEventListener("submit", hide);
    return () => form.removeEventListener("submit", hide);
  }, []);

  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          ref={inputRef}
          id={name}
          name={name}
          type={visible ? "text" : "password"}
          aria-describedby={hintId}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          // Edge has its own eye button: only ours is shown.
          className="block w-full rounded-md border border-line bg-white py-2 pr-12 pl-3 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 [&::-ms-reveal]:hidden"
          {...inputProps}
        />
        <button
          type="button"
          onClick={() => setVisible((value) => !value)}
          aria-pressed={visible}
          aria-controls={name}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          title={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted hover:text-accent focus-visible:text-accent focus-visible:outline-2 focus-visible:outline-accent"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {hint ? (
        <p id={hintId} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
