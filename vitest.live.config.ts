import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";

const config = mergeConfig(
    baseConfig,
    defineConfig({
        test: {
            include: ["src/tests/live/**/*.live.test.ts"],
            setupFiles: ["src/tests/live/setup-env.ts"],
            testTimeout: 30_000,
        },
    }),
);

config.test.exclude = [];

export default config;