import {
  API,
  APIEvent,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from 'homebridge'

import { PLATFORM_NAME, PLUGIN_NAME } from './settings'
import {
  PilightWebSocketClient,
  PilightWebSocketConfig,
} from './lib/pilightWebSocketClient'
import * as PilightAccessory from './lib/accessories'

export interface PilightConfig extends PlatformConfig {
  name: string
  instances: PilightWebSocketConfig[]
}

/**
 * HomebridgePilightPlatform
 */
export class PilightPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service
  public readonly Characteristic: typeof Characteristic = this.api.hap
    .Characteristic

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = []

  // Pilight websocket connections
  private clients: PilightWebSocketClient[] = []

  // Loaded and configured accessories
  private readonly mappedAccessories: Map<
    string,
    PilightAccessory.PilightAccessory
  > = new Map<string, PilightAccessory.PilightAccessory>()

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name)

    if (
      this.config.instances === undefined ||
      this.config.instances.length === 0
    ) {
      this.log.error('No pilight web socket connections configured')
    }

    this.api.on(
      APIEvent.DID_FINISH_LAUNCHING,
      this.didFinishLaunching.bind(this),
    )
    this.api.on(APIEvent.SHUTDOWN, this.shutdown.bind(this))
  }

  /**
   * Establishes a connection to all configured pilight web sockets.
   */
  didFinishLaunching(): void {
    const configs: PilightWebSocketConfig[] = this.config.instances

    configs.forEach((conf: PilightWebSocketConfig) => {
      const ws = new PilightWebSocketClient(conf, this.log, this.api)
      ws.on('config', this.discoverDevices.bind(this))
      this.clients.push(ws)
    })
  }

  /**
   * Called when homebridge is shut down
   */
  public shutdown() {
    this.clients.forEach((client) => {
      this.log.info(`Closing ws://${client.config.host}:${client.config.port}`)
      client.close()
    })
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName)
    this.accessories.push(accessory)
    this.createAccessory(accessory)
  }

  /**
   * Register and/or update devices from
   */
  discoverDevices(client: PilightWebSocketClient, message: any) {
    this.log.info(
      `Discovering devices from [${client.config.name || 'unnamed'}]@ws://${
        client.config.host
      }:${client.config.port}`,
    )

    const deviceIds = [...Object.keys(message.config.devices)]
    deviceIds.forEach((id) => {
      // Build a context object for the pilight device
      const context = {
        id,
        device: message.config.devices[id],
        gui: message.config.gui[id],
      }

      const uuid = this.api.hap.uuid.generate(id)
      const existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID === uuid,
      )

      const accessory =
        existingAccessory ||
        new this.api.platformAccessory(context.gui.name, uuid)
      accessory.context = context

      if (existingAccessory) {
        this.log.info(
          'Restoring existing accessory from cache:',
          existingAccessory.displayName,
        )
        this.api.updatePlatformAccessories([accessory])
      } else {
        this.accessories.push(accessory)
        this.log.info('Adding new accessory', context.gui.name)
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ])
      }

      this.createAccessory(accessory, client)
    })
  }

  createAccessory(
    accessory: PlatformAccessory,
    client?: PilightWebSocketClient,
  ): PilightAccessory.PilightAccessory {
    const uuid = this.api.hap.uuid.generate(accessory.context.id)

    // Don't create another PilightAccessory if it's already created.
    const existing = this.mappedAccessories.get(uuid)
    if (existing !== undefined) {
      this.log.debug(
        `Ignoring device with uuid: ${uuid}, it's already created, updating web socket client`,
      )
      existing.setClient(existing.client || client)
      return existing
    }

    // TODO: add support for other types of devices, not only PowerSwitch.
    const pilightAccessory = new PilightAccessory.PowerSwitch(
      this,
      accessory,
      client,
    )
    this.mappedAccessories.set(uuid, pilightAccessory)
    return pilightAccessory
  }
}
