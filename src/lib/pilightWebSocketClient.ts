import WebSocket from 'ws'
import { Logger, API } from 'homebridge'
import { EventEmitter } from 'events'
import { OperationQueue } from './operationQueue'

export type PilightWebSocketConfig = {
  name?: string
  host: string
  port: number
  interval: number
}

export class PilightWebSocketClient extends EventEmitter {
  protected ws: WebSocket
  protected messageQueue: OperationQueue = new OperationQueue()

  public constructor(
    public readonly config: PilightWebSocketConfig,
    public readonly log: Logger,
    public readonly api: API,
  ) {
    super()
    this.ws = new WebSocket(`ws://${this.config.host}:${this.config.port}`)
    this.ws.on('open', this.onOpen.bind(this))
    this.ws.on('close', this.onClose.bind(this))
    this.ws.on('message', this.onMessage.bind(this))
    this.ws.on('error', this.onError.bind(this))
    this.setMaxListeners(500)
  }

  protected onOpen() {
    this.log.info(
      `WebSocket connection to ${this.config.host}:${this.config.port} established successfully`,
    )
    this.getConfig()
  }

  protected onClose(code: number, reason: string) {
    this.log.info(`WebSocket closed with code ${code} and reason: ${reason}`)
  }

  protected onMessage(data: WebSocket.Data) {
    if (typeof data === 'string') {
      const message = JSON.parse(data as string)
      if (!message) {
        return
      }

      if (PilightWebSocketClient.isMessageConfigKind(message)) {
        this.log.debug('Received config with data', message)
        this.emit('config', this, message)
      } else if (PilightWebSocketClient.isMessageValuesKind(message)) {
        this.log.debug('Received values with data', message)
        this.emit('values', this, message)
      } else if (PilightWebSocketClient.isMessageUpdateKind(message)) {
        this.log.debug('Received updates with data', message)
        this.emit('update', message)
      }
    } else {
      this.log.error('Message received with unhandled data type', data)
    }
  }

  protected static isMessageConfigKind(message: any): boolean {
    return (
      typeof message.message !== 'undefined' && message.message === 'config'
    )
  }

  protected static isMessageValuesKind(message: any): boolean {
    return (
      typeof message.message !== 'undefined' && message.message === 'values'
    )
  }

  protected static isMessageUpdateKind(message: any): boolean {
    return (
      typeof message.origin !== 'undefined' &&
      message.origin === 'update' &&
      typeof message.type !== 'undefined' &&
      typeof message.devices !== 'undefined' &&
      typeof message.values !== 'undefined'
    )
  }

  protected onError(error: Error) {
    this.log.error(error.toString())
  }

  public getConfig() {
    this.send({ action: 'request config' })
  }

  public getValues() {
    this.send({ action: 'request values' })
  }

  public send(payload: Record<string, unknown>) {
    this.messageQueue.push(async () => {
      try {
        const message = JSON.stringify(payload)
        this.log.debug('Sending message', payload)
        this.ws.send(message)
        await new Promise((resolve) =>
          setTimeout(() => {
            resolve()
          }, this.config.interval),
        )
      } catch (e) {
        this.log.error(e.toString())
      }
    })
  }
}
