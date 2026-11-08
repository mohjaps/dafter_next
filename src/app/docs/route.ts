import { ApiReference } from "@scalar/nextjs-api-reference";

// Interactive API reference (Scalar) for public/openapi.json.
// The Scalar bundle is self-hosted (copied to public/scalar by `postinstall`), not loaded from a CDN.
export const GET = ApiReference({
  url: "/openapi.json",
  cdn: "/scalar/standalone.js",
  pageTitle: "Daftar API",
  persistAuth: true,
  withDefaultFonts: false,
  // Hide Scalar promo toolbar and the hosted "Ask AI" agent (it would send the spec to a third party).
  showDeveloperTools: "never",
  agent: { disabled: true },
});
