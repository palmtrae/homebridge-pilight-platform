import * as PilightAccessory from './accessories'
import {
  Logger,
} from 'homebridge'

/**
 * Determines if the protocol is supported by any PilightAccessory type.
 *
 * @param protocol string
 * @returns boolean indicating if the protocol is supported
 */
export function isProtocolSupported(protocol: string): boolean {
  return PilightAccessory.PowerSwitch.isSupportedProtocol(protocol)
      || PilightAccessory.Dimmer.isSupportedProtocol(protocol)
}
