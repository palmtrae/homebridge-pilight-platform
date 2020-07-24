import { PilightWebSocketClient } from '../pilightWebSocketClient'

export type PilightDeviceUpdate = {
  devices: string[]
  values: {
    timestamp: number
    state: string
  }
}

export class PilightAccessory {
  constructor(protected readonly client: PilightWebSocketClient) {}
}
