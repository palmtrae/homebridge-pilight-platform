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
  client?: PilightWebSocketClient

  readonly accessory: PlatformAccessory
  readonly platform: PilightPlatform
  readonly log: Logger
  accessoryInformation: Service
  services: Service[]
  
  constructor(
    platform: PilightPlatform,
    accessory: PlatformAccessory,
    client?: PilightWebSocketClient,
  ) {
    this.platform = platform
    this.accessory = accessory
    this.log = platform.log
    this.setClient(client)
    this.accessoryInformation = this.initAccessoryInformation()
    this.services = this.initServices()
    this.accessory.on(PlatformAccessoryEvent.IDENTIFY, () => this.identify())
  }

  isConnected():boolean {
    return this.client?.isConnected || false
  }
  
  setClient(client?: PilightWebSocketClient) {
    this.client = client

    // subscribe to update events coming from the pilight web socket
    this.client?.on('update', this.onUpdate.bind(this))
  }

  protected abstract onUpdate(update: PilightDeviceUpdate): void
  protected abstract initServices(): Service[];

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

  protected initAccessoryInformation(): Service {
    const accessoryInformation = this.accessory.getService(
      this.platform.Service.AccessoryInformation,
    )
    
    accessoryInformation!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Pilight')
      .setCharacteristic(this.platform.Characteristic.Model, 'None')
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, 'None')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, `${this.accessory.context.id}`)
      .setCharacteristic(this.platform.Characteristic.Name, this.getDefaultName())

    return accessoryInformation!
  }
}
