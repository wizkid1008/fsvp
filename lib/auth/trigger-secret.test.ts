import { afterEach, describe, expect, it } from "vitest";
import { verifyIngestTriggerSecret } from "./trigger-secret";

const ORIGINAL_SECRET = process.env.INGEST_TRIGGER_SECRET;

function headers(secret?: string) {
  const h = new Headers();
  if (secret !== undefined) h.set("x-ingest-trigger-secret", secret);
  return h;
}

afterEach(() => {
  process.env.INGEST_TRIGGER_SECRET = ORIGINAL_SECRET;
});

describe("verifyIngestTriggerSecret", () => {
  it("disables the machine endpoint when no secret is configured", async () => {
    delete process.env.INGEST_TRIGGER_SECRET;

    await expect(verifyIngestTriggerSecret(headers("anything"))).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("treats placeholder secrets as unset", async () => {
    process.env.INGEST_TRIGGER_SECRET = "xxxxx-replace-me";

    await expect(verifyIngestTriggerSecret(headers("xxxxx-replace-me"))).resolves.toMatchObject({
      ok: false,
      status: 404,
    });
  });

  it("rejects a missing or incorrect header", async () => {
    process.env.INGEST_TRIGGER_SECRET = "real-secret";

    await expect(verifyIngestTriggerSecret(headers())).resolves.toMatchObject({
      ok: false,
      status: 401,
    });
    await expect(verifyIngestTriggerSecret(headers("wrong"))).resolves.toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("accepts the configured secret", async () => {
    process.env.INGEST_TRIGGER_SECRET = "real-secret";

    await expect(verifyIngestTriggerSecret(headers("real-secret"))).resolves.toEqual({ ok: true });
  });
});

