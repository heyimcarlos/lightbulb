import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const electronPath = require("electron")

if (typeof electronPath !== "string") throw new Error("electron did not resolve to an executable path")
if (!(await Bun.file(electronPath).exists())) throw new Error(`electron executable was not found at ${electronPath}`)

console.log(`Electron ready at ${electronPath}`)
