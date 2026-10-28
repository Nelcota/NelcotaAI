import { cn } from "cn";

interface InitialAvatarProps {
  /** Name whose first letter is shown; empty or null shows a question mark. */
  readonly name: string | null | undefined;
  readonly className?: string;
}

/** Square tile with the first letter of a name, decorative: the name itself is shown beside it. */
export function InitialAvatar({ name, className }: InitialAvatarProps) {
  const initial = name?.trim().at(0)?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-base font-semibold text-brand",
        className,
      )}
    >
      {initial}
    </span>
  );
}
