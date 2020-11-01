// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core'
import { ControlCommand, UsbTransmitterClient } from 'elero-usb-transmitter-client'
import { Job, scheduleJob } from 'node-schedule'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ioBroker {
    interface AdapterConfig {
      refreshInterval: number
      usbStickDevicePath: string
    }
  }
}

class EleroUsbTransmitter extends utils.Adapter {
  private refreshJob: Job | undefined
  private client!: UsbTransmitterClient

  public constructor(options: Partial<utils.AdapterOptions> = {}) {
    super({
      ...options,
      name: 'elero-usb-transmitter',
    })

    this.on('ready', this.onReady.bind(this))
    this.on('stateChange', this.onStateChange.bind(this))
    // this.on('objectChange', this.onObjectChange.bind(this));
    // this.on('message', this.onMessage.bind(this));
    this.on('unload', this.onUnload.bind(this))
  }

  /**
   * Is called when databases are connected and adapter received configuration.
   */
  private async onReady(): Promise<void> {
    const refreshInterval = this.config.refreshInterval ?? 5
    this.refreshJob = scheduleJob(`*/${refreshInterval} * * * *`, () => {
      return null
    })

    this.client = new UsbTransmitterClient(this.config.usbStickDevicePath)
    await this.client.open()
    this.createDevices()

    this.subscribeStates('*')
  }

  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   */
  private onUnload(callback: () => void): void {
    try {
      this.refreshJob?.cancel()
      callback()
    } catch (e) {
      callback()
    }
  }

  /**
   * Is called if a subscribed state changes
   */
  private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
    if (state) {
      // The state was changed
      this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`)
    } else {
      // The state was deleted
      this.log.info(`state ${id} deleted`)
    }
  }

  private async createDevices(): Promise<void> {
    const activeChannels = await this.client.checkChannels()
    activeChannels.forEach((element) => {
      this.log.info(`Active channel: ${element}`)
      this.createEleroDevice(element)
    })
  }

  private createEleroDevice(channel: number): void {
    this.createDevice(`channel_${channel.toString()}`)
    this.createState(
      `channel_${channel.toString()}`,
      '',
      'channel',
      { role: 'text', write: false, def: channel },
      undefined,
    )
    this.createState(
      `channel_${channel.toString()}`,
      '',
      'controlCommand',
      {
        role: 'state',
        states: {
          0: ControlCommand[0],
          1: ControlCommand[1],
          2: ControlCommand[2],
          3: ControlCommand[3],
          4: ControlCommand[4],
        },
        write: true,
        def: '',
      },
      undefined,
    )
    this.createState(`channel_${channel.toString()}`, '', 'info', { role: 'text', write: false, def: '' }, undefined)
  }
}

if (module.parent) {
  // Export the constructor in compact mode
  module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new EleroUsbTransmitter(options)
} else {
  // otherwise start the instance directly
  ;(() => new EleroUsbTransmitter())()
}
