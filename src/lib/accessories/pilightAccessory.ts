import { PilightWebSocketClient } from '../pilightWebSocketClient'
import {
  Logger,
  PlatformAccessory,
  PlatformAccessoryEvent,
  Service,
} from 'homebridge'
import { PilightPlatform } from '../../platform'

export type PilightDeviceUpdate = {
  devices: string[]
  values: {
    timestamp: number
    state: string
  }
}

export abstract class PilightAccessory {
  readonly client: PilightWebSocketClient
  readonly accessory: PlatformAccessory
  readonly platform: PilightPlatform
  readonly log: Logger
  services: Service[];
  reachable: boolean;

  constructor(
    platform: PilightPlatform,
    accessory: PlatformAccessory,
    client: PilightWebSocketClient,
  ) {
    this.platform = platform
    this.client = client
    this.accessory = accessory
    this.log = platform.log
    this.services = this.initServices()
    this.reachable = true
    this.accessory.on(PlatformAccessoryEvent.IDENTIFY, () => this.identify())
    
    // subscribe to update events coming from the pilight web socket
    this.client.on('update', this.onUpdate.bind(this))
  }
  
  protected abstract onUpdate(update: PilightDeviceUpdate): void

  identify(): void { 
    // Used to identify the device in question via HomeKit
  }
  
  getServices(): Service[] {
    return this.services
  }

  getDefaultName(): string {
    const defaultGroup = this.accessory.context.gui.group[0] || 'Default'
    const defaultName = `${this.accessory.context.gui.name} (${defaultGroup})`
    return defaultName
  }

  protected abstract initServices(): Service[];

  protected initAccessoryInformation(): Service {
    const accessoryInformation = this.accessory.getService(
      this.platform.Service.AccessoryInformation,
    )
    
    accessoryInformation!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Pilight')
      .setCharacteristic(this.platform.Characteristic.Model, 'None')
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, 'None')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `${this.accessory.context.id}`)
      .setCharacteristic(
        this.platform.Characteristic.ConfiguredName,
        this.getDefaultName(),
      )

    return accessoryInformation!
  }

}
