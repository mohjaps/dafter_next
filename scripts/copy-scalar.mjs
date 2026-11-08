// Self-host the Scalar API reference bundle (served at /scalar/standalone.js) instead of loading it from a CDN.
import { copyFileSync, mkdirSync } from "node:fs";

const source = new URL("../node_modules/@scalar/api-reference/dist/browser/standalone.js", import.meta.url);
const target = new URL("../public/scalar/", import.meta.url);
mkdirSync(target, { recursive: true });
copyFileSync(source, new URL("standalone.js", target));
console.log("[scalar] copied standalone.js to public/scalar/");
