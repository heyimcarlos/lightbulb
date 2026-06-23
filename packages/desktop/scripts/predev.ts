import { $ } from "bun"

await $`bun ./scripts/ensure-electron.ts`
await $`bun ./scripts/copy-icons.ts ${process.env.OPENCODE_CHANNEL ?? "dev"}`

await $`cd ../opencode && bun script/build-node.ts`
