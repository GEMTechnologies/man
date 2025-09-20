# @man-sh/react-vite-component-tagger

A Vite plugin that automatically adds `data-man-id` and `data-man-name` attributes to your React components. This is useful for identifying components in the DOM, for example for testing or analytics.

## Installation

```bash
npm install @man-sh/react-vite-component-tagger
# or
yarn add @man-sh/react-vite-component-tagger
# or
pnpm add @man-sh/react-vite-component-tagger
```

## Usage

Add the plugin to your `vite.config.ts` file:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import manTagger from "@man-sh/react-vite-component-tagger";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), manTagger()],
});
```

The plugin will automatically add `data-man-id` and `data-man-name` to all your React components.

The `data-man-id` will be a unique identifier for each component instance, in the format `path/to/file.tsx:line:column`.

The `data-man-name` will be the name of the component.

## Testing & Publishing

Bump it to an alpha version and test in man app, eg. `"version": "0.0.1-alpha.0",`

Then publish it:

```sh
cd packages/@man-sh/react-vite-component-tagger/ && npm run prepublishOnly && npm publish
```

Update the scaffold like this:

```sh
cd scaffold && pnpm remove @man-sh/react-vite-component-tagger && pnpm add -D @man-sh/react-vite-component-tagger
```

Run the E2E tests and make sure it passes.

Then, bump to a normal version, e.g. "0.1.0" and then re-publish. We'll try to match the main man app version where possible.
