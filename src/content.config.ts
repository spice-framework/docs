import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const docs = defineCollection({
  loader: glob({
    base: ".generated/site-build/content/docs",
    pattern: "**/*.{md,mdx}",
  }),
  schema: docsSchema({
    extend: z.object({
      product: z.string().optional(),
      family: z.string().optional(),
      kind: z.string().optional(),
      maturity: z.string().optional(),
      sourceRepository: z.string().optional(),
      sourceCommit: z.string().optional(),
      sourcePath: z.string().optional(),
      lockedSourceUrl: z.string().url().optional(),
      editSourceUrl: z.string().url().optional(),
      searchInclude: z.boolean().default(true),
    }),
  }),
});

export const collections = { docs };
