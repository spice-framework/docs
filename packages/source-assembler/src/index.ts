import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Code, Content, Heading, Image, Link, Root } from "mdast";
import { toString as mdastToString } from "mdast-util-to-string";
import fg from "fast-glob";
import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { visit } from "unist-util-visit";
import YAML from "yaml";
import {
  type DevelopmentCatalog,
  type EcosystemLock,
  type SourceManifest,
  type SourceMap,
  developmentCatalogSchema,
  ecosystemLockSchema,
  parseContract,
  sourceManifestSchema,
  sourceMapSchema,
} from "../../docs-contract/src/index.ts";

export interface AssembleOptions {
  root: string;
  sourcesRoot?: string;
  generatedRoot?: string;
  lockFile?: string;
  sourceOverrides?: ReadonlyMap<string, string>;
}

export interface AssembledPage {
  repository: string;
  sourcePath: string;
  route: string;
  title: string;
  description: string;
  product: string;
  family: string;
  kind: string;
  maturity: string;
  searchInclude: boolean;
  rawMarkdown: string;
}

export interface AssembleResult {
  snapshot: string;
  pages: AssembledPage[];
  routes: string[];
  outputRoot: string;
}

interface PlannedPage {
  repository: string;
  repositoryName: string;
  sourceRoot: string;
  sourcePath: string;
  route: string;
  mount: string;
  manifest: SourceManifest;
  content: SourceManifest["content"][number];
  locked: EcosystemLock["sources"][number];
  assets: Map<string, string>;
  snippets: Set<string>;
}

interface DirectiveNode {
  type: "containerDirective" | "leafDirective" | "textDirective";
  name: string;
  attributes?: Record<string, string | null>;
  children?: Content[];
}

const markdown = unified()
  .use(remarkParse)
  .use(remarkDirective)
  .use(remarkStringify, { bullet: "-", fences: true, listItemIndent: "one" });

export async function assemble(options: AssembleOptions): Promise<AssembleResult> {
  const root = path.resolve(options.root);
  const sourcesRoot = path.resolve(options.sourcesRoot ?? path.join(root, ".generated", "sources"));
  const generatedRoot = path.resolve(options.generatedRoot ?? path.join(root, ".generated"));
  assertGeneratedRoot(root, generatedRoot);

  const sourceMap = await readContract(
    path.join(root, "config", "source-map.json"),
    sourceMapSchema,
    "source map",
  );
  const lock = await readContract(
    options.lockFile ?? path.join(root, "sources", "ecosystem.lock.json"),
    ecosystemLockSchema,
    "ecosystem lock",
  );
  const catalogFile = path.join(
    path.resolve(
      options.sourceOverrides?.get("spice-framework/development") ??
        path.join(sourcesRoot, "development"),
    ),
    lock.catalog.path,
  );
  await requireDigest(catalogFile, lock.catalog.sha256, "locked development catalog");
  const catalog = await readContract(catalogFile, developmentCatalogSchema, "development catalog");
  reconcileCatalog(sourceMap, lock, catalog);

  const outputRoot = path.join(generatedRoot, "site-build");
  await rm(outputRoot, { recursive: true, force: true });
  const contentRoot = path.join(outputRoot, "content", "docs");
  const publicRoot = path.join(outputRoot, "public");
  const siteRoot = path.join(outputRoot, "site");
  await Promise.all([
    mkdir(contentRoot, { recursive: true }),
    mkdir(publicRoot, { recursive: true }),
    mkdir(siteRoot, { recursive: true }),
  ]);
  await cp(path.join(root, "public"), publicRoot, { recursive: true, force: false });

  const plan = await createPlan(sourceMap, lock, sourcesRoot, publicRoot, options.sourceOverrides);
  const routeBySource = new Map(
    plan.map((page) => [`${page.repository}:${page.sourcePath}`, page.route]),
  );
  const pages: AssembledPage[] = [];
  for (const planned of plan) {
    const page = await transformPage(planned, routeBySource);
    pages.push(page);
    const contentFile = routeFile(contentRoot, page.route, ".md");
    await mkdir(path.dirname(contentFile), { recursive: true });
    await writeFile(contentFile, renderPortalMarkdown(page, planned), "utf8");
    const rawFile = `${path.join(publicRoot, "raw", ...page.route.split("/"))}.md`;
    await mkdir(path.dirname(rawFile), { recursive: true });
    await writeFile(rawFile, page.rawMarkdown, "utf8");
  }

  await copyPortalContent(root, contentRoot);
  await writeSiteMetadata(siteRoot, sourceMap, lock, pages);
  await writeLanguageModelExports(publicRoot, pages);
  const routes = await listGeneratedRoutes(contentRoot);
  return { snapshot: lock.snapshot, pages, routes, outputRoot };
}

export async function calculatePublishableDigest(
  sourceRoot: string,
  manifest: SourceManifest,
): Promise<string> {
  const files = new Set<string>(["spice-docs.json"]);
  for (const content of manifest.content) {
    for (const file of await expandFiles(sourceRoot, content.source, content.exclude)) {
      files.add(file);
    }
  }
  for (const file of await expandFiles(sourceRoot, manifest.assets ?? [])) {
    files.add(file);
  }
  for (const snippets of manifest.snippets ?? []) {
    const patterns = snippets.include.map((pattern) => posixJoin(snippets.root, pattern));
    const excludes = (snippets.exclude ?? []).map((pattern) => posixJoin(snippets.root, pattern));
    for (const file of await expandFiles(sourceRoot, patterns, excludes)) {
      files.add(file);
    }
  }
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    const absolute = await secureFile(sourceRoot, file);
    hash.update(file);
    hash.update("\0");
    hash.update(await readFile(absolute));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function createPlan(
  sourceMap: SourceMap,
  lock: EcosystemLock,
  sourcesRoot: string,
  publicRoot: string,
  sourceOverrides?: ReadonlyMap<string, string>,
): Promise<PlannedPage[]> {
  const lockedByRepository = new Map(lock.sources.map((source) => [source.repository, source]));
  const routes = new Map<string, string>();
  const plan: PlannedPage[] = [];
  for (const mapping of sourceMap.sources) {
    const locked = required(lockedByRepository.get(mapping.repository), mapping.repository);
    const repositoryName = repositoryBasename(mapping.repository);
    const sourceRoot = path.resolve(
      sourceOverrides?.get(mapping.repository) ?? path.join(sourcesRoot, repositoryName),
    );
    const manifestFile = await secureFile(sourceRoot, locked.manifest);
    await requireDigest(manifestFile, locked.manifestSha256, `${mapping.repository} manifest`);
    const manifest = parseContract(
      sourceManifestSchema,
      JSON.parse(await readFile(manifestFile, "utf8")),
      `${mapping.repository} manifest`,
    );
    if (manifest.product.id !== mapping.productId || manifest.product.family !== mapping.family) {
      throw new Error(
        `${mapping.repository} product identity does not match the central source map`,
      );
    }
    const contentDigest = await calculatePublishableDigest(sourceRoot, manifest);
    if (contentDigest !== locked.contentSha256) {
      throw new Error(
        `${mapping.repository} publishable digest ${contentDigest} does not match lock ${locked.contentSha256}`,
      );
    }
    const assets = await materializeAssets(mapping.repository, sourceRoot, manifest, publicRoot);
    const snippets = await allowedSnippets(sourceRoot, manifest);
    for (const content of manifest.content) {
      const files = await expandFiles(sourceRoot, content.source, content.exclude);
      if (content.route && files.length !== 1) {
        throw new Error(
          `${mapping.repository} content route ${content.route} must select exactly one file`,
        );
      }
      for (const sourcePath of files) {
        if (path.posix.extname(sourcePath).toLowerCase() !== ".md") {
          throw new Error(`${mapping.repository}:${sourcePath} must be ordinary Markdown`);
        }
        const localRoute = content.route ?? deriveLocalRoute(sourcePath, content.routeFrom);
        const route = joinRoute(mapping.mount, localRoute);
        const owner = routes.get(route);
        if (owner) {
          throw new Error(
            `public route /${route}/ is claimed by ${owner} and ${mapping.repository}`,
          );
        }
        routes.set(route, `${mapping.repository}:${sourcePath}`);
        plan.push({
          repository: mapping.repository,
          repositoryName,
          sourceRoot,
          sourcePath,
          route,
          mount: mapping.mount,
          manifest,
          content,
          locked,
          assets,
          snippets,
        });
      }
    }
  }
  return plan.sort((left, right) =>
    left.route.localeCompare(right.route, "en", { sensitivity: "case" }),
  );
}

async function transformPage(
  planned: PlannedPage,
  routeBySource: Map<string, string>,
): Promise<AssembledPage> {
  const sourceFile = await secureFile(planned.sourceRoot, planned.sourcePath);
  const raw = await readFile(sourceFile, "utf8");
  const { data, body } = splitFrontmatter(raw, `${planned.repository}:${planned.sourcePath}`);
  const tree = (await markdown.run(markdown.parse(body))) as Root;
  await expandSpiceDirectives(tree, planned);
  lintCanonicalGo(tree, planned);

  const firstHeading = tree.children.find((node): node is Heading => node.type === "heading");
  const title =
    planned.content.title ??
    stringField(data, "title") ??
    (firstHeading ? mdastToString(firstHeading) : "");
  if (!title) {
    throw new Error(`${planned.repository}:${planned.sourcePath} has no title`);
  }
  if (firstHeading?.depth === 1 && mdastToString(firstHeading) === title) {
    tree.children.splice(tree.children.indexOf(firstHeading), 1);
  }
  const descriptionNode = tree.children.find(
    (node) => node.type !== "heading" && normalizeDescription(mdastToString(node)).length >= 20,
  );
  const description =
    planned.content.description ??
    stringField(data, "description") ??
    normalizeDescription(descriptionNode ? mdastToString(descriptionNode) : "");
  if (description.length < 20) {
    throw new Error(`${planned.repository}:${planned.sourcePath} has no useful description`);
  }

  rewriteLinks(tree, planned, routeBySource);
  rewriteImages(tree, planned);
  const normalizedBody = String(markdown.stringify(tree)).trim();
  const rawMarkdown = `# ${title}\n\n${normalizedBody}\n`;
  return {
    repository: planned.repository,
    sourcePath: planned.sourcePath,
    route: planned.route,
    title,
    description,
    product: planned.manifest.product.id,
    family: planned.manifest.product.family,
    kind: planned.content.kind ?? stringField(data, "kind") ?? "concept",
    maturity: planned.manifest.product.maturity,
    searchInclude: planned.content.search,
    rawMarkdown,
  };
}

function renderPortalMarkdown(page: AssembledPage, planned: PlannedPage): string {
  const sourceUrl = `https://github.com/${page.repository}/blob/${planned.locked.commit}/${page.sourcePath}`;
  const editUrl = `https://github.com/${page.repository}/edit/${planned.locked.defaultBranch}/${page.sourcePath}`;
  const frontmatter = YAML.stringify({
    title: page.title,
    description: page.description,
    product: page.product,
    family: page.family,
    kind: page.kind,
    maturity: page.maturity,
    sourceRepository: page.repository,
    sourceCommit: planned.locked.commit,
    sourcePath: page.sourcePath,
    lockedSourceUrl: sourceUrl,
    editSourceUrl: editUrl,
    searchInclude: page.searchInclude,
    editUrl: false,
  }).trim();
  const body = page.rawMarkdown.replace(/^# .*?\n\n/s, "");
  return `---\n${frontmatter}\n---\n\n${body}`;
}

async function expandSpiceDirectives(tree: Root, planned: PlannedPage): Promise<void> {
  async function expand(children: Content[]): Promise<void> {
    for (let index = 0; index < children.length; index += 1) {
      const node = children[index] as Content & Partial<DirectiveNode>;
      if (node.type === "containerDirective" && node.name === "spice-code") {
        const attributes = node.attributes ?? {};
        const source = attributes.src;
        const region = attributes.region;
        if (!source || !region) {
          throw new Error(
            `${planned.repository}:${planned.sourcePath} spice-code requires src and region`,
          );
        }
        const resolved = normalizeRelative(
          path.posix.join(path.posix.dirname(planned.sourcePath), source),
          "snippet source",
        );
        if (!planned.snippets.has(resolved)) {
          throw new Error(`${planned.repository}:${resolved} is outside declared snippet roots`);
        }
        const content = await readFile(await secureFile(planned.sourceRoot, resolved), "utf8");
        const code = extractRegion(content, region, `${planned.repository}:${resolved}`);
        const meta = [
          "spice",
          `view=${JSON.stringify(attributes.view ?? "compare")}`,
          attributes.title ? `title=${JSON.stringify(attributes.title)}` : "",
        ]
          .filter(Boolean)
          .join(" ");
        children[index] = { type: "code", lang: "go", meta, value: code } satisfies Code;
        continue;
      }
      if (Array.isArray(node.children)) {
        await expand(node.children);
      }
    }
  }
  await expand(tree.children);
}

function lintCanonicalGo(tree: Root, planned: PlannedPage): void {
  visit(tree, "code", (node: Code) => {
    if (node.lang !== "go" || !/(?:^|\s)spice(?:\s|$)/.test(node.meta ?? "")) {
      return;
    }
    for (const [index, line] of node.value.split("\n").entries()) {
      if (/^\s*@/.test(line) || /^\s*\/\/(?:@| {2,}@)/.test(line)) {
        throw new Error(
          `${planned.repository}:${planned.sourcePath} code line ${index + 1} is not canonical valid-Go // @ syntax`,
        );
      }
    }
  });
}

function rewriteLinks(tree: Root, planned: PlannedPage, routeBySource: Map<string, string>): void {
  visit(tree, "link", (node: Link) => {
    if (node.url.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(node.url)) {
      const internal = githubLinkToInternal(node.url, routeBySource);
      if (internal) node.url = internal;
      return;
    }
    const { pathname, suffix } = splitUrlSuffix(node.url);
    const target = normalizeRelative(
      path.posix.join(path.posix.dirname(planned.sourcePath), decodeURIComponent(pathname)),
      "Markdown link",
    );
    const route = routeBySource.get(`${planned.repository}:${normalizeMarkdownTarget(target)}`);
    if (route) {
      node.url = `/${route}/${suffix}`.replace(/\/{2,}/g, "/");
      return;
    }
    node.url = `https://github.com/${planned.repository}/blob/${planned.locked.commit}/${target}${suffix}`;
  });
}

function rewriteImages(tree: Root, planned: PlannedPage): void {
  visit(tree, "image", (node: Image, index, parent) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(node.url)) {
      if (parent && typeof index === "number") {
        parent.children[index] = {
          type: "link",
          url: node.url,
          children: [{ type: "text", value: node.alt || "View source image" }],
        };
      }
      return;
    }
    const target = normalizeRelative(
      path.posix.join(path.posix.dirname(planned.sourcePath), decodeURIComponent(node.url)),
      "image",
    );
    const generated = planned.assets.get(target);
    if (!generated) {
      throw new Error(`${planned.repository}:${target} is outside declared asset roots`);
    }
    node.url = generated;
  });
}

async function materializeAssets(
  repository: string,
  sourceRoot: string,
  manifest: SourceManifest,
  publicRoot: string,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const relative of await expandFiles(sourceRoot, manifest.assets ?? [])) {
    const source = await secureFile(sourceRoot, relative);
    const digest = await sha256(source);
    const extension = path.posix.extname(relative).toLowerCase();
    if (extension === ".svg") {
      throw new Error(
        `${repository}:${relative} is untrusted source SVG; rasterize it before publishing`,
      );
    }
    const publicPath = `/_assets/${repositoryBasename(repository)}/${digest.slice(0, 16)}${extension}`;
    const output = path.join(publicRoot, ...publicPath.split("/").filter(Boolean));
    await mkdir(path.dirname(output), { recursive: true });
    await cp(source, output, { force: false });
    result.set(relative, publicPath);
  }
  return result;
}

async function allowedSnippets(sourceRoot: string, manifest: SourceManifest): Promise<Set<string>> {
  const result = new Set<string>();
  for (const snippets of manifest.snippets ?? []) {
    const patterns = snippets.include.map((pattern) => posixJoin(snippets.root, pattern));
    const excludes = (snippets.exclude ?? []).map((pattern) => posixJoin(snippets.root, pattern));
    for (const file of await expandFiles(sourceRoot, patterns, excludes)) {
      result.add(file);
    }
  }
  return result;
}

function extractRegion(content: string, region: string, source: string): string {
  if (!/^[a-z][a-z0-9-]*$/.test(region)) {
    throw new Error(`${source} region ${region} is invalid`);
  }
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const begin = `// docs:begin ${region}`;
  const end = `// docs:end ${region}`;
  const begins = lines.flatMap((line, index) => (line.trim() === begin ? [index] : []));
  const ends = lines.flatMap((line, index) => (line.trim() === end ? [index] : []));
  if (begins.length !== 1 || ends.length !== 1 || ends[0] <= begins[0]) {
    throw new Error(`${source} region ${region} must have one ordered begin/end pair`);
  }
  const selected = lines.slice(begins[0] + 1, ends[0]);
  if (selected.some((line) => /^\s*\/\/ docs:(?:begin|end) /.test(line))) {
    throw new Error(`${source} region ${region} contains overlapping region markers`);
  }
  return selected.join("\n").replace(/\s+$/u, "");
}

function reconcileCatalog(
  sourceMap: SourceMap,
  lock: EcosystemLock,
  catalog: DevelopmentCatalog,
): void {
  const sources = new Set(sourceMap.sources.map((source) => source.repository));
  const exclusions = new Map(
    (sourceMap.exclusions ?? []).map((entry) => [entry.repository, entry.reason]),
  );
  const lockSources = new Set(lock.sources.map((source) => source.repository));
  for (const repository of catalog.repositories) {
    if (repository.status !== "active" && repository.status !== "migrating") continue;
    const canonical = `spice-framework/${repository.name}`;
    if (sources.has(canonical)) {
      if (!lockSources.has(canonical)) {
        throw new Error(`active documentation source ${canonical} is missing from the lock`);
      }
    } else if (!exclusions.has(canonical)) {
      throw new Error(
        `active catalog repository ${canonical} has no documentation source or exclusion`,
      );
    }
  }
  for (const source of sources) {
    const name = repositoryBasename(source);
    const repository = catalog.repositories.find((candidate) => candidate.name === name);
    if (!repository || (repository.status !== "active" && repository.status !== "migrating")) {
      throw new Error(`documentation source ${source} is not active in the development catalog`);
    }
    if (repository.canonical_url !== `https://github.com/${source}`) {
      throw new Error(`documentation source ${source} does not match its canonical catalog URL`);
    }
  }
  const mounts = new Set<string>();
  for (const source of sourceMap.sources) {
    if (mounts.has(source.mount)) throw new Error(`duplicate public mount ${source.mount}`);
    mounts.add(source.mount);
  }
}

async function copyPortalContent(root: string, contentRoot: string): Promise<void> {
  const portalRoot = path.join(root, "content", "portal");
  for (const relative of await fg("**/*.{md,mdx}", { cwd: portalRoot, onlyFiles: true })) {
    const output = path.join(contentRoot, ...relative.split("/"));
    await mkdir(path.dirname(output), { recursive: true });
    await cp(path.join(portalRoot, ...relative.split("/")), output, { force: false });
  }
}

async function writeSiteMetadata(
  siteRoot: string,
  sourceMap: SourceMap,
  lock: EcosystemLock,
  pages: AssembledPage[],
): Promise<void> {
  const products = sourceMap.sources.map((source) => ({
    ...source,
    commit: lock.sources.find((locked) => locked.repository === source.repository)?.commit,
  }));
  await Promise.all([
    writeJSON(path.join(siteRoot, "products.json"), products),
    writeJSON(
      path.join(siteRoot, "routes.json"),
      pages.map((page) => ({
        route: `/${page.route}/`,
        repository: page.repository,
        sourcePath: page.sourcePath,
      })),
    ),
    writeJSON(
      path.join(siteRoot, "search.json"),
      pages.map(({ rawMarkdown: _, ...page }) => page),
    ),
  ]);
}

async function writeLanguageModelExports(
  publicRoot: string,
  pages: AssembledPage[],
): Promise<void> {
  const eligible = pages.filter((page) => page.searchInclude);
  const index = eligible
    .map((page) => `- [${page.title}](https://spiceframework.dev/${page.route}/)`)
    .join("\n");
  const full = eligible
    .map(
      (page) =>
        `Source: ${page.repository}@${page.sourcePath}\nURL: https://spiceframework.dev/${page.route}/\n\n${page.rawMarkdown}`,
    )
    .join("\n---\n\n");
  const small = eligible
    .filter((page) => page.kind === "tutorial" || page.route.includes("getting-started"))
    .slice(0, 20)
    .map((page) => page.rawMarkdown)
    .join("\n---\n\n");
  await Promise.all([
    writeFile(path.join(publicRoot, "llms.txt"), `# Spice documentation\n\n${index}\n`, "utf8"),
    writeFile(path.join(publicRoot, "llms-small.txt"), `${small}\n`, "utf8"),
    writeFile(path.join(publicRoot, "llms-full.txt"), `${full}\n`, "utf8"),
  ]);
}

async function expandFiles(
  sourceRoot: string,
  patterns: string | string[],
  exclude: string[] = [],
): Promise<string[]> {
  const inputs = typeof patterns === "string" ? [patterns] : patterns;
  if (inputs.length === 0) return [];
  for (const pattern of [...inputs, ...exclude]) normalizePattern(pattern);
  const files = await fg(inputs, {
    cwd: sourceRoot,
    ignore: exclude,
    onlyFiles: true,
    dot: false,
    followSymbolicLinks: false,
    unique: true,
  });
  const normalized = files.map((file) => normalizeRelative(file, "matched source path")).sort();
  for (const file of normalized) await secureFile(sourceRoot, file);
  return normalized;
}

async function secureFile(root: string, relative: string): Promise<string> {
  const normalized = normalizeRelative(relative, "source path");
  const absoluteRoot = path.resolve(root);
  const absolute = path.resolve(absoluteRoot, ...normalized.split("/"));
  const relation = path.relative(absoluteRoot, absolute);
  if (relation.startsWith("..") || path.isAbsolute(relation)) {
    throw new Error(`source path ${relative} escapes ${root}`);
  }
  let current = absoluteRoot;
  for (const segment of normalized.split("/")) {
    current = path.join(current, segment);
    const info = await lstat(current);
    if (info.isSymbolicLink()) throw new Error(`source path ${relative} contains a symbolic link`);
  }
  if (!(await stat(absolute)).isFile()) throw new Error(`source path ${relative} is not a file`);
  return absolute;
}

function splitFrontmatter(
  raw: string,
  source: string,
): { data: Record<string, unknown>; body: string } {
  const normalized = raw.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { data: {}, body: normalized };
  const end = normalized.indexOf("\n---\n", 4);
  if (end < 0) throw new Error(`${source} has unterminated frontmatter`);
  const value = YAML.parse(normalized.slice(4, end));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source} frontmatter must be an object`);
  }
  const allowed = new Set([
    "title",
    "description",
    "kind",
    "maturity",
    "audience",
    "sidebar",
    "search",
    "aliases",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`${source} frontmatter field ${key} is not portable`);
  }
  return { data: value as Record<string, unknown>, body: normalized.slice(end + 5) };
}

function deriveLocalRoute(sourcePath: string, routeFrom?: string): string {
  let relative = sourcePath;
  if (routeFrom) {
    const prefix = normalizeRelative(routeFrom, "routeFrom").replace(/\/$/, "");
    if (relative !== prefix && !relative.startsWith(`${prefix}/`)) {
      throw new Error(`${sourcePath} is outside routeFrom ${routeFrom}`);
    }
    relative = relative.slice(prefix.length).replace(/^\//, "");
  } else {
    relative = relative.replace(/^(?:docs|adrs)\//, "");
  }
  relative = relative.replace(/\.md$/i, "");
  if (/(^|\/)(?:README|index)$/i.test(relative)) {
    relative = relative.replace(/(^|\/)(?:README|index)$/i, "");
  }
  return slugDerivedRoute(relative || "index");
}

function slugDerivedRoute(value: string): string {
  const route = value
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .map((segment) =>
      segment
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/-{2,}/g, "-")
        .replace(/^[-_]+|[-_]+$/g, ""),
    )
    .join("/");
  return normalizeRoute(route);
}

function joinRoute(mount: string, local: string): string {
  const base = mount.replace(/^\/+|\/+$/g, "");
  const suffix = local === "index" ? "" : local.replace(/^\/+|\/+$/g, "");
  return normalizeRoute([base, suffix].filter(Boolean).join("/"));
}

function normalizeRoute(value: string): string {
  const normalized = value
    .replace(/\\/g, "/")
    .replace(/\/{2,}/g, "/")
    .replace(/^\/+|\/+$/g, "");
  if (!/^[a-z0-9][a-z0-9/_-]*$/.test(normalized) || normalized.includes("..")) {
    throw new Error(`public route ${value} is invalid`);
  }
  return normalized;
}

function normalizeRelative(value: string, label: string): string {
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized.startsWith("/") ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.includes("\0")
  ) {
    throw new Error(`${label} ${value} is unsafe`);
  }
  return normalized;
}

function normalizePattern(value: string): void {
  if (
    !value ||
    value.includes("\\") ||
    value.startsWith("/") ||
    value.split("/").includes("..") ||
    /^[a-zA-Z]:/.test(value)
  ) {
    throw new Error(`glob pattern ${value} is unsafe`);
  }
}

function normalizeMarkdownTarget(value: string): string {
  if (/\.md$/i.test(value)) return value;
  if (value.endsWith("/")) return `${value}README.md`;
  return value;
}

function splitUrlSuffix(url: string): { pathname: string; suffix: string } {
  const index = url.search(/[?#]/);
  return index < 0
    ? { pathname: url, suffix: "" }
    : { pathname: url.slice(0, index), suffix: url.slice(index) };
}

function githubLinkToInternal(url: string, routes: Map<string, string>): string | undefined {
  const match =
    /^https:\/\/github\.com\/(spice-framework\/[^/]+)\/blob\/[0-9A-Za-z._/-]+\/(.+?)([?#].*)?$/.exec(
      url,
    );
  if (!match) return undefined;
  const route = routes.get(`${match[1]}:${normalizeMarkdownTarget(match[2])}`);
  return route ? `/${route}/${match[3] ?? ""}` : undefined;
}

function routeFile(root: string, route: string, extension: string): string {
  return path.join(root, ...route.split("/"), `index${extension}`);
}

async function listGeneratedRoutes(contentRoot: string): Promise<string[]> {
  return (await fg("**/index.{md,mdx}", { cwd: contentRoot, onlyFiles: true }))
    .map((file) => file.replace(/\/index\.(?:md|mdx)$/, ""))
    .sort();
}

async function readContract<T>(
  file: string,
  schema: Parameters<typeof parseContract<T>>[0],
  name: string,
): Promise<T> {
  return parseContract(schema, JSON.parse(await readFile(file, "utf8")), name);
}

async function requireDigest(file: string, expected: string, label: string): Promise<void> {
  const actual = await sha256(file);
  if (actual !== expected)
    throw new Error(`${label} digest ${actual} does not match lock ${expected}`);
}

async function sha256(file: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

async function writeJSON(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assertGeneratedRoot(root: string, generatedRoot: string): void {
  const relation = path.relative(root, generatedRoot);
  if (relation.startsWith("..") || path.isAbsolute(relation) || relation === "") {
    throw new Error(`generated root ${generatedRoot} must be a child of ${root}`);
  }
}

function stringField(value: Record<string, unknown>, name: string): string | undefined {
  return typeof value[name] === "string" ? (value[name] as string) : undefined;
}

function normalizeDescription(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 300 ? `${normalized.slice(0, 296).trimEnd()}…` : normalized;
}

function repositoryBasename(repository: string): string {
  return repository.slice(repository.indexOf("/") + 1);
}

function posixJoin(...values: string[]): string {
  return values
    .filter((value) => value && value !== ".")
    .join("/")
    .replace(/\/{2,}/g, "/");
}

function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`required value ${name} is missing`);
  return value;
}
