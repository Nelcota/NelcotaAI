import { useMemo } from "react";
import { renderSVG } from "uqr";

// Four modules of quiet zone keep the code readable by banking apps.
const QUIET_ZONE_MODULES = 4;
const IMAGE_SIZE = 180;

interface QrCodeProps {
  readonly value: string;
  readonly label: string;
  readonly className?: string;
}

/** Renders a black-on-white QR code with an accessible image description. */
export function QrCode({ value, label, className }: QrCodeProps) {
  const source = useMemo(
    () =>
      `data:image/svg+xml,${encodeURIComponent(renderSVG(value, { ecc: "M", border: QUIET_ZONE_MODULES }))}`,
    [value],
  );

  return (
    <img src={source} alt={label} width={IMAGE_SIZE} height={IMAGE_SIZE} className={className} />
  );
}
