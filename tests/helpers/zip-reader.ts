import { crc32 } from "node:zlib";

export type ZipEntry = { name: string; data: Buffer; crcOk: boolean; zip64: boolean };

/**
 * Reads a stored (uncompressed) ZIP archive through its central directory,
 * ZIP64 records included, and checks each file's CRC. Test helper only.
 */
export function readZip(bytes: Buffer): { entries: ZipEntry[]; zip64End: boolean } {
  const eocd = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error("no end of central directory");
  let count = bytes.readUInt16LE(eocd + 10);
  let directoryOffset = bytes.readUInt32LE(eocd + 16);
  const zip64End = count === 0xffff || directoryOffset === 0xffffffff;
  if (zip64End) {
    const locator = eocd - 20;
    if (bytes.readUInt32LE(locator) !== 0x07064b50) throw new Error("no ZIP64 locator");
    const record = Number(bytes.readBigUInt64LE(locator + 8));
    if (bytes.readUInt32LE(record) !== 0x06064b50) throw new Error("no ZIP64 end record");
    count = Number(bytes.readBigUInt64LE(record + 32));
    directoryOffset = Number(bytes.readBigUInt64LE(record + 48));
  }

  const entries: ZipEntry[] = [];
  let at = directoryOffset;
  for (let i = 0; i < count; i++) {
    if (bytes.readUInt32LE(at) !== 0x02014b50) throw new Error(`bad central record ${i}`);
    const crc = bytes.readUInt32LE(at + 16);
    let size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    let offset = bytes.readUInt32LE(at + 42);
    const name = bytes.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    let zip64 = false;
    let extra = at + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra < extraEnd) {
      const id = bytes.readUInt16LE(extra);
      const length = bytes.readUInt16LE(extra + 2);
      if (id === 0x0001) {
        zip64 = true;
        let field = extra + 4;
        if (size === 0xffffffff) {
          size = Number(bytes.readBigUInt64LE(field));
          field += 16;
        }
        if (offset === 0xffffffff) offset = Number(bytes.readBigUInt64LE(field));
      }
      extra += 4 + length;
    }
    if (bytes.readUInt32LE(offset) !== 0x04034b50) throw new Error(`bad local header for ${name}`);
    const start = offset + 30 + bytes.readUInt16LE(offset + 26) + bytes.readUInt16LE(offset + 28);
    const data = bytes.subarray(start, start + size);
    entries.push({ name, data, crcOk: crc32(data) === crc, zip64 });
    at = extraEnd + commentLength;
  }
  return { entries, zip64End };
}

export async function collect(chunks: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Uint8Array[] = [];
  for await (const chunk of chunks) parts.push(chunk);
  return Buffer.concat(parts);
}
