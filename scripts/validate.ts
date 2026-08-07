import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  ecosystemLockSchema,
  parseContract,
  sourceMapSchema,
} from "../packages/docs-contract/src/index.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJSON = async (relative: string) =>
  JSON.parse(await readFile(path.join(root, relative), "utf8"));

const sourceMap = parseContract(
  sourceMapSchema,
  await readJSON("config/source-map.json"),
  "source map",
);
const lock = parseContract(
  ecosystemLockSchema,
  await readJSON("sources/ecosystem.lock.json"),
  "ecosystem lock",
);
const manifestSchema = await readJSON("schemas/spice-docs.schema.json");
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
if (!ajv.validateSchema(manifestSchema)) {
  throw new Error(`spice-docs JSON Schema is invalid: ${ajv.errorsText(ajv.errors)}`);
}

const repositories = new Set(sourceMap.sources.map((source) => source.repository));
for (const source of lock.sources) {
  if (!repositories.delete(source.repository)) {
    throw new Error(
      `locked source ${source.repository} is absent or duplicated in source-map.json`,
    );
  }
}
if (repositories.size !== 0) {
  throw new Error(
    `source map repositories missing from lock: ${[...repositories].sort().join(", ")}`,
  );
}

const serialized = JSON.stringify({ sourceMap, lock });
if (/<[A-Z0-9_]+>|11111111|aaaaaaaa/i.test(serialized)) {
  throw new Error("configuration contains a placeholder rather than reviewed production data");
}
console.log(
  `Validated ${sourceMap.sources.length} sources for exact snapshot ${lock.snapshot} and its JSON Schema.`,
);
