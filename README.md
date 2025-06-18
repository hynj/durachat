# DuraChat

Entry for T3 Cloneathon

AI Chat application, very work in progress
Built with svelte, hono, drizzle-orm, shadcn-svelte, durable objects, and more

## Project structure

SvelteKit SPA - it gets built into a static site and moved into the bakcend assets directory
This gets deployed to Cloudflare

## Setup

Make .dev.vars in the apps/backend directory

with the following contents:
WORKER_ENV=local
GOOGLE_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
BASE_URL=http://localhost:5787
LOG_LEVEL=DEBUG
OPEN_ROUTER_API_KEY=
ENCRYPTION_MASTER_KEY=

Generate a new ENCRYPTION_MASTER_KEY with openssl rand -base64 32

Make a .env.local file in the apps/frontend directory

With the folowing contents:
PUBLIC_DEBUG_ENABLED=false
PUBLIC_HONO_API_URL=http://localhost:5787


run bun install in the root directory
run bun run dev in the root directory

## Deploying

To deploy to Cloudflare, run the following commands:

bun run build
cd apps/backend
bun run deploy

