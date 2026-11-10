import { writeFileSync } from "node:fs";
import { buildOpenApi } from "./openapi.js";

// `pnpm api:docs` writes the OpenAPI document to docs/api/, which GitHub Pages serves with docs/api/index.html.
const out = new URL("../../../../docs/api/openapi.json", import.meta.url);
writeFileSync(out, `${JSON.stringify(buildOpenApi(), null, 2)}\n`);
console.log(`Wrote ${out.pathname}`);
