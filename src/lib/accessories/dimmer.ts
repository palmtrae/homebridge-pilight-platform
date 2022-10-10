import {
  Service,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge'

import { PilightAccessory, PilightDeviceUpdate } from './pilightAccessory'

/**
 * Pilight Dimmer Accessory
 */
export class Dimmer extends PilightAccessory {
  static SUPPORTED_PROTOCOLS = [
    'kaku_dimmer',
  ]

  static readonly ON = 'on'
  static readonly OFF = 'off'
  static readonly RETRIES = 9
  static readonly RETRY_TIMEOUT = 1000

  private service?: Service
  private state?: boolean
  private dimLevel?: number
  private retryTimer?: NodeJS.Timeout
  private retryAttempt = 0

  initServices(): Service[] {
    this.log.debug('initServices in Dimmer')
    this.service =
      this.accessory.getService(this.platform.Service.Lightbulb) ||
      this.accessory.addService(this.platform.Service.Lightbulb)
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      this.getDefaultName(),
    )

    this.updateState(this.accessory.context.device.state === Dimmer.ON)
    this.updateDimLevel(this.accessory.context.device.dimlevel || 0)

    // register handlers for the On/Off Characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .on('get', this.getOn.bind(this)) // GET - bind to the `getOn` method below
      .on('set', this.setOn.bind(this)) // SET - bind to the `setOn` method below

    // register handlers for the dim level Characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.Brightness)
      .on('get', this.getDimLevel.bind(this))
      .on('set', this.setDimLevel.bind(this))

    return [this.accessoryInformation, this.service]
  }

  setInitialState() {
    this.updateState(this.accessory.context.device.state === Dimmer.ON)
    this.updateDimLevel(this.accessory.context.device.dimlevel || 0)
  }

  updateState(state: boolean) {
    const stringState = state ? Dimmer.ON : Dimmer.OFF

    this.log.debug(`[${this.getDefaultName()}] setting state ${stringState}`)
    this.accessory.context.device.state = stringState
    this.state = state
    this.service!.updateCharacteristic(
      this.platform.Characteristic.On,
      this.state,
    )
  }

  updateDimLevel(value: number) {
    const brightness = this.dimLevelToBrightness(value)
    this.log.debug(`[${this.getDefaultName()}] setting brightness ${brightness} from dim level ${value}`)

    this.accessory.context.device.dimlevel = value
    this.dimLevel = value

    this.service!.updateCharacteristic(
      this.platform.Characteristic.Brightness,
      brightness,
    )
  }

  onUpdate(update: PilightDeviceUpdate) {
    if (!update.devices.includes(this.accessory.context.id)) {
      return
    }

    this.log.debug(`[${this.getDefaultName()}] Acting upon update`)
    this.updateState(update.values.state === Dimmer.ON)
    this.updateDimLevel(update.values.dimlevel || this.dimLevel || 0)
    this.clearRetryTimer()
  }

  /**
   * Handle the "GET" power state requests from HomeKit
   */
  getOn(callback: CharacteristicGetCallback) {
    this.log.debug(
      `[${this.getDefaultName()}] state ->`,
      this.state ? Dimmer.ON : Dimmer.OFF,
    )
    callback(null, this.state)
  }

  /**
   * Handle "SET" power state requests from HomeKit
   */
  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (!this.isConnected() || this.client === undefined) {
      callback(new Error('WebSocket not connected'))
      return
    }

    this.log.debug(`[${this.getDefaultName()}]: Wants state change`)

    const state = value ? Dimmer.ON : Dimmer.OFF
    const changed = this.state !== value

    if (changed) {
      this.log.debug(`[${this.getDefaultName()}] Changing state to ->`, state)
      this.startRetryTimer(value)
    } else {
      this.log.debug(`[${this.getDefaultName()}] Is already at state ->`, state)
      callback(null)
    }

    this.client?.send(
      {
        action: 'control',
        code: {
          device: this.accessory.context.id,
          state,
        },
      },
      (success) => {
        if (!changed) {
          return
        }

        if (success) {
          callback(null)
        } else {
          callback(new Error('WebSocket error'))
        }
      },
    )
  }

  /**
   * Handle "SET" dim level requests from HomeKit
   */
  setDimLevel(value: CharacteristicValue, callback: CharacteristicGetCallback) {
    if (!this.isConnected() || this.client === undefined) {
      callback(new Error('WebSocket not connected'))
      return
    }

    this.log.debug(`[${this.getDefaultName()}]: Wants to set dim level`)

    if (value === false) {
      this.log.debug(`[${this.getDefaultName()}]: Dim level ${value} is ignored`)
      callback(null)
      return
    }

    let wantedDimLevel = this.dimLevel
    if (typeof value === 'number') {
      wantedDimLevel = this.brightnessToDimLevel(value as number)
    }

    const changed = this.dimLevel !== wantedDimLevel

    if (changed) {
      this.log.debug(`[${this.getDefaultName()}] Changing dim level to ->`, wantedDimLevel)
    } else {
      this.log.debug(`[${this.getDefaultName()}] Is already at dim level ->`, wantedDimLevel)
      callback(null)
    }

    this.client?.send(
      {
        action: 'control',
        code: {
          device: this.accessory.context.id,
          values: {
            dimlevel: wantedDimLevel,
          },
        },
      },
      (success) => {
        if (!changed) {
          return
        }

        if (success) {
          callback(null)
        } else {
          callback(new Error('WebSocket error'))
        }
      },
    )
  }

  /**
   * Handle "GET" dim level requests from HomeKit
   */
  getDimLevel(callback: CharacteristicGetCallback) {
    if (this.state === undefined || this.dimLevel === undefined) {
      this.log.debug(`[${this.getDefaultName()}] No dim level found`)
      callback(new Error('Not found'))
    } else if (this.state === false) {
      this.log.debug(`[${this.getDefaultName()}] Current brightness is 0% because device is off`)
      callback(null, 0)
    } else {
      const brightness = this.dimLevelToBrightness(this.dimLevel)
      this.log.debug(`[${this.getDefaultName()}] Current dim level ${this.dimLevel} with brightness ${brightness}%`)
      callback(null, brightness)
    }
  }

  // Convert a percentile brightness level of 1 - 100 to a dim level of 0 - 15
  private brightnessToDimLevel(value: number) {
    return value === 0 ? 0 : Math.ceil(value / (100 / 16)) - 1
  }

  // Convert a dim level of 0 - 15 to a percentage of 1 - 100
  private dimLevelToBrightness(value: number) {
    return Math.round((value + 1) / 16 * 100)
  }

  private startRetryTimer(value: CharacteristicValue) {
    this.log.debug(`[${this.getDefaultName()}] Starting retry timer.`)
    this.retryTimer = setTimeout(() => {
      this.retryAttempt += 1
      if (this.retryAttempt > Dimmer.RETRIES) {
        this.clearRetryTimer()
        return
      }
      this.setOn(value, () => {
        this.log.debug(
          `Retry attempt ${this.retryAttempt} of ${Dimmer.RETRIES} sent`,
        )
      })
    }, Dimmer.RETRY_TIMEOUT)
  }

  private clearRetryTimer() {
    this.log.debug(`[${this.getDefaultName()}] Clearing retry timer.`)
    this.retryAttempt = 0
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer)
    }
    this.retryTimer = undefined
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

  /**
   * Determines if the device protocol is supported
   */
  public static isSupportedProtocol(protocol: string): boolean {
    return Dimmer.SUPPORTED_PROTOCOLS.includes(protocol)
  }
}
