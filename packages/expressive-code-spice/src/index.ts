import type { ExpressiveCodePlugin } from "@expressive-code/core";

interface RenderedBlock {
  properties: {
    className?: unknown;
    [key: string]: unknown;
  };
}

export interface SpiceToken {
  kind: string;
  start: number;
  end: number;
}

export interface SpiceSyntax {
  highlightTokens(line: string): readonly SpiceToken[];
  concealmentRange(line: string): readonly [number, number] | null;
}

export interface SpiceLineAnalysis {
  line: number;
  tokens: SpiceToken[];
  concealment: readonly [number, number] | null;
}

export interface SpiceCodeAnalysis {
  code: string;
  lines: SpiceLineAnalysis[];
}

const validViews = new Set(["source", "spice", "compare"]);

export function analyzeSpiceCode(code: string, syntax: SpiceSyntax): SpiceCodeAnalysis {
  const lines: SpiceLineAnalysis[] = [];
  for (const [line, source] of code.replace(/\r\n/g, "\n").split("\n").entries()) {
    if (/^\s*@(?:[A-Za-z_]|[*])/.test(source)) {
      throw new Error(`Spice code line ${line + 1} is invalid Go; use the canonical // @ form`);
    }
    const tokens = syntax.highlightTokens(source).map((token) => ({ ...token }));
    validateTokens(source, tokens, line);
    if (tokens.length > 0) {
      lines.push({ line, tokens, concealment: syntax.concealmentRange(source) });
    }
  }
  return { code: code.replace(/\r\n/g, "\n"), lines };
}

export function createSpiceCodePlugin(syntax: SpiceSyntax): ExpressiveCodePlugin {
  return {
    name: "Spice valid-Go presentation",
    hooks: {
      postprocessRenderedBlock({ codeBlock, renderData }) {
        if (codeBlock.metaOptions.getBoolean("spice") !== true) return;
        if (codeBlock.language !== "go") {
          throw new Error("the spice code-block option is valid only for Go source");
        }
        const view = codeBlock.metaOptions.getString("view") ?? "spice";
        if (!validViews.has(view)) throw new Error(`unknown Spice code view ${view}`);
        const analysis = analyzeSpiceCode(codeBlock.code, syntax);
        decorate(renderData.blockAst, analysis, view);
      },
    },
  };
}

function decorate(block: RenderedBlock, analysis: SpiceCodeAnalysis, view: string): void {
  const classes = Array.isArray(block.properties.className)
    ? block.properties.className.map(String)
    : [];
  if (!classes.includes("spice-code-source")) classes.push("spice-code-source");
  block.properties.className = classes;
  block.properties.dataSpiceCode = "true";
  block.properties.dataSpiceView = view;
  block.properties.dataSpiceAnalysis = Buffer.from(JSON.stringify(analysis.lines), "utf8").toString(
    "base64",
  );
  block.properties.dataSpiceSource = Buffer.from(analysis.code, "utf8").toString("base64");
}

function validateTokens(source: string, tokens: SpiceToken[], line: number): void {
  let end = 0;
  for (const token of tokens) {
    if (
      !Number.isInteger(token.start) ||
      !Number.isInteger(token.end) ||
      token.start < end ||
      token.end <= token.start ||
      token.end > source.length ||
      !/^[A-Z][A-Z_]*$/.test(token.kind)
    ) {
      throw new Error(`shared Spice tokenizer returned an invalid token on line ${line + 1}`);
    }
    end = token.end;
  }
}
