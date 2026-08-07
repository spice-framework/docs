import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  analyzeSpiceCode,
  createSpiceCodePlugin,
  type SpiceSyntax,
} from "../../packages/expressive-code-spice/src/index.ts";

const require = createRequire(import.meta.url);
const syntax = require(
  path.resolve(".generated/sources/chrome/packages/spice-syntax/src/index.cjs"),
) as SpiceSyntax;
const corpus = require(
  path.resolve(".generated/sources/chrome/packages/spice-syntax/fixtures/syntax-corpus.json"),
) as {
  cases: Array<{
    source: string;
    tokens: Array<{ kind: string; start: number; end: number; text: string }>;
    concealment: [number, number] | null;
  }>;
};

describe("Spice code presentation", () => {
  test("uses the exact locked Chrome tokenizer corpus", () => {
    for (const fixture of corpus.cases) {
      const analysis = analyzeSpiceCode(fixture.source, syntax);
      const line = analysis.lines[0];
      expect(line?.tokens ?? []).toEqual(fixture.tokens.map(({ text: _, ...token }) => token));
      expect(line?.concealment ?? null).toEqual(fixture.concealment);
    }
  });

  test("keeps canonical source bytes in its analysis", () => {
    const code = '// @Controller(prefix="/users")\ntype Controller struct{}';
    expect(analyzeSpiceCode(code, syntax).code).toBe(code);
  });

  test("rejects naked annotations that are invalid Go", () => {
    expect(() => analyzeSpiceCode("@Controller\ntype Controller struct{}", syntax)).toThrow(
      /canonical \/\/ @ form/,
    );
  });

  test("constructs one reusable Expressive Code plugin", () => {
    expect(createSpiceCodePlugin(syntax).name).toContain("valid-Go");
  });
});
