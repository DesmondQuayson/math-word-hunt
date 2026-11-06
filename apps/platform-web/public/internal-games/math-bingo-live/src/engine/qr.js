// A small, dependency-free QR Code encoder (ISO/IEC 18004) for the join link
// on the teacher's screen. It runs in the browser: no QR service is ever
// called, so the code works on district networks that only allow MathNexa.
//
// Scope: byte mode (UTF-8), error correction level M (about 15% of the
// symbol can be damaged or covered), versions 1–10 (up to 213 bytes, far
// more than a join link needs), automatic mask choice by the standard
// penalty rules. The algorithm follows the specification; the unit tests
// decode the symbols back with an independent reader.

const MAX_VERSION = 10;
// Level M, versions 1..10: error correction codewords per block, and blocks.
const ECC_PER_BLOCK = [10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOCKS = [1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const FORMAT_LEVEL_M = 0; // format bits: L = 1, M = 0, Q = 3, H = 2

/** Modules available for data and error correction in a version. */
function rawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function dataCodewords(version) {
  return Math.floor(rawDataModules(version) / 8) - ECC_PER_BLOCK[version - 1] * BLOCKS[version - 1];
}

// ------------------------------------------------------------ Reed–Solomon (GF(256), x^8+x^4+x^3+x^2+1)

function gfMultiply(x, y) {
  let z = 0;
  for (let bit = 7; bit >= 0; bit -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> bit) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let index = 0; index < degree; index += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = gfMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMultiply(root, 0x02);
  }
  return result;
}

function rsRemainder(data, divisor) {
  const result = new Array(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    divisor.forEach((coefficient, index) => {
      result[index] ^= gfMultiply(coefficient, factor);
    });
  }
  return result;
}

// ------------------------------------------------------------------ data

function encodeData(bytes, version) {
  const bits = [];
  const push = (value, length) => {
    for (let bit = length - 1; bit >= 0; bit -= 1) bits.push((value >>> bit) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, version <= 9 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);
  const capacity = dataCodewords(version) * 8;
  push(0, Math.min(4, capacity - bits.length)); // terminator
  while (bits.length % 8 !== 0) bits.push(0);
  const codewords = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | bits[index + bit];
    codewords.push(byte);
  }
  for (let pad = 0xec; codewords.length < dataCodewords(version); pad ^= 0xec ^ 0x11) codewords.push(pad);
  return codewords;
}

/** Split into blocks, add error correction, interleave (the standard order). */
function withErrorCorrection(data, version) {
  const blocks = BLOCKS[version - 1];
  const eccLength = ECC_PER_BLOCK[version - 1];
  const raw = Math.floor(rawDataModules(version) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortLength = Math.floor(raw / blocks);
  const divisor = rsDivisor(eccLength);
  const all = [];
  for (let index = 0, offset = 0; index < blocks; index += 1) {
    const length = shortLength - eccLength + (index < shortBlocks ? 0 : 1);
    const block = data.slice(offset, offset + length);
    offset += length;
    const ecc = rsRemainder(block, divisor);
    if (index < shortBlocks) block.push(0);
    all.push(block.concat(ecc));
  }
  const result = [];
  for (let column = 0; column < all[0].length; column += 1) {
    all.forEach((block, index) => {
      if (column !== shortLength - eccLength || index >= shortBlocks) result.push(block[column]);
    });
  }
  return result;
}

// ---------------------------------------------------------------- matrix

function createMatrix(version) {
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => {
    modules[y][x] = dark;
    reserved[y][x] = true;
  };
  // Timing patterns.
  for (let index = 0; index < size; index += 1) {
    set(6, index, index % 2 === 0);
    set(index, 6, index % 2 === 0);
  }
  // Finder patterns with their separators.
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, distance !== 2 && distance !== 4);
      }
    }
  }
  // Alignment patterns.
  const positions = alignmentPositions(version, size);
  const count = positions.length;
  for (let i = 0; i < count; i += 1) {
    for (let j = 0; j < count; j += 1) {
      if ((i === 0 && j === 0) || (i === 0 && j === count - 1) || (i === count - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) set(positions[i] + dx, positions[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
  }
  // Reserve the format areas now (filled per mask) and draw the version blocks.
  drawFormat(set, size, 0);
  if (version >= 7) {
    let remainder = version;
    for (let index = 0; index < 12; index += 1) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
    const bits = (version << 12) | remainder;
    for (let index = 0; index < 18; index += 1) {
      const dark = ((bits >>> index) & 1) === 1;
      const a = size - 11 + (index % 3);
      const b = Math.floor(index / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }
  return { size, modules, reserved, set };
}

function alignmentPositions(version, size) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let position = size - 7; result.length < count; position -= step) result.splice(1, 0, position);
  return result;
}

function formatBits(mask) {
  const data = (FORMAT_LEVEL_M << 3) | mask;
  let remainder = data;
  for (let index = 0; index < 10; index += 1) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  return ((data << 10) | remainder) ^ 0x5412;
}

function drawFormat(set, size, mask) {
  const bits = formatBits(mask);
  const bit = index => ((bits >>> index) & 1) === 1;
  for (let index = 0; index <= 5; index += 1) set(8, index, bit(index));
  set(8, 7, bit(6));
  set(8, 8, bit(7));
  set(7, 8, bit(8));
  for (let index = 9; index < 15; index += 1) set(14 - index, 8, bit(index));
  for (let index = 0; index < 8; index += 1) set(size - 1 - index, 8, bit(index));
  for (let index = 8; index < 15; index += 1) set(8, size - 15 + index, bit(index));
  set(8, size - 8, true); // the dark module
}

function placeCodewords(matrix, codewords) {
  const { size, modules, reserved } = matrix;
  let index = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vertical : vertical;
        if (reserved[y][x] || index >= codewords.length * 8) continue;
        modules[y][x] = ((codewords[index >>> 3] >>> (7 - (index & 7))) & 1) === 1;
        index += 1;
      }
    }
  }
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  x => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
];

function applyMask(matrix, mask) {
  const { size, modules, reserved } = matrix;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) if (!reserved[y][x] && MASKS[mask](x, y)) modules[y][x] = !modules[y][x];
  }
}

/** The standard penalty score (lower is easier to scan). */
function penalty(modules) {
  const size = modules.length;
  let score = 0;
  const lines = [];
  for (let index = 0; index < size; index += 1) {
    lines.push(modules[index]);
    lines.push(modules.map(row => row[index]));
  }
  const finderA = [true, false, true, true, true, false, true, false, false, false, false];
  const finderB = [false, false, false, false, true, false, true, true, true, false, true];
  for (const line of lines) {
    let run = 1;
    for (let index = 1; index <= size; index += 1) {
      if (index < size && line[index] === line[index - 1]) {
        run += 1;
      } else {
        if (run >= 5) score += 3 + (run - 5);
        run = 1;
      }
    }
    for (let index = 0; index + 11 <= size; index += 1) {
      if (finderA.every((value, offset) => line[index + offset] === value) || finderB.every((value, offset) => line[index + offset] === value)) score += 40;
    }
  }
  for (let y = 0; y + 1 < size; y += 1) {
    for (let x = 0; x + 1 < size; x += 1) {
      const value = modules[y][x];
      if (modules[y][x + 1] === value && modules[y + 1][x] === value && modules[y + 1][x + 1] === value) score += 3;
    }
  }
  const dark = modules.reduce((total, row) => total + row.filter(Boolean).length, 0);
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return score;
}

/**
 * Encode text as a QR Code (level M). Returns the module grid
 * (`modules[y][x]`, true = dark), its size, version and mask. The mask is
 * chosen by penalty score; `mask` forces one (tests only).
 */
export function encodeQr(text, { mask: forcedMask = null } = {}) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  let version = 1;
  while (version <= MAX_VERSION && 4 + (version <= 9 ? 8 : 16) + bytes.length * 8 > dataCodewords(version) * 8) version += 1;
  if (version > MAX_VERSION) throw new Error("Text is too long for this QR encoder.");
  const codewords = withErrorCorrection(encodeData(bytes, version), version);
  let best = null;
  for (let mask = 0; mask < 8; mask += 1) {
    if (forcedMask !== null && mask !== forcedMask) continue;
    const matrix = createMatrix(version);
    placeCodewords(matrix, codewords);
    applyMask(matrix, mask);
    drawFormat(matrix.set, matrix.size, mask);
    const score = penalty(matrix.modules);
    if (!best || score < best.score) best = { score, mask, matrix };
  }
  return Object.freeze({
    version,
    size: best.matrix.size,
    mask: best.mask,
    modules: best.matrix.modules.map(row => Object.freeze(row.slice()))
  });
}

/**
 * One SVG path drawing every dark module, offset by a quiet zone of
 * `border` modules (the standard asks for 4). View box: size + 2 * border.
 */
export function qrPath(code, border = 4) {
  const parts = [];
  code.modules.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (!row[x]) continue;
      let end = x;
      while (end + 1 < row.length && row[end + 1]) end += 1;
      parts.push(`M${x + border} ${y + border}h${end - x + 1}v1h-${end - x + 1}z`);
      x = end;
    }
  });
  return parts.join("");
}
