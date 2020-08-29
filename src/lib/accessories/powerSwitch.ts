import {
  Service,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge'

import { PilightAccessory, PilightDeviceUpdate } from './pilightAccessory'

/**
 * Pilight Power Switch Accessory
 */
export class PowerSwitch extends PilightAccessory {
  static readonly ON = 'on'
  static readonly OFF = 'off'

  private service?: Service
  private state?: boolean

  initServices(): Service[] {
    this.log.debug('initServices in PowerSwitch')
    this.service =
      this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch)
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      this.getDefaultName(),
    )
    this.setState(this.accessory.context.device.state === PowerSwitch.ON)

    // register handlers for the On/Off Characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .on('set', this.setOn.bind(this)) // SET - bind to the `setOn` method below
      .on('get', this.getOn.bind(this)) // GET - bind to the `getOn` method below

    return [this.accessoryInformation, this.service]
  }

  setInitialState() {
    this.setState(this.accessory.context.device.state === PowerSwitch.ON)
  }

  setState(state: boolean) {
    this.log.debug(
      'Setting state',
      this.getDefaultName(),
      state ? PowerSwitch.ON : PowerSwitch.OFF,
    )
    this.accessory.context.device.state = state
      ? PowerSwitch.ON
      : PowerSwitch.OFF
    this.state = state
    this.service!.updateCharacteristic(
      this.platform.Characteristic.On,
      this.state,
    )
  }

  onUpdate(update: PilightDeviceUpdate) {
    if (!update.devices.includes(this.accessory.context.id)) {
      return
    }
    this.log.debug(`[${this.getDefaultName()}] Acting upon update`)
    this.setState(update.values.state === PowerSwitch.ON)
  }

  /**
   * Handle "SET" requests from HomeKit
   */
  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (!this.isConnected() || this.client === undefined) {
      callback(new Error('WebSocket not connected'))
      return
    }

    const state = value ? PowerSwitch.ON : PowerSwitch.OFF
    this.log.debug(`[${this.getDefaultName()}] Setting to ->`, state)

    this.client?.send(
      {
        action: 'control',
        code: {
          device: this.accessory.context.id,
          state,
        },
      },
      (success) => {
        if (success) {
          callback(null)
        } else {
          callback(new Error('WebSocket error'))
        }
      },
    )
  }

  /**
   * Handle the "GET" requests from HomeKit
   */
  getOn(callback: CharacteristicGetCallback) {
    this.log.debug(
      `[${this.getDefaultName()}] state ->`,
      this.state ? PowerSwitch.ON : PowerSwitch.OFF,
    )
    callback(null, this.state)
  }

  /**
   * Handle "identify" via HomeKit UI.
   */
  async identify() {
    const Characteristic = this.platform.Characteristic
    if (this.state) {
      this.service!.setCharacteristic(Characteristic.On, false)
      setTimeout(() => {
        this.service!.setCharacteristic(Characteristic.On, true)
      }, 1000)
    } else {
      this.service!.setCharacteristic(Characteristic.On, true)
      setTimeout(() => {
        this.service!.setCharacteristic(Characteristic.On, false)
      }, 1000)
    }
  }
}
