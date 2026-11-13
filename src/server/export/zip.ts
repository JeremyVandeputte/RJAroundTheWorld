// Minimal ZIP writer, streamed: an archive of several gigabytes (videos) is
// never held in memory.
//
// Files are stored as is, without compression: photos and videos are already
// compressed, and storing keeps the archive fast to build and to open. The
// CRC of each file is computed in a first read, so sizes and CRC are written
// before the data (the most compatible layout). ZIP64 records are added only
// when a size, an offset or the number of files exceeds the classic limits.

import { createReadStream } from "node:fs";
import { crc32 } from "node:zlib";

export type ZipSource = {
  /** Path inside the archive, with "/" separators. */
  name: string;
  modifiedAt: Date;
} & ({ data: Uint8Array } | { path: string; size: number });

export type ZipLimits = {
  /** Values reaching this need ZIP64 (only lowered by tests). */
  max32: number;
  /** Number of files reaching this needs ZIP64 (only lowered by tests). */
  max16: number;
};

const CLASSIC_LIMITS: ZipLimits = { max32: 0xffffffff, max16: 0xffff };
const UTF8_NAMES = 0x0800;
const STORED = 0;

class Writer {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private offset = 0;
  constructor(size: number) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }
  u16(value: number) {
    this.view.setUint16(this.offset, value, true);
    this.offset += 2;
    return this;
  }
  u32(value: number) {
    this.view.setUint32(this.offset, value >>> 0, true);
    this.offset += 4;
    return this;
  }
  u64(value: number) {
    this.view.setBigUint64(this.offset, BigInt(value), true);
    this.offset += 8;
    return this;
  }
  raw(data: Uint8Array) {
    this.bytes.set(data, this.offset);
    this.offset += data.length;
    return this;
  }
  done(): Uint8Array {
    if (this.offset !== this.bytes.length) throw new Error(`ZIP record size mismatch: ${this.offset} / ${this.bytes.length}`);
    return this.bytes;
  }
}

/**
 * MS-DOS date and time, as stored in ZIP headers: local time of the server
 * (ZIP has no timezone), two-second precision.
 */
function dosDateTime(date: Date): { date: number; time: number } {
  const year = Math.min(Math.max(date.getFullYear(), 1980), 2107);
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

async function fileCrc(path: string): Promise<{ crc: number; size: number }> {
  let crc = 0;
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    crc = crc32(chunk as Buffer, crc);
    size += (chunk as Buffer).length;
  }
  return { crc, size };
}

type Written = { name: Uint8Array; crc: number; size: number; offset: number; dos: { date: number; time: number } };

/** The archive, chunk by chunk. A file that changes while being read aborts it. */
export async function* zipStream(sources: Iterable<ZipSource>, limits: ZipLimits = CLASSIC_LIMITS): AsyncGenerator<Uint8Array> {
  const written: Written[] = [];
  let offset = 0;
  const encoder = new TextEncoder();

  for (const source of sources) {
    const name = encoder.encode(source.name);
    const { crc, size } = "data" in source ? { crc: crc32(source.data), size: source.data.length } : await fileCrc(source.path);
    if ("path" in source && size !== source.size) throw new Error(`File changed while exporting: ${source.name}`);
    const dos = dosDateTime(source.modifiedAt);
    const big = size >= limits.max32;

    const header = new Writer(30 + name.length + (big ? 20 : 0))
      .u32(0x04034b50)
      .u16(big ? 45 : 20)
      .u16(UTF8_NAMES)
      .u16(STORED)
      .u16(dos.time)
      .u16(dos.date)
      .u32(crc)
      .u32(big ? 0xffffffff : size)
      .u32(big ? 0xffffffff : size)
      .u16(name.length)
      .u16(big ? 20 : 0)
      .raw(name);
    if (big) header.u16(0x0001).u16(16).u64(size).u64(size);
    const headerBytes = header.done();
    yield headerBytes;

    if ("data" in source) {
      if (source.data.length > 0) yield source.data;
    } else {
      let read = 0;
      for await (const chunk of createReadStream(source.path)) {
        read += (chunk as Buffer).length;
        yield chunk as Buffer;
      }
      if (read !== size) throw new Error(`File changed while exporting: ${source.name}`);
    }

    written.push({ name, crc, size, offset, dos });
    offset += headerBytes.length + size;
  }

  // Central directory.
  const directoryOffset = offset;
  let directorySize = 0;
  for (const file of written) {
    const bigSize = file.size >= limits.max32;
    const bigOffset = file.offset >= limits.max32;
    const extraLength = bigSize || bigOffset ? 4 + (bigSize ? 16 : 0) + (bigOffset ? 8 : 0) : 0;
    const record = new Writer(46 + file.name.length + extraLength)
      .u32(0x02014b50)
      .u16(45)
      .u16(bigSize || bigOffset ? 45 : 20)
      .u16(UTF8_NAMES)
      .u16(STORED)
      .u16(file.dos.time)
      .u16(file.dos.date)
      .u32(file.crc)
      .u32(bigSize ? 0xffffffff : file.size)
      .u32(bigSize ? 0xffffffff : file.size)
      .u16(file.name.length)
      .u16(extraLength)
      .u16(0) // comment
      .u16(0) // disk
      .u16(0) // internal attributes
      .u32(0) // external attributes
      .u32(bigOffset ? 0xffffffff : file.offset)
      .raw(file.name);
    if (extraLength > 0) {
      record.u16(0x0001).u16(extraLength - 4);
      if (bigSize) record.u64(file.size).u64(file.size);
      if (bigOffset) record.u64(file.offset);
    }
    const bytes = record.done();
    directorySize += bytes.length;
    yield bytes;
  }

  const count = written.length;
  const needs64 = count >= limits.max16 || directoryOffset >= limits.max32 || directorySize >= limits.max32;
  if (needs64) {
    const zip64EndOffset = directoryOffset + directorySize;
    yield new Writer(56)
      .u32(0x06064b50)
      .u64(44)
      .u16(45)
      .u16(45)
      .u32(0)
      .u32(0)
      .u64(count)
      .u64(count)
      .u64(directorySize)
      .u64(directoryOffset)
      .done();
    yield new Writer(20).u32(0x07064b50).u32(0).u64(zip64EndOffset).u32(1).done();
  }
  yield new Writer(22)
    .u32(0x06054b50)
    .u16(0)
    .u16(0)
    .u16(needs64 ? 0xffff : count)
    .u16(needs64 ? 0xffff : count)
    .u32(needs64 ? 0xffffffff : directorySize)
    .u32(needs64 ? 0xffffffff : directoryOffset)
    .u16(0)
    .done();
}
