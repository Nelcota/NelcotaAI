import type { AnyFieldApi } from "@tanstack/react-form";
import { cn } from "cn";
import { EyeIcon, EyeOffIcon, type LucideIcon } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useState } from "react";

import { firstErrorMessage } from "@/shared/form-errors";

interface AuthTextFieldProps {
  readonly field: AnyFieldApi;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly type: "email" | "password" | "text";
  readonly autoComplete: string;
  readonly inputMode?: "text" | "numeric" | "email";
  readonly placeholder?: string;
  /** Link or button aligned to the right of the label, like "Esqueci minha senha". */
  readonly labelAction?: ReactNode;
  /** Help shown under the input while there is no error, like the password rules. */
  readonly hint?: ReactNode;
  /** Reformats what is typed before it reaches the form, like a CPF/CNPJ mask. */
  readonly formatValue?: (text: string) => string;
}

/**
 * Large input of the sign-in screens: icon, show/hide for passwords and a Caps Lock warning.
 * Errors and hints are linked with `aria-describedby` and announced as they appear.
 */
export function AuthTextField({
  field,
  label,
  icon: Icon,
  type,
  autoComplete,
  inputMode,
  placeholder,
  labelAction,
  hint,
  formatValue,
}: AuthTextFieldProps) {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isCapsLockOn, setIsCapsLockOn] = useState(false);
  const isPassword = type === "password";
  const isInvalid = field.state.meta.isTouched && field.state.meta.isValid === false;
  const value: unknown = field.state.value;
  const inputId = `auth-${field.name}`;
  const errorId = `${inputId}-error`;
  const capsLockId = `${inputId}-caps-lock`;
  const hintId = `${inputId}-hint`;
  const errorMessage = firstErrorMessage(field.state.meta.errors);
  const showsHint = hint != null && isInvalid === false;
  const describedBy = [
    isInvalid ? errorId : null,
    showsHint ? hintId : null,
    isCapsLockOn ? capsLockId : null,
  ]
    .filter((id) => id != null)
    .join(" ");

  function detectCapsLock(event: KeyboardEvent<HTMLInputElement>) {
    if (isPassword) {
      setIsCapsLockOn(event.getModifierState("CapsLock"));
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <Icon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          id={inputId}
          name={field.name}
          type={isPassword && isRevealed ? "text" : type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          placeholder={placeholder}
          value={typeof value === "string" ? value : ""}
          onBlur={field.handleBlur}
          onChange={(event) => {
            const text = event.target.value;
            field.handleChange(formatValue == null ? text : formatValue(text));
          }}
          onKeyUp={detectCapsLock}
          onKeyDown={detectCapsLock}
          aria-invalid={isInvalid}
          aria-describedby={describedBy === "" ? undefined : describedBy}
          className={cn(
            "h-13 w-full rounded-2xl border bg-secondary/50 pr-4 pl-12 text-base transition-colors outline-none placeholder:text-muted-foreground/70",
            "focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/20",
            "aria-invalid:border-negative aria-invalid:ring-negative/15",
            isPassword && "pr-13",
          )}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setIsRevealed((revealed) => revealed === false)}
            aria-label={isRevealed ? "Ocultar senha" : "Mostrar senha"}
            aria-pressed={isRevealed}
            aria-controls={inputId}
            className="absolute top-1/2 right-2 flex size-9 -translate-y-1/2 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {isRevealed ? (
              <EyeOffIcon aria-hidden="true" className="size-5" />
            ) : (
              <EyeIcon aria-hidden="true" className="size-5" />
            )}
          </button>
        )}
      </div>
      {showsHint && (
        <div id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </div>
      )}
      <div aria-live="polite" className="flex flex-col gap-1 empty:hidden">
        {isInvalid && errorMessage != null && (
          <p id={errorId} className="text-sm text-negative">
            {errorMessage}
          </p>
        )}
        {isCapsLockOn && (
          <p id={capsLockId} className="text-sm text-brand">
            Caps Lock está ativado.
          </p>
        )}
      </div>
    </div>
  );
}
