// Builds the upstream app with @backtrace/react replaced by the local stub.
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import upstream from "./vite.config.js";

export default mergeConfig(
  upstream,
  defineConfig({
    resolve: { alias: { "@backtrace/react": fileURLToPath(new URL("./src/backtrace-stub.jsx", import.meta.url)) } },
  }),
);
