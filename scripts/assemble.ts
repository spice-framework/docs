import path from "node:path";
import { fileURLToPath } from "node:url";
import { assemble } from "../packages/source-assembler/src/index.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcesRoot = process.env.SPICE_SOURCES_ROOT
  ? path.resolve(process.env.SPICE_SOURCES_ROOT)
  : path.join(root, ".generated", "sources");
const result = await assemble({ root, sourcesRoot });
console.log(
  `Assembled ${result.pages.length} source pages and ${result.routes.length} total routes for ${result.snapshot}.`,
);
