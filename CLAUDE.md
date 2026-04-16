# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production (static site)
npm run preview      # Preview production build
npm run check        # Type-check with svelte-check
npm run check:watch  # Type-check in watch mode
npm run lint         # Check formatting (Prettier) and linting (ESLint)
npm run format       # Auto-format code with Prettier
npm run test:unit    # Run tests in watch mode
npm run test         # Run tests once (CI mode)
```

To run a single test file:

```bash
npx vitest run src/lib/path/to/file.spec.ts
```

## Architecture

**Framework:** SvelteKit 2 with Svelte 5, deployed as a static site via `@sveltejs/adapter-static`.

**Svelte 5 runes** are enabled by default across the project. Use `$state()`, `$derived()`, `$props()`, `$effect()` syntax rather than the legacy reactive store/`$:` patterns.

**Routing:** File-based in `src/routes/`. Each route segment can have a `+page.svelte`, `+layout.svelte`, `+page.ts` (load function), etc.

**Component library:** shadcn-svelte. Use its components as the base layer for all UI elements — compose and extend them rather than building from scratch.

**Styling:** Tailwind CSS 4 via the @tailwindcss/vite plugin. The global stylesheet at src/routes/layout.css defines the Frondly theme: a green-tinted oklch() palette exposed as CSS custom properties (--primary, --background, --card, etc.) and mapped into Tailwind via @theme inline. Font is Figtree Variable. Dark mode uses the .dark class variant.

**CSS conventions:** Svelte components are the semantic unit — a `<Panel>` component is preferable to a `.panel` class. Within components, write Tailwind utility classes directly in the markup rather than defining named CSS classes with `@apply`.

- **Colors:** always use the theme's semantic palette classes (`text-foreground`, `bg-card`, `text-primary`, `text-muted-foreground`, etc.) — never embed raw color values or non-semantic Tailwind color classes (e.g. `text-green-500`) in markup
- Component `<style>` blocks are reserved for CSS that cannot be expressed as a Tailwind utility (e.g. vendor-prefixed properties)
- Styles that are genuinely global (typography, resets, base surface tokens) belong in `src/routes/layout.css`

**Shared code:** `src/lib/` — importable as `$lib/...` throughout the app. `src/lib/index.ts` is the barrel export.

**Testing:** Two Vitest projects configured in `vite.config.ts`:

- **Server** (`*.spec.ts` / `*.test.ts`): runs in Node environment
- **Client** (`*.svelte.spec.ts` / `*.svelte.test.ts`): runs in a real Chromium browser via Playwright using `vitest-browser-svelte` for component rendering

All tests require at least one assertion (`expect.requireAssertions: true`).

**Formatting conventions** (from `.prettierrc`): tabs, single quotes, 100-char print width, no trailing commas.
