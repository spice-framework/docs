import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import {
  type DevelopmentCatalog,
  type EcosystemLock,
  type SourceMap,
  developmentCatalogSchema,
  ecosystemLockSchema,
  parseContract,
  sourceManifestSchema,
  sourceMapSchema,
} from "../packages/docs-contract/src/index.ts";
import { calculatePublishableDigest } from "../packages/source-assembler/src/index.ts";

const execFileAsync = promisify(execFile);
const root = path.resolve(
  new URL("..", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, "$1"),
);
const { values } = parseArgs({
  options: {
    offline: { type: "boolean", default: false },
    check: { type: "boolean", default: false },
    "sources-root": { type: "string" },
  },
});
const sourcesRoot = path.resolve(
  values["sources-root"] ?? path.join(root, ".generated", "sources"),
);
assertWithin(root, sourcesRoot, ".generated source root");
await mkdir(sourcesRoot, { recursive: true });

const sourceMap = parseContract(
  sourceMapSchema,
  JSON.parse(await readFile(path.join(root, "config", "source-map.json"), "utf8")),
  "source map",
);

const commits = new Map<string, string>();
for (const source of [...sourceMap.sources].sort((a, b) =>
  a.repository.localeCompare(b.repository),
)) {
  const directory = path.join(sourcesRoot, source.repository.slice("spice-framework/".length));
  commits.set(source.repository, await materialize(source.repository, directory));
}

const developmentRoot = path.join(sourcesRoot, "development");
const catalogPath = path.join(developmentRoot, sourceMap.catalog.path);
const catalog = parseContract(
  developmentCatalogSchema,
  JSON.parse(await readFile(catalogPath, "utf8")),
  "development catalog",
);
reconcile(sourceMap, catalog);

const sources: EcosystemLock["sources"] = [];
for (const source of [...sourceMap.sources].sort((a, b) =>
  a.repository.localeCompare(b.repository),
)) {
  const repositoryName = source.repository.slice("spice-framework/".length);
  const sourceRoot = path.join(sourcesRoot, repositoryName);
  const manifestFile = path.join(sourceRoot, "spice-docs.json");
  const manifestBytes = await readFile(manifestFile);
  const manifest = parseContract(
    sourceManifestSchema,
    JSON.parse(manifestBytes.toString("utf8")),
    `${source.repository} manifest`,
  );
  if (manifest.product.id !== source.productId || manifest.product.family !== source.family) {
    throw new Error(`${source.repository} manifest identity does not match config/source-map.json`);
  }
  const catalogRepository = requiredCatalogRepository(catalog, repositoryName);
  sources.push({
    repository: source.repository,
    canonicalUrl: catalogRepository.canonical_url,
    commit: required(commits.get(source.repository), source.repository),
    defaultBranch: "main",
    manifest: "spice-docs.json",
    manifestSha256: sha256(manifestBytes),
    contentSha256: await calculatePublishableDigest(sourceRoot, manifest),
    channel: "preview",
  });
}

const catalogCommit = required(commits.get("spice-framework/development"), "development commit");
const identity = sha256(
  Buffer.from(
    JSON.stringify({
      catalogCommit,
      catalogSha256: sha256(await readFile(catalogPath)),
      sources,
    }),
  ),
);
const lockFile = path.join(root, "sources", "ecosystem.lock.json");
const prior = await readPrior(lockFile);
const generatedAt =
  prior && prior.snapshot === `ecosystem-${identity.slice(0, 12)}`
    ? prior.generatedAt
    : new Date().toISOString();
const lock: EcosystemLock = {
  schema: 1,
  snapshot: `ecosystem-${identity.slice(0, 12)}`,
  generatedAt,
  catalog: {
    repository: "spice-framework/development",
    commit: catalogCommit,
    path: sourceMap.catalog.path,
    sha256: sha256(await readFile(catalogPath)),
  },
  sources,
};
ecosystemLockSchema.parse(lock);
const serialized = `${JSON.stringify(lock, null, 2)}\n`;
const actual = await readOptional(lockFile);
if (values.check) {
  if (actual !== serialized) throw new Error("sources/ecosystem.lock.json is stale");
} else if (actual !== serialized) {
  await mkdir(path.dirname(lockFile), { recursive: true });
  const temporary = `${lockFile}.tmp`;
  await writeFile(temporary, serialized, "utf8");
  await rename(temporary, lockFile);
}
process.stdout.write(`${lock.snapshot} ${lock.sources.length} repositories\n`);

async function materialize(repository: string, directory: string): Promise<string> {
  assertWithin(sourcesRoot, directory, repository);
  const url = `https://github.com/${repository}.git`;
  if (!(await exists(path.join(directory, ".git")))) {
    if (values.offline) throw new Error(`${repository} is not materialized for offline locking`);
    await rm(directory, { recursive: true, force: true });
    await git([
      "-c",
      "core.autocrlf=false",
      "clone",
      "--no-checkout",
      "--filter=blob:none",
      url,
      directory,
    ]);
  }
  await git(["-C", directory, "config", "core.autocrlf", "false"]);
  const origin = (await git(["-C", directory, "remote", "get-url", "origin"])).trim();
  if (normalizeRemote(origin) !== normalizeRemote(url)) {
    throw new Error(`${repository} has unexpected origin ${origin}`);
  }
  if (!values.offline) {
    await git([
      "-C",
      directory,
      "fetch",
      "--prune",
      "--no-tags",
      "origin",
      "+refs/heads/main:refs/remotes/origin/main",
    ]);
  }
  const commit = (
    await git(["-C", directory, "rev-parse", "refs/remotes/origin/main^{commit}"])
  ).trim();
  if (!/^[0-9a-f]{40}$/.test(commit))
    throw new Error(`${repository} did not resolve to a full commit`);
  await git(["-C", directory, "checkout", "--detach", "--force", commit]);
  const status = (await git(["-C", directory, "status", "--porcelain=v1"])).trim();
  if (status) throw new Error(`${repository} materialization is dirty`);
  return commit;
}

function reconcile(sourceMap: SourceMap, catalog: DevelopmentCatalog): void {
  const selected = new Set(sourceMap.sources.map((source) => source.repository));
  const excluded = new Set((sourceMap.exclusions ?? []).map((entry) => entry.repository));
  if (selected.size !== sourceMap.sources.length)
    throw new Error("source map contains duplicate repositories");
  const mounts = new Set(sourceMap.sources.map((source) => source.mount));
  if (mounts.size !== sourceMap.sources.length)
    throw new Error("source map contains duplicate mounts");
  for (const entry of catalog.repositories.filter((repository) => repository.status === "active")) {
    const canonical = `spice-framework/${entry.name}`;
    if (selected.has(canonical) === excluded.has(canonical)) {
      throw new Error(`${canonical} must be selected or explicitly excluded exactly once`);
    }
    if (selected.has(canonical) && entry.canonical_url !== `https://github.com/${canonical}`) {
      throw new Error(`${canonical} catalog URL is not canonical`);
    }
  }
  for (const source of selected) {
    const name = source.slice("spice-framework/".length);
    const entry = requiredCatalogRepository(catalog, name);
    if (entry.status !== "active")
      throw new Error(`${source} is not active in the development catalog`);
  }
}

function requiredCatalogRepository(catalog: DevelopmentCatalog, name: string) {
  const entry = catalog.repositories.find((repository) => repository.name === name);
  if (!entry) throw new Error(`${name} is absent from the development catalog`);
  return entry;
}

async function git(args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  return result.stdout;
}

function normalizeRemote(remote: string): string {
  return remote
    .trim()
    .replace(/\.git$/, "")
    .toLowerCase();
}

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertWithin(parent: string, child: string, label: string): void {
  const relative = path.relative(parent, child);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a child of ${parent}`);
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function readOptional(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function readPrior(file: string): Promise<EcosystemLock | undefined> {
  const raw = await readOptional(file);
  if (!raw) return undefined;
  return parseContract(ecosystemLockSchema, JSON.parse(raw), "existing ecosystem lock");
}

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(`missing ${label}`);
  return value;
}
