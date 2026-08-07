import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { parseContract, sourceManifestSchema } from "../packages/docs-contract/src/index.ts";
import { calculatePublishableDigest } from "../packages/source-assembler/src/index.ts";

const { values } = parseArgs({
  options: { source: { type: "string" }, repository: { type: "string" } },
  allowPositionals: false,
});
if (!values.source) throw new Error("--source is required");
const sourceRoot = path.resolve(values.source);
const manifestFile = path.join(sourceRoot, "spice-docs.json");
const manifest = parseContract(
  sourceManifestSchema,
  JSON.parse(await readFile(manifestFile, "utf8")),
  `${values.repository ?? sourceRoot} manifest`,
);
const digest = await calculatePublishableDigest(sourceRoot, manifest);
process.stdout.write(`${values.repository ?? sourceRoot} ${digest}\n`);
