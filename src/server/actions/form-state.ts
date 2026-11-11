/** State returned by form actions and displayed next to the form. */
export type FormState = {
  error?: string;
  success?: string;
  /** Submitted values to put back in the form after an error. */
  values?: Record<string, string>;
  /** Shown once, right after an account creation or a password reset. */
  temporaryPassword?: { username: string; password: string };
};

export const emptyFormState: FormState = {};

export function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Checkbox value: present in the form data only when checked. */
export function formBoolean(formData: FormData, name: string): boolean {
  return formData.get(name) !== null;
}

/** Positive integer identifier, or null when missing or malformed. */
export function formId(formData: FormData, name: string): number | null {
  const value = formString(formData, name);
  return /^[1-9]\d{0,14}$/.test(value) ? Number(value) : null;
}
