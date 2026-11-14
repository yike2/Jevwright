import { serveDemoApp } from "../benchmark/server.js";
import { DEMO_URL } from "./support.js";

// Playwright's webServer starts this and stops it after the run; Runs reach the Demo App at DEMO_URL as BASE.
const { baseUrl } = await serveDemoApp(Number(new URL(DEMO_URL).port));
console.log(`Demo App on ${baseUrl}`);
