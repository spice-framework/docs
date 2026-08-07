import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { SourceManifest } from "../../packages/docs-contract/src/index.ts";
import { calculatePublishableDigest } from "../../packages/source-assembler/src/index.ts";

const fixtureRoot = path.resolve(".generated/tests/source-safety");

afterEach(async () => {
  await rm(fixtureRoot, { recursive: true, force: true });
});

describe("source boundaries", () => {
  test("hashes identical publishable input deterministically", async () => {
    await mkdir(fixtureRoot, { recursive: true });
    const manifest = validManifest([{ source: "README.md", search: true }]);
    await writeFile(path.join(fixtureRoot, "README.md"), "# Safe\n\nA useful safe description.\n");
    await writeFile(path.join(fixtureRoot, "spice-docs.json"), `${JSON.stringify(manifest)}\n`);
    await expect(calculatePublishableDigest(fixtureRoot, manifest)).resolves.toBe(
      await calculatePublishableDigest(fixtureRoot, manifest),
    );
  });

  test("rejects path traversal patterns", async () => {
    await mkdir(fixtureRoot, { recursive: true });
    const manifest = validManifest([{ source: "../outside.md", search: true }]);
    await writeFile(path.join(fixtureRoot, "spice-docs.json"), `${JSON.stringify(manifest)}\n`);
    await expect(calculatePublishableDigest(fixtureRoot, manifest)).rejects.toThrow(/unsafe/);
  });
});

function validManifest(content: SourceManifest["content"]): SourceManifest {
  return {
    schema: 1,
    product: {
      id: "fixture",
      title: "Fixture",
      family: "framework",
      summary: "A deterministic documentation safety fixture.",
      maturity: "preview",
    },
    content,
  };
}
