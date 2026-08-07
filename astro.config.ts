import starlight from "@astrojs/starlight";
import { pluginLineNumbers } from "@expressive-code/plugin-line-numbers";
import { defineConfig } from "astro/config";
import { createRequire } from "node:module";
import path from "node:path";
import { createSpiceCodePlugin } from "./packages/expressive-code-spice/src/index.ts";
import { navigation } from "./config/navigation.ts";
import { redirects } from "./config/redirects.ts";

const require = createRequire(import.meta.url);
const chromeSourceRoot = process.env.SPICE_CHROME_SOURCE_ROOT
  ? path.resolve(process.env.SPICE_CHROME_SOURCE_ROOT)
  : path.resolve(".generated/sources/chrome");
const syntaxModule = require(
  path.join(chromeSourceRoot, "packages/spice-syntax/src/index.cjs"),
) as Parameters<typeof createSpiceCodePlugin>[0];

export default defineConfig({
  site: "https://spiceframework.dev",
  base: "/",
  publicDir: ".generated/site-build/public",
  output: "static",
  trailingSlash: "always",
  redirects,
  integrations: [
    starlight({
      title: "Spice",
      description:
        "A Go-native application platform with compile-time validation and deterministic generated Go.",
      social: [
        {
          icon: "github",
          label: "Spice Framework on GitHub",
          href: "https://github.com/spice-framework",
        },
      ],
      customCss: [
        "./src/styles/tokens.css",
        "./src/styles/global.css",
        "./src/styles/starlight.css",
        "./src/styles/spice-code.css",
      ],
      components: {
        Header: "./src/components/starlight/Header.astro",
        Head: "./src/components/starlight/Head.astro",
        Search: "./src/components/starlight/Search.astro",
        MarkdownContent: "./src/components/starlight/MarkdownContent.astro",
        PageTitle: "./src/components/starlight/PageTitle.astro",
        EditLink: "./src/components/starlight/EditLink.astro",
        Footer: "./src/components/starlight/Footer.astro",
      },
      sidebar: navigation,
      expressiveCode: {
        plugins: [pluginLineNumbers(), createSpiceCodePlugin(syntaxModule)],
        defaultProps: { showLineNumbers: false },
      },
      lastUpdated: false,
    }),
  ],
  markdown: {
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
    },
  },
  vite: {
    resolve: {
      alias: {
        "@components": path.resolve("src/components"),
      },
    },
    build: {
      sourcemap: true,
    },
  },
});
