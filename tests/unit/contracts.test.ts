import { describe, expect, test } from "vitest";
import {
  parseContract,
  sourceManifestSchema,
  sourceMapSchema,
} from "../../packages/docs-contract/src/index.ts";
import enrollment from "../../config/enrollment.json";
import sourceMap from "../../config/source-map.json";

describe("documentation contracts", () => {
  test("accepts the reviewed source topology", () => {
    const parsed = parseContract(sourceMapSchema, sourceMap, "source map");
    expect(parsed.sources).toHaveLength(24);
    expect(new Set(parsed.sources.map((source) => source.mount)).size).toBe(24);
  });

  test("every generated enrollment manifest is valid", () => {
    for (const repository of enrollment.repositories) {
      expect(() =>
        sourceManifestSchema.parse({
          $schema: "https://spiceframework.dev/schemas/spice-docs.schema.json",
          schema: 1,
          product: repository.product,
          content: repository.content,
          ...(repository.assets ? { assets: repository.assets } : {}),
          ...(repository.goSnippets
            ? {
                snippets: [
                  {
                    root: ".",
                    include: ["**/*.go"],
                    exclude: ["vendor/**", "internal/spicegen/**", ".generated/**"],
                  },
                ],
              }
            : {}),
        }),
      ).not.toThrow();
    }
  });

  test("rejects executable or undeclared manifest fields", () => {
    expect(() =>
      sourceManifestSchema.parse({
        schema: 1,
        product: {
          id: "unsafe",
          title: "Unsafe",
          family: "framework",
          summary: "This manifest attempts to add a build command.",
          maturity: "preview",
        },
        content: [{ source: "README.md" }],
        build: "node source-owned-code.js",
      }),
    ).toThrow();
  });

  test("rejects noncanonical local routes", () => {
    const repository = enrollment.repositories[0];
    expect(() =>
      sourceManifestSchema.parse({
        schema: 1,
        product: repository.product,
        content: [{ source: "README.md", route: "../escape" }],
      }),
    ).toThrow(/clean lowercase local route/);
  });
});
