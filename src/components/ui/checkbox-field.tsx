type CheckboxFieldProps = {
  label: string;
  name: string;
  defaultChecked?: boolean;
  hint?: string;
};

export function CheckboxField({ label, name, defaultChecked, hint }: CheckboxFieldProps) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="mt-1 size-5 shrink-0 accent-accent"
      />
      <span>
        <span className="font-medium">{label}</span>
        {hint ? <span className="block text-sm text-muted">{hint}</span> : null}
      </span>
    </label>
  );
}
