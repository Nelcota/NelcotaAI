import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

interface SegmentedControlProps<Value extends string> {
  readonly label: string;
  readonly options: readonly { readonly value: Value; readonly label: string }[];
  readonly value: Value;
  readonly onChange: (value: Value) => void;
}

/** Single-choice pill switch, such as a period picker, with the active option in orange. */
export function SegmentedControl<Value extends string>({
  label,
  options,
  value,
  onChange,
}: SegmentedControlProps<Value>) {
  return (
    <ToggleGroup
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next);
        if (option != null) {
          onChange(option.value);
        }
      }}
      className="gap-1 rounded-full border bg-secondary/60 p-1"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="h-9 rounded-full px-4 text-sm font-semibold text-muted-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
