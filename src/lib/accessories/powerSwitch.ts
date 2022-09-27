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
  static SUPPORTED_PROTOCOLS = [
    'kaku_switch',
    'nexa_switch',
    'beamish_switch',
    'kaku_switch_old',
    'clarus_switch',
    'elro_300_switch',
    'elro_400_switch',
    'elro_800_switch',
    'coco_switch',
    'dio_switch',
    'intertechno_old',
    'intertechno_switch',
    'smartwares_switch',
    'brennenstuhl',
    'cogex',
    'duwi',
    'rsl366',
    'techlico_switch',
    'cleverwatts',
    'quigg',
    'gt1000',
    'quigg_gt7000',
    'impuls',
    'promax',
    'selectremote',
    'silvercrest',
    'x10',
  ]

  static readonly ON = 'on'
  static readonly OFF = 'off'
  static readonly RETRIES = 9
  static readonly RETRY_TIMEOUT = 1000

  private service?: Service
  private state?: boolean
  private retryTimer?: NodeJS.Timeout
  private retryAttempt = 0

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
    this.clearRetryTimer()
  }

  /**
   * Handle "SET" requests from HomeKit
   */
  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    if (!this.isConnected() || this.client === undefined) {
      callback(new Error('WebSocket not connected'))
      return
    }

    this.log.debug(`[${this.getDefaultName()}]: Wants state change`)

    const state = value ? PowerSwitch.ON : PowerSwitch.OFF
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

  private startRetryTimer(value: CharacteristicValue) {
    this.log.debug(`[${this.getDefaultName()}] Starting retry timer.`)
    this.retryTimer = setTimeout(() => {
      this.retryAttempt += 1
      if (this.retryAttempt > PowerSwitch.RETRIES) {
        this.clearRetryTimer()
        return
      }
      this.setOn(value, () => {
        this.log.debug(
          `Retry attempt ${this.retryAttempt} of ${PowerSwitch.RETRIES} sent`,
        )
      })
    }, PowerSwitch.RETRY_TIMEOUT)
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

  /**
   * Determines if the device protocol is supported
   */
  public static isSupportedProtocol(protocol: string): boolean {
    return PowerSwitch.SUPPORTED_PROTOCOLS.includes(protocol)
  }
}
