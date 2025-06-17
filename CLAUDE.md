# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands
- Root: `bun run build`, `bun run dev`, `bun run lint`
- Backend: `bun run dev` (port 5787), `bun run drizzle-gen-control`, `bun run drizzle-gen-user`
- Frontend: `bun run dev` (port 5180), `bun run check`, `bun run lint` 
- Single test: `bun vitest path/to/test.ts` or `bun playwright test path/to/test.ts`

## Code Style Guidelines
- Package manager: Bun
- TypeScript: Strict mode enabled, module resolution "Bundler", target ESNext
- Formatting: Prettier with Svelte/Tailwind plugins
- Imports: Use aliases (`$lib/`, `$app/`), organize by source
- Error handling: Valibot for API validation, structured error responses
- Naming: PascalCase (types), camelCase (variables/functions), kebab-case (files)
- Structure: Monorepo (Turborepo) with apps (backend, frontend, web)
- Backend: Cloudflare Workers with Hono framework
- Frontend: SvelteKit with Tailwind CSS
- Database: Drizzle ORM
- Tests: Vitest (unit), Playwright (integration)

- Always pre-fix any blocks of code suggestions into a git commit. By first running git add . then git commit at the end
