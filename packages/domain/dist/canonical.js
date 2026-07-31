function normalize(value) {
    if (Array.isArray(value))
        return value.map(normalize);
    if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nested]) => [key, normalize(nested)]));
    }
    return value;
}
export function canonicalStringify(value) {
    return JSON.stringify(normalize(value));
}
export async function sha256Canonical(value) {
    const bytes = new TextEncoder().encode(canonicalStringify(value));
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
//# sourceMappingURL=canonical.js.map