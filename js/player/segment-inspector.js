const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const TS_PACKET_SIZE = 188;
const CRC_TABLE = (function createCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function asBytes(data) {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  return null;
}

function hasSignature(bytes, signature) {
  if (bytes.length < signature.length) {
    return false;
  }
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) {
      return false;
    }
  }
  return true;
}

function readUint32(bytes, offset) {
  return bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3];
}

function chunkName(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

function crc32(bytes, start, end) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc = CRC_TABLE[(crc ^ bytes[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validateTransportStream(bytes) {
  if (bytes.length < TS_PACKET_SIZE * 2 || bytes.length % TS_PACKET_SIZE !== 0) {
    return false;
  }
  const packetCount = Math.min(5, bytes.length / TS_PACKET_SIZE);
  for (let packet = 0; packet < packetCount; packet += 1) {
    if (bytes[packet * TS_PACKET_SIZE] !== 0x47) {
      return false;
    }
  }
  return true;
}

function findPngTrailerStart(bytes) {
  let offset = PNG_SIGNATURE.length;
  let foundHeader = false;

  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const typeOffset = offset + 4;
    const payloadOffset = typeOffset + 4;
    if (length > bytes.length - payloadOffset - 4) {
      throw new Error("PNG chunk extends beyond the segment boundary.");
    }

    const name = chunkName(bytes, typeOffset);
    const crcOffset = payloadOffset + length;
    const expectedCrc = readUint32(bytes, crcOffset);
    if (crc32(bytes, typeOffset, crcOffset) !== expectedCrc) {
      throw new Error("PNG chunk checksum is invalid.");
    }

    if (!foundHeader) {
      if (name !== "IHDR" || length !== 13) {
        throw new Error("PNG does not begin with a valid IHDR chunk.");
      }
      foundHeader = true;
    } else if (name === "IHDR") {
      throw new Error("PNG contains a duplicate IHDR chunk.");
    }

    offset = crcOffset + 4;
    if (name === "IEND") {
      if (length !== 0) {
        throw new Error("PNG IEND chunk must have an empty payload.");
      }
      return offset;
    }
  }

  throw new Error("PNG IEND chunk is missing or truncated.");
}

export function inspectSegment(data) {
  const bytes = asBytes(data);
  if (!bytes || !bytes.length) {
    return { kind: "unknown", data: data };
  }

  if (validateTransportStream(bytes)) {
    return { kind: "mpeg-ts", data: data };
  }

  if (bytes.length >= 8 &&
      (chunkName(bytes, 4) === "ftyp" || chunkName(bytes, 4) === "styp" ||
       chunkName(bytes, 4) === "moof")) {
    return { kind: "fragmented-mp4", data: data };
  }

  if (!hasSignature(bytes, PNG_SIGNATURE)) {
    return { kind: "unknown", data: data };
  }

  const trailerStart = findPngTrailerStart(bytes);
  const trailer = bytes.subarray(trailerStart);
  if (!validateTransportStream(trailer)) {
    throw new Error("PNG segment has no valid trailing MPEG-TS payload.");
  }

  const recovered = trailer.slice();
  return {
    kind: "png-wrapped-mpeg-ts",
    data: recovered.buffer,
    pngBytes: trailerStart,
    transportStreamBytes: recovered.length
  };
}
