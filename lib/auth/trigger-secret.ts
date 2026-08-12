const SECRET_HEADER = "x-ingest-trigger-secret";

function configuredSecret() {
  const trimmed = process.env.INGEST_TRIGGER_SECRET?.trim();
  return trimmed && !trimmed.includes("xxxxx") ? trimmed : null;
}

async function sha256Bytes(value: string) {
  const data = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

export async function verifyIngestTriggerSecret(headers: Headers): Promise<
  | { ok: true }
  | { ok: false; status: 401 | 404; message: string }
> {
  const expected = configuredSecret();
  if (!expected) {
    return { ok: false, status: 404, message: "Scheduled ingest is not configured." };
  }

  const received = headers.get(SECRET_HEADER)?.trim() ?? "";
  const [expectedHash, receivedHash] = await Promise.all([
    sha256Bytes(expected),
    sha256Bytes(received),
  ]);

  let diff = expectedHash.length ^ receivedHash.length;
  for (let i = 0; i < expectedHash.length; i += 1) {
    diff |= expectedHash[i] ^ (receivedHash[i] ?? 0);
  }

  if (diff !== 0) {
    return { ok: false, status: 401, message: "Invalid scheduled ingest secret." };
  }

  return { ok: true };
}

