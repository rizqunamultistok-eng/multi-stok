export function normalizeItemCode(value: string): string {
  return value.trim().toUpperCase();
}

export function isValidItemCode(value: string): boolean {
  return /^[A-Z0-9]+$/.test(normalizeItemCode(value));
}