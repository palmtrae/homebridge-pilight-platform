import {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge'

import { PilightAccessory, PilightDeviceUpdate } from './pilightAccessory'
import { PilightWebSocketClient } from '../pilightWebSocketClient'
import { PilightPlatform } from '../../platform'

/**
 * Pilight Power Switch Accessory
 */
export class PowerSwitch extends PilightAccessory {
  private service: Service
  private state: boolean

  constructor(
    private readonly platform: PilightPlatform,
    private readonly accessory: PlatformAccessory,
    protected readonly client: PilightWebSocketClient,
  ) {
    super(client)

    // Generate a default service name
    const defaultGroup = this.accessory.context.gui.group[0] || 'Default'
    const defaultName = `${this.accessory.context.gui.name} (${defaultGroup})`

    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        'Pilight-Manufacturer',
      )
      .setCharacteristic(
        this.platform.Characteristic.Model,
        'Pilight-PowerSwitch',
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        `${this.accessory.context.device.id[0].id}`,
      )
      .setCharacteristic(
        this.platform.Characteristic.ConfiguredName,
        defaultName,
      )

    this.service =
      this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch)

    // Sets the initial state of the accessory
    this.state = this.accessory.context.device.state === 'on'

    // set the service name, this is what is displayed as the default name on the Home app
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      defaultName,
    )

    // register handlers for the On/Off Characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .on('set', this.setOn.bind(this)) // SET - bind to the `setOn` method below
      .on('get', this.getOn.bind(this)) // GET - bind to the `getOn` method below

    // subscribe to update events coming from the pilight web socket
    this.client.on('update', this.onUpdate.bind(this))
  }

  onUpdate(update: PilightDeviceUpdate) {
    if (!update.devices.includes(this.accessory.context.id)) {
      return
    }

    this.state = update.values.state === 'on'
    this.service.updateCharacteristic(
      this.platform.Characteristic.On,
      this.state,
    )
    this.platform.log.debug(
      `[${this.accessory.displayName}] Setting isOn to ->`,
      this.state,
    )
  }

  /**
   * Handle "SET" requests from HomeKit
   */
  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    this.platform.log.debug(
      `[${this.accessory.displayName}] Setting isOn to ->`,
      value,
    )
    this.client.send({
      action: 'control',
      code: {
        device: this.accessory.context.id,
        state: value ? 'on' : 'off',
      },
    })
    // you must call the callback function
    callback(null)
  }

  /**
   * Handle the "GET" requests from HomeKit
   */
  getOn(callback: CharacteristicGetCallback) {
    const isOn = this.state
    this.platform.log.debug(`[${this.accessory.displayName}] isOn ->`, isOn)
    callback(null, isOn)
  }
}
