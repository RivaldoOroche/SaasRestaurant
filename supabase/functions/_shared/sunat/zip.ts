// ZIP mínimo (método "store", sin compresión) — SUNAT acepta el XML comprimido
// así. Portable (Uint8Array puro) para Deno, Node y Vitest.

function crc32(buf: Uint8Array): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function u16(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff];
}
function u32(n: number): number[] {
  return [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];
}

/** Empaqueta un archivo (nombre + contenido) en un ZIP store-only. */
export function zipStore(filename: string, content: Uint8Array): Uint8Array {
  const nameBytes = new TextEncoder().encode(filename);
  const crc = crc32(content);
  const size = content.length;

  const local = [
    ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
    ...u32(crc), ...u32(size), ...u32(size),
    ...u16(nameBytes.length), ...u16(0),
    ...nameBytes,
  ];
  const withData = [...local, ...content];

  const central = [
    ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
    ...u32(crc), ...u32(size), ...u32(size),
    ...u16(nameBytes.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
    ...u32(0), ...u32(0),
    ...nameBytes,
  ];

  const centralOffset = withData.length;
  const end = [
    ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(1), ...u16(1),
    ...u32(central.length), ...u32(centralOffset), ...u16(0),
  ];

  return new Uint8Array([...withData, ...central, ...end]);
}
