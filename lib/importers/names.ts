export function normalizeImporterName(value: string | null | undefined) {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function importerNameMatches(a: string | null | undefined, b: string | null | undefined) {
  const left = normalizeImporterName(a);
  const right = normalizeImporterName(b);
  return Boolean(left && right && left === right);
}
