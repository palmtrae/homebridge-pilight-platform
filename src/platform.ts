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
  }

  /**
   * Called when homebridge is shut down
   */
  public destroy() {
    this.clients.forEach(client => {
      this.log.info(`Closing ws://${client.config.host}:${client.config.port}`)
      client.close()
    })
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
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName)
    this.accessories.push(accessory)
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
    this.log.debug('debug data', client, message)
    
    Object.keys(message.config.devices).forEach((device) => {
      // Build a context object for the pilight device
      const context = {
        id: device,
        device: message.config.devices[device],
        gui: message.config.gui[device],
      }

      // Generate unique UUID based on pilight device id
      const uuid = this.api.hap.uuid.generate(device)

      // Check if the device is already cached
      const existingAccessory = this.accessories.find(
        (accessory) => accessory.UUID === uuid,
      )

      // TODO: add support for other types of devices, not only PowerSwitch.
      if (existingAccessory) {
        // Restore and update context of existing device.
        this.log.info(
          'Restoring existing accessory from cache:',
          existingAccessory.displayName,
        )
        existingAccessory.context = context
        this.api.updatePlatformAccessories([existingAccessory])

        new PilightAccessory.PowerSwitch(this, existingAccessory, client)
      } else {
        // Create new device.
        this.log.info('Adding new accessory', context.gui.name)

        // create a new accessory
        const accessory = new this.api.platformAccessory(context.gui.name, uuid)

        accessory.context = context

        new PilightAccessory.PowerSwitch(this, accessory, client)

        // link the accessory to your platform
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
          accessory,
        ])
      }
    })
  }
}
