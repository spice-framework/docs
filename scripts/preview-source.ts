import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import {
  ecosystemLockSchema,
  parseContract,
  sourceManifestSchema,
  sourceMapSchema,
} from "../packages/docs-contract/src/index.ts";
import { assemble, calculatePublishableDigest } from "../packages/source-assembler/src/index.ts";

const execFileAsync = promisify(execFile);
const root = path.resolve(
  new URL("..", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1"),
);
const { values } = parseArgs({
  options: {
    source: { type: "string" },
    repository: { type: "string" },
    commit: { type: "string" },
  },
});
if (!values.source || !values.repository || !values.commit) {
  throw new Error("--source, --repository, and --commit are required");
}
if (!/^spice-framework\/[a-z0-9.-]+$/.test(values.repository)) {
  throw new Error("repository is outside spice-framework");
}
if (!/^[0-9a-f]{40}$/.test(values.commit)) throw new Error("commit must be a full lowercase SHA");

const sourceRoot = path.resolve(values.source);
const sourceMap = parseContract(
  sourceMapSchema,
  JSON.parse(await readFile(path.join(root, "config", "source-map.json"), "utf8")),
  "source map",
);
const mapping = sourceMap.sources.find((entry) => entry.repository === values.repository);
if (!mapping) throw new Error(`${values.repository} is not a portal source`);
const manifestFile = path.join(sourceRoot, "spice-docs.json");
const manifestBytes = await readFile(manifestFile);
const manifest = parseContract(
  sourceManifestSchema,
  JSON.parse(manifestBytes.toString("utf8")),
  `${values.repository} manifest`,
);
if (manifest.product.id !== mapping.productId || manifest.product.family !== mapping.family) {
  throw new Error("overlay manifest identity does not match the central source map");
}

const lock = parseContract(
  ecosystemLockSchema,
  JSON.parse(await readFile(path.join(root, "sources", "ecosystem.lock.json"), "utf8")),
  "ecosystem lock",
);
const entry = lock.sources.find((source) => source.repository === values.repository);
if (!entry) throw new Error(`${values.repository} is absent from the ecosystem lock`);
entry.commit = values.commit;
entry.manifestSha256 = digest(manifestBytes);
entry.contentSha256 = await calculatePublishableDigest(sourceRoot, manifest);
if (values.repository === "spice-framework/development") {
  const catalog = await readFile(path.join(sourceRoot, sourceMap.catalog.path));
  lock.catalog.commit = values.commit;
  lock.catalog.sha256 = digest(catalog);
}
lock.snapshot = `preview-${values.repository.split("/")[1]}-${values.commit.slice(0, 12)}`;
lock.generatedAt = new Date().toISOString();
ecosystemLockSchema.parse(lock);
const previewLock = path.join(root, ".generated", "ecosystem.preview.lock.json");
await mkdir(path.dirname(previewLock), { recursive: true });
await writeFile(previewLock, `${JSON.stringify(lock, null, 2)}\n`, "utf8");

const result = await assemble({
  root,
  lockFile: previewLock,
  sourceOverrides: new Map([[values.repository, sourceRoot]]),
});
const environment = { ...process.env };
if (values.repository === "spice-framework/chrome") {
  environment.SPICE_CHROME_SOURCE_ROOT = sourceRoot;
}
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("preview:source must run through the locked pnpm package script");
await execFileAsync(process.execPath, [pnpm, "exec", "astro", "build"], {
  cwd: root,
  env: environment,
  maxBuffer: 32 * 1024 * 1024,
});
await execFileAsync(process.execPath, [pnpm, "exec", "pagefind", "--site", "dist"], {
  cwd: root,
  env: environment,
  maxBuffer: 32 * 1024 * 1024,
});
const evidenceRoot = path.join(root, ".artifacts", "source-preview");
await mkdir(evidenceRoot, { recursive: true });
await writeFile(
  path.join(evidenceRoot, "summary.json"),
  `${JSON.stringify(
    {
      repository: values.repository,
      commit: values.commit,
      snapshot: result.snapshot,
      pages: result.pages.length,
      routes: result.routes.length,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(`Built ${result.snapshot} with ${result.routes.length} routes.\n`);

function digest(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
