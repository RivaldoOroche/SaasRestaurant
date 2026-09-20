import { useMemo } from "react";
import QRCode from "qrcode";

/** Renderiza un código QR como SVG (sin canvas ni innerHTML), a partir de un texto. */
export function Qr({ value, size = 72 }: { value: string; size?: number }) {
  const { n, cells } = useMemo(() => {
    try {
      const qr = QRCode.create(value || " ", { errorCorrectionLevel: "M" });
      const size = qr.modules.size;
      const data = qr.modules.data;
      const out: { r: number; c: number }[] = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (data[r * size + c]) out.push({ r, c });
        }
      }
      return { n: size, cells: out };
    } catch {
      return { n: 0, cells: [] as { r: number; c: number }[] };
    }
  }, [value]);

  if (!n) return null;
  const cell = size / n;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Código QR">
      <rect width={size} height={size} fill="#fff" />
      <g fill="#111">
        {cells.map(({ r, c }, i) => (
          <rect key={i} x={c * cell} y={r * cell} width={cell} height={cell} />
        ))}
      </g>
    </svg>
  );
}
