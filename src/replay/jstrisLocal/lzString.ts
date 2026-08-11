/*
 * URI-safe LZ-string decompression, adapted from pieroxy/lz-string (MIT).
 * Only the operation required by Jstris replay codes is included.
 */

const URI_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$';
const reverseCache = new Map<string, Map<string, number>>();

export class LzDecompressionLimitError extends Error {
  constructor() { super('Jstris replay payload is too large.'); }
}

function alphabetIndex(alphabet: string, char: string): number {
  let reverse = reverseCache.get(alphabet);
  if (!reverse) {
    reverse = new Map<string, number>();
    for (let i = 0; i < alphabet.length; i += 1) reverse.set(alphabet.charAt(i), i);
    reverseCache.set(alphabet, reverse);
  }
  return reverse.get(char) ?? 0;
}

export function decompressFromEncodedURIComponent(input: string, maxOutputBytes = Number.POSITIVE_INFINITY): string | null {
  if (input == null) return null;
  if (input === '') return '';
  const normalized = input.replace(/ /g, '+');
  if (!/^[A-Za-z0-9+\-$]+$/.test(normalized)) return null;
  return decompress(
    normalized.length,
    32,
    (index) => alphabetIndex(URI_ALPHABET, normalized.charAt(index)),
    maxOutputBytes,
  );
}

function decompress(
  length: number,
  resetValue: number,
  getNextValue: (index: number) => number,
  maxOutputBytes: number,
): string | null {
  const dictionary: string[] = [];
  const encoder = new TextEncoder();
  const result: string[] = [];
  const maxDictionaryBytes = Number.isFinite(maxOutputBytes) ? maxOutputBytes * 2 : Number.POSITIVE_INFINITY;
  let outputBytes = 0;
  let dictionaryBytes = 0;
  const appendResult = (value: string) => {
    outputBytes += encoder.encode(value).byteLength;
    if (outputBytes > maxOutputBytes) throw new LzDecompressionLimitError();
    result.push(value);
  };
  const addDictionary = (index: number, value: string) => {
    dictionaryBytes += encoder.encode(value).byteLength;
    if (dictionaryBytes > maxDictionaryBytes) throw new LzDecompressionLimitError();
    dictionary[index] = value;
  };
  let enlargeIn = 4;
  let dictSize = 4;
  let numBits = 3;
  let entry = '';
  let dataValue = getNextValue(0);
  let dataPosition = resetValue;
  let dataIndex = 1;

  const readBits = (count: number): number => {
    let bits = 0;
    let maxpower = 1 << count;
    let power = 1;
    while (power !== maxpower) {
      const resb = dataValue & dataPosition;
      dataPosition >>= 1;
      if (dataPosition === 0) {
        dataPosition = resetValue;
        dataValue = getNextValue(dataIndex++);
      }
      if (resb > 0) bits |= power;
      power <<= 1;
    }
    return bits;
  };

  for (let i = 0; i < 3; i += 1) dictionary[i] = String(i);

  let next = readBits(2);
  let c: string;
  if (next === 0) c = String.fromCharCode(readBits(8));
  else if (next === 1) c = String.fromCharCode(readBits(16));
  else if (next === 2) return '';
  else return null;

  addDictionary(3, c);
  let w = c;
  appendResult(c);

  while (true) {
    if (dataIndex > length) return '';
    let code = readBits(numBits);

    if (code === 0) {
      addDictionary(dictSize++, String.fromCharCode(readBits(8)));
      code = dictSize - 1;
      enlargeIn -= 1;
    } else if (code === 1) {
      addDictionary(dictSize++, String.fromCharCode(readBits(16)));
      code = dictSize - 1;
      enlargeIn -= 1;
    } else if (code === 2) {
      return result.join('');
    }

    if (enlargeIn === 0) {
      enlargeIn = 1 << numBits;
      numBits += 1;
    }

    const dictionaryEntry = dictionary[code];
    if (dictionaryEntry !== undefined) entry = dictionaryEntry;
    else if (code === dictSize) entry = w + w.charAt(0);
    else return null;

    appendResult(entry);
    addDictionary(dictSize++, w + entry.charAt(0));
    enlargeIn -= 1;
    w = entry;

    if (enlargeIn === 0) {
      enlargeIn = 1 << numBits;
      numBits += 1;
    }
  }
}
