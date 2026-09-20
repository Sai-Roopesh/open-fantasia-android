import Ajv2020 from "ajv/dist/2020.js";
import { readFile } from "node:fs/promises";

export async function createSchemaValidator(schemaPath) {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  return value => {
    if (validate(value)) return;
    const detail = ajv.errorsText(validate.errors, { separator: "; ", dataVar: "response" });
    throw new Error(`Response schema validation failed: ${detail}`);
  };
}
