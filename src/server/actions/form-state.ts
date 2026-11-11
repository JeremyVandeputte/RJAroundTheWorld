/** State returned by form actions and displayed next to the form. */
export type FormState = {
  error?: string;
  success?: string;
};

export const emptyFormState: FormState = {};

export function formString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
