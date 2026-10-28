import { ArrowRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/** Full-width primary button of the sign-in screens, with a spinner while submitting. */
export function AuthSubmitButton({
  label,
  isSubmitting,
}: {
  readonly label: string;
  readonly isSubmitting: boolean;
}) {
  return (
    <Button type="submit" disabled={isSubmitting} className="h-13 w-full rounded-2xl text-base">
      {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
      {label}
      {isSubmitting ? null : <ArrowRightIcon data-icon="inline-end" />}
    </Button>
  );
}
