import { describe, expect, test } from "vitest";
import { renderMaterializerLock } from "../../scripts/render-materializer-lock.mjs";

const commit = "a".repeat(40);

function lock() {
  return {
    schema: 1,
    snapshot: "ecosystem-test",
    catalog: { repository: "spice-framework/development", commit },
    sources: [
      { repository: "spice-framework/spice", commit: "b".repeat(40) },
      { repository: "spice-framework/development", commit },
    ],
  };
}

describe("generic snapshot lock adapter", () => {
  test("preserves exact commits and renders catalog-local repository names", () => {
    expect(renderMaterializerLock(lock())).toEqual({
      schema: 1,
      snapshot: "ecosystem-test",
      sources: [
        { repository: "development", commit },
        { repository: "spice", commit: "b".repeat(40) },
      ],
    });
  });

  test("rejects duplicate, malformed, and inconsistent source identities", () => {
    const duplicate = lock();
    duplicate.sources.push({ repository: "spice-framework/spice", commit: "c".repeat(40) });
    expect(() => renderMaterializerLock(duplicate)).toThrow("duplicate ecosystem repository spice");

    const malformed = lock();
    malformed.sources[0].repository = "other/spice";
    expect(() => renderMaterializerLock(malformed)).toThrow("invalid canonical repository");

    const inconsistent = lock();
    inconsistent.catalog.commit = "d".repeat(40);
    expect(() => renderMaterializerLock(inconsistent)).toThrow(
      "ecosystem catalog and development source commits must match",
    );
  });
});
