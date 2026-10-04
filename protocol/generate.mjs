// Generates both sides of the contract from the schemas in ./schemas, so a field is added in one place.
//
//   host:    host/src/protocol/generated/{link,story-file}.ts (json-schema-to-typescript)
//   android: android/app/src/main/java/com/openfantasia/protocol/Link.kt (quicktype, kotlinx.serialization)
//
// The phone never reads Story Files, so only the link is generated for Kotlin. Generated files are committed and
// never edited by hand; run `npm run generate` after changing a schema.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const contract = JSON.parse(readFileSync(join(here, "contract.json"), "utf8")).version;
const banner = "Generated from protocol/schemas by protocol/generate.mjs. Do not edit; change the schema and regenerate.";

const schema = name => JSON.parse(readFileSync(join(here, "schemas", `${name}.schema.json`), "utf8"));

async function typescript() {
  const out = join(repo, "host/src/protocol/generated");
  mkdirSync(out, { recursive: true });
  for (const name of ["link", "story-file"]) {
    const ts = await compile(schema(name), name === "link" ? "Link" : "StoryFile", {
      bannerComment: `/* ${banner} */`,
      unreachableDefinitions: true,
      additionalProperties: false,
      strictIndexSignatures: true,
      format: true
    });
    writeFileSync(join(out, `${name}.ts`), ts);
  }
  writeFileSync(join(out, "contract.ts"), `/* ${banner} */\n\nexport const CONTRACT_VERSION = ${contract};\n`);
}

function kotlin() {
  const out = join(repo, "android/app/src/main/java/com/openfantasia/protocol");
  mkdirSync(out, { recursive: true });
  const link = schema("link");
  const sources = Object.keys(link.$defs).flatMap(name => ["--src", `${join(here, "schemas/link.schema.json")}#/$defs/${name}`]);
  const file = join(out, "Link.kt");
  execFileSync(join(here, "node_modules/.bin/quicktype"), [
    "--src-lang", "schema",
    "--lang", "kotlin",
    "--framework", "kotlinx",
    "--package", "com.openfantasia.protocol",
    "--out", file,
    ...sources
  ], { stdio: "inherit" });
  const body = readFileSync(file, "utf8");
  writeFileSync(file, `// ${banner}\n\n${body}`);
  writeFileSync(join(out, "Contract.kt"),
    `// ${banner}\n\npackage com.openfantasia.protocol\n\nconst val CONTRACT_VERSION = ${contract}\n`);
}

await typescript();
kotlin();
console.log(`Generated contract version ${contract} for host and android.`);
