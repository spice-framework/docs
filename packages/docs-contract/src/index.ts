import { z } from "zod";

export const productFamilySchema = z.enum([
  "project",
  "framework",
  "toolchain",
  "developer-tools",
  "integration",
  "example",
  "agent",
  "agent-extension",
  "agent-distribution",
]);

export const maturitySchema = z.enum([
  "pre-alpha",
  "experimental",
  "preview",
  "stable",
  "deprecated",
]);

export const pageKindSchema = z.enum([
  "tutorial",
  "how-to",
  "concept",
  "reference",
  "example",
  "adr",
  "status",
  "security",
  "release",
]);

const localRouteSchema = z
  .string()
  .regex(/^(?:index|[a-z0-9][a-z0-9/_-]*)$/, "must be a clean lowercase local route");
const repositorySchema = z.string().regex(/^spice-framework\/[a-z0-9.-]+$/);
const commitSchema = z.string().regex(/^[0-9a-f]{40}$/);
const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const sourceManifestSchema = z.strictObject({
  $schema: z.string().optional(),
  schema: z.literal(1),
  product: z.strictObject({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    title: z.string().min(1).max(80),
    family: productFamilySchema,
    summary: z.string().min(20).max(240),
    maturity: maturitySchema,
    audience: z
      .array(
        z.enum([
          "application-developer",
          "framework-contributor",
          "extension-author",
          "operator",
          "evaluator",
        ]),
      )
      .optional(),
    icon: z
      .string()
      .regex(/^[a-z][a-z0-9-]*$/)
      .optional(),
  }),
  content: z
    .array(
      z.strictObject({
        source: z.string().min(1),
        route: localRouteSchema.optional(),
        routeFrom: z.string().optional(),
        kind: pageKindSchema.optional(),
        title: z.string().min(1).max(120).optional(),
        description: z.string().min(20).max(300).optional(),
        order: z.number().int().nonnegative().optional(),
        search: z.boolean().optional().default(true),
        exclude: z.array(z.string()).optional(),
        aliases: z.array(localRouteSchema).optional(),
      }),
    )
    .min(1),
  assets: z.array(z.string().min(1)).optional(),
  snippets: z
    .array(
      z.strictObject({
        root: z.string().min(1),
        include: z.array(z.string()).min(1),
        exclude: z.array(z.string()).optional(),
      }),
    )
    .optional(),
  navigation: z
    .array(
      z.strictObject({
        label: z.string().min(1).max(60),
        order: z.number().int().nonnegative().optional(),
        collapsed: z.boolean().optional(),
        items: z.array(localRouteSchema).min(1),
      }),
    )
    .optional(),
});

export const sourceMapSchema = z.strictObject({
  schema: z.literal(1),
  organization: z.literal("spice-framework"),
  catalog: z.strictObject({
    repository: z.literal("spice-framework/development"),
    path: z.literal("internal/catalog/compatibility.json"),
  }),
  exclusions: z
    .array(
      z.strictObject({
        repository: repositorySchema,
        reason: z.string().min(20),
      }),
    )
    .optional(),
  sources: z
    .array(
      z.strictObject({
        repository: repositorySchema,
        productId: z.string().regex(/^[a-z][a-z0-9-]*$/),
        title: z.string().min(1).max(80),
        family: productFamilySchema,
        mount: z.string().regex(/^\/[a-z0-9][a-z0-9/_-]*$/),
        order: z.number().int().nonnegative(),
      }),
    )
    .min(1),
});

const lockedRepositorySchema = z.object({
  repository: repositorySchema,
  commit: commitSchema,
});

export const ecosystemLockSchema = z.strictObject({
  schema: z.literal(1),
  snapshot: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/),
  generatedAt: z.string().datetime(),
  catalog: lockedRepositorySchema.extend({
    path: z.literal("internal/catalog/compatibility.json"),
    sha256: digestSchema,
  }),
  sources: z.array(
    lockedRepositorySchema.extend({
      canonicalUrl: z.string().url().startsWith("https://github.com/spice-framework/"),
      defaultBranch: z.string().min(1),
      manifest: z.literal("spice-docs.json"),
      manifestSha256: digestSchema,
      contentSha256: digestSchema,
      channel: z.enum(["preview", "stable"]),
      version: z.string().optional(),
    }),
  ),
});

export const developmentCatalogSchema = z.object({
  schema: z.number().int().positive(),
  repositories: z.array(
    z.object({
      name: z.string().min(1),
      directory: z.string().regex(/^[a-z0-9.-]+$/),
      status: z.enum(["active", "migrating", "planned"]),
      canonical_url: z.string().url(),
      clone_url: z.string().url(),
      dependencies: z.array(z.string()),
    }),
  ),
});

export type SourceManifest = z.infer<typeof sourceManifestSchema>;
export type SourceMap = z.infer<typeof sourceMapSchema>;
export type EcosystemLock = z.infer<typeof ecosystemLockSchema>;
export type DevelopmentCatalog = z.infer<typeof developmentCatalogSchema>;

export function parseContract<T>(schema: z.ZodType<T>, value: unknown, name: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    throw new Error(`${name} is invalid: ${details}`);
  }
  return result.data;
}
