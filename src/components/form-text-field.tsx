import type { AnyFieldApi } from "@tanstack/react-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

interface FormTextFieldProps {
  readonly field: AnyFieldApi;
  readonly label: string;
  readonly type?: "email" | "password" | "text";
  readonly autoComplete: string;
  readonly inputMode?: "text" | "decimal" | "numeric" | "email";
  readonly placeholder?: string;
  readonly description?: string;
}

/**
 * A labelled TanStack Form input. The validation message and the description are linked with
 * `aria-describedby`, and the error is announced as soon as it appears.
 */
export function FormTextField({
  field,
  label,
  type = "text",
  autoComplete,
  inputMode,
  placeholder,
  description,
}: FormTextFieldProps) {
  const errorId = `${field.name}-error`;
  const descriptionId = `${field.name}-description`;
  const isInvalid = field.state.meta.isTouched && field.state.meta.isValid === false;
  const value: unknown = field.state.value;
  const describedBy = [description == null ? null : descriptionId, isInvalid ? errorId : null]
    .filter((id) => id != null)
    .join(" ");

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{label}</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        value={typeof value === "string" ? value : ""}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        aria-invalid={isInvalid}
        aria-describedby={describedBy === "" ? undefined : describedBy}
      />
      {description != null && <FieldDescription id={descriptionId}>{description}</FieldDescription>}
      {isInvalid && <FieldError id={errorId} errors={field.state.meta.errors} />}
    </Field>
  );
}
