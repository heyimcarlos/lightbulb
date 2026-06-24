/// <reference types="@solidjs/start/env" />

import type { Actor } from "@opencode-ai/console-core/actor.js"
import type { FetchEvent } from "@solidjs/start/server"

declare namespace App {
  export interface RequestEventLocals {
    actor?: Actor.Info | Promise<Actor.Info>
  }
}

declare module "solid-js/web" {
  interface RequestEvent extends FetchEvent {
    serverOnly?: boolean
  }
}
