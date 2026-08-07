import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { assemble } from "../../packages/source-assembler/src/index.ts";

describe("ecosystem assembly", () => {
  test("assembles the complete reviewed snapshot with provenance", async () => {
    const generatedRoot = path.resolve(".generated/tests/integration-assembly");
    const result = await assemble({ root: path.resolve("."), generatedRoot });
    expect(result.pages).toHaveLength(183);
    expect(result.routes).toContain("framework/getting-started");
    expect(result.routes).toContain("agent/implementation");
    expect(result.routes).not.toContain("agent/implementation-1index");
    expect(new Set(result.routes).size).toBe(result.routes.length);

    const page = await readFile(
      path.join(result.outputRoot, "content/docs/framework/getting-started/index.md"),
      "utf8",
    );
    expect(page).toMatch(/sourceRepository: spice-framework\/spice/);
    expect(page).toMatch(/sourceCommit: [0-9a-f]{40}/);
    expect(page).toContain("lockedSourceUrl: https://github.com/spice-framework/spice/blob/");
  });
});
