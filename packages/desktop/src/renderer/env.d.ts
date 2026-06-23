import type { ElectronAPI } from "../preload/types"

declare global {
  interface ImportMetaEnv {
    readonly OPENCODE_DESKTOP_QA_ROUTE?: string
  }

  interface Window {
    api: ElectronAPI
    __OPENCODE__?: {
      deepLinks?: string[]
    }
  }
}
