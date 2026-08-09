export function decodeBase64(input: string): Uint8Array {
  const trimmed = input.trim();
  if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(trimmed)) throw new Error("Invalid Base64 Jstris action stream.");
  let normalized = trimmed.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/g, "");
  if (normalized.length % 4 === 1) throw new Error("Invalid Base64 Jstris action stream length.");
  normalized += "=".repeat((4 - (normalized.length % 4)) % 4);
  try {
    const binary = atob(normalized); const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch { throw new Error("Invalid Base64 Jstris action stream."); }
}


