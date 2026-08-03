import { describe, expect, it } from "vitest";
import { refusePreviewWrite } from "./preview-guard";

describe("refusePreviewWrite", () => {
  it("lets the account's own roles through", () => {
    for (const role of ["supplier", "exporter", "us_importer", "reviewer"]) {
      expect(refusePreviewWrite(role, "upload evidence")).toBeNull();
    }
  });

  it("lets an unknown or missing role through, so it can never be the only gate", () => {
    expect(refusePreviewWrite(null, "upload evidence")).toBeNull();
    expect(refusePreviewWrite(undefined, "upload evidence")).toBeNull();
  });

  it("refuses an administrator with a 403 naming the action", async () => {
    const response = refusePreviewWrite("administrator", "answer its forms");
    expect(response).not.toBeNull();
    expect(response!.status).toBe(403);

    const body = await response!.json() as { error: string };
    expect(body.error).toContain("answer its forms");
  });
});
