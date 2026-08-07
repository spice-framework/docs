import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { sourceManifestSchema } from "../packages/docs-contract/src/index.ts";

interface Enrollment {
  repository: string;
  product: unknown;
  content: unknown[];
  assets?: string[];
  goSnippets?: boolean;
}

const { values } = parseArgs({
  options: {
    repository: { type: "string" },
    root: { type: "string" },
    phase: { type: "string", default: "manifest" },
    workflow: { type: "string" },
    docs: { type: "string" },
    check: { type: "boolean", default: false },
  },
});

if (!values.repository || !values.root) {
  throw new Error(
    "usage: enroll-source --repository spice-framework/name --root PATH [--phase manifest|workflow]",
  );
}
const repository = values.repository;
const repositoryRoot = path.resolve(values.root);
const configuration = JSON.parse(
  await readFile(new URL("../config/enrollment.json", import.meta.url), "utf8"),
) as { schema: number; repositories: Enrollment[] };
if (configuration.schema !== 1) throw new Error("unsupported enrollment configuration schema");
const enrollment = configuration.repositories.find((entry) => entry.repository === repository);
if (!enrollment) throw new Error(`no enrollment configuration for ${repository}`);

if (values.phase === "manifest") {
  const manifest = sourceManifestSchema.parse({
    $schema: "https://spiceframework.dev/schemas/spice-docs.schema.json",
    schema: 1,
    product: enrollment.product,
    content: enrollment.content,
    ...(enrollment.assets ? { assets: enrollment.assets } : {}),
    ...(enrollment.goSnippets
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
  });
  await emit(
    path.join(repositoryRoot, "spice-docs.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
} else if (values.phase === "workflow") {
  const workflow = requireCommit(values.workflow, "workflow");
  const docs = requireCommit(values.docs, "docs");
  const body = `name: Documentation\n\non:\n  push:\n    branches: [main]\n    paths:\n      - spice-docs.json\n      - "**/*.md"\n      - "**/*.go"\n      - "docs/**"\n      - "profile/**"\n      - "store/assets/**"\n  pull_request:\n    branches: [main]\n    paths:\n      - spice-docs.json\n      - "**/*.md"\n      - "**/*.go"\n      - "docs/**"\n      - "profile/**"\n      - "store/assets/**"\n  workflow_dispatch:\n\npermissions:\n  contents: read\n\njobs:\n  documentation:\n    uses: spice-framework/.github/.github/workflows/docs-source.yml@${workflow}\n    with:\n      docs_commit: ${docs}\n`;
  await emit(path.join(repositoryRoot, ".github", "workflows", "docs.yml"), body);
} else {
  throw new Error(`unknown phase ${values.phase}`);
}

async function emit(file: string, expected: string): Promise<void> {
  let actual: string | undefined;
  try {
    actual = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  if (actual === expected) return;
  if (values.check) throw new Error(`${file} is missing or stale`);
  if (actual !== undefined) throw new Error(`${file} already exists with different content`);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, expected, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`created ${file}\n`);
}

function requireCommit(value: string | undefined, name: string): string {
  if (!value || !/^[0-9a-f]{40}$/.test(value)) {
    throw new Error(`${name} must be a lowercase full Git commit`);
  }
  return value;
}
