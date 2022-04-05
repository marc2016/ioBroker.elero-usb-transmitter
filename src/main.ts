// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core'
import { ControlCommand, InfoData, UsbTransmitterClient } from 'elero-usb-transmitter-client'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ioBroker {
    interface AdapterConfig {
      refreshInterval: number
      usbStickDevicePath: string
      deviceConfigs: DeviceConfig[]
    }

    interface DeviceConfig {
      channel: number
      name: string
    }
  }
}

const REFRESH_INTERVAL_IN_MINUTES_DEFAULT = 5

class EleroUsbTransmitter extends utils.Adapter {
  private refreshTimeout: NodeJS.Timeout | undefined
  private refreshIntervalInMinutes = REFRESH_INTERVAL_IN_MINUTES_DEFAULT

  private client!: UsbTransmitterClient

  public constructor(options: Partial<utils.AdapterOptions> = {}) {
    super({
      ...options,
      name: 'elero-usb-transmitter',
    })

    this.on('ready', this.onReady.bind(this))
    this.on('stateChange', this.onStateChange.bind(this))
    // this.on('objectChange', this.onObjectChange.bind(this));
    this.on('message', this.onMessage.bind(this))
    this.on('unload', this.onUnload.bind(this))
  }

  /**
   * Is called when databases are connected and adapter received configuration.
   */
  private async onReady(): Promise<void> {
    this.client = new UsbTransmitterClient(this.config.usbStickDevicePath)
    this.log.debug('Try to open connection to stick.')
    await this.client.open()
    this.log.debug('Connection is open.')
    await this.createDevices()
    await this.refreshInfo()
    await this.updateDeviceNames()
    this.subscribeStates('*')

    this.refreshIntervalInMinutes = this.config?.refreshInterval ?? REFRESH_INTERVAL_IN_MINUTES_DEFAULT

    this.setupRefreshTimeout()
  }

  private async updateDeviceNames(): Promise<void> {
    this.config.deviceConfigs.forEach(async (deviceConfig) => {
      await this.extendObjectAsync(`channel_${deviceConfig.channel}`, {
        common: {
          name: deviceConfig.name,
        },
      })
    })
  }

  private async refreshInfo(): Promise<void> {
    this.log.info('Refreshing info of devices.')
    const devices = await this.getDevicesAsync()
    devices.forEach(async (device) => {
      const name = device.common.name
      this.log.debug(`Refreshing info of device ${name}.`)
      const channelState = await this.getStateAsync(`${name}.channel`)
      const channel = <number>channelState?.val
      try {
        const info = await this.client.getInfo(channel)
        if (info == null) {
          this.log.debug(`No info for channel ${channel} returned.`)
          return
        }
        this.log.debug(`Info for channel ${channel} returned.`)
        if (info.status != null) {
          this.log.debug(`Status of channel ${channel}: ${info.status}`)
          this.setStateChanged(`${device._id}.info`, InfoData[info.status], true)

          if (info.status == InfoData.INFO_BOTTOM_POSITION_STOP) {
            await this.setStateChangedAsync(`${device._id}.level`, 100, true)
            await this.setStateChangedAsync(`${device._id}.level_inverted`, 0, true)
          } else if (info.status == InfoData.INFO_TOP_POSITION_STOP) {
            await this.setStateChangedAsync(`${device._id}.level`, 0, true)
            await this.setStateChangedAsync(`${device._id}.level_inverted`, 100, true)
          }
        }
      } catch (error) {
        this.log.error(`Error while refreshing device: ${error}.`)
      }
    })
  }

  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   */
  private onUnload(callback: () => void): void {
    try {
      if (this.refreshTimeout) clearTimeout(this.refreshTimeout)
      this.client?.close()
      callback()
    } catch (e) {
      callback()
    }
  }

  private async sendControlCommand(deviceName: string, value: number | string): Promise<void> {
    const channelState = await this.getStateAsync(`${deviceName}.channel`)
    const channel = <number>channelState?.val
    this.log.debug(`Try to send control command ${value} to ${deviceName} with channel ${channel}.`)
    const response = await this.client.sendControlCommand(channel, Number.parseInt(<string>value))
    this.log.info(`Response from sending command ${value} to device ${deviceName}: ${JSON.stringify(response)}`)
    await this.setStateChangedAsync(`${deviceName}.controlCommand`, value, true)
  }

  private async setLevel(deviceName: string, newLevel: number, inverted = false): Promise<void> {
    this.log.debug(`Try to set level ${newLevel} for ${deviceName}.`)
    const channelState = await this.getStateAsync(`${deviceName}.channel`)
    if (channelState == null) return

    const channel = <number>channelState.val

    let commandFor100 = ControlCommand.down
    let commandFor0 = ControlCommand.up

    if (inverted) {
      commandFor100 = ControlCommand.up
      commandFor0 = ControlCommand.down
    }

    if (newLevel >= 100) {
      await this.client.sendControlCommand(channel, commandFor100)
    } else {
      await this.client.sendControlCommand(channel, commandFor0)
    }

    this.log.debug(`SetLevel finished.`)
  }

  /**
   * Is called if a subscribed state changes
   */
  private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
    if (state) {
      const elements = id.split('.')
      const deviceName = elements[elements.length - 2]
      const stateName = elements[elements.length - 1]

      if (stateName == 'controlCommand') {
        try {
          await this.sendControlCommand(deviceName, <number>state.val)
        } catch (error) {
          this.log.error(`Can not send control command: ${error}`)
        }
      }

      if (stateName == 'level') {
        this.log.debug(`new level ${state.val}`)
        try {
          await this.setLevel(deviceName, <number>state.val)
          await this.setStateChangedAsync(`${deviceName}.level`, <number>state.val, true)
        } catch (e) {
          this.handleClientError(e)
        }
      }

      if (stateName == 'level_inverted') {
        this.log.debug(`new level_inverted ${state.val}`)
        try {
          await this.setLevel(deviceName, <number>state.val, true)
          await this.setStateChangedAsync(`${deviceName}.level_inverted`, <number>state.val, true)
        } catch (e) {
          this.handleClientError(e)
        }
      }

      // The state was changed
      this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`)
    } else {
      // The state was deleted
      this.log.info(`state ${id} deleted`)
    }
  }

  private async createDevices(): Promise<void> {
    let activeChannels: number[]
    try {
      this.log.debug('Check aktive channels.')
      activeChannels = await this.client.checkChannels()
      this.log.debug(`Got ${activeChannels.length} active channels.`)
    } catch (error) {
      this.log.error(`Can not check active channels: ${error}`)
      await this.client.close()
      await this.client.open()
      activeChannels = await this.client.checkChannels()
    }

    this.log.debug('Iterate over active channels and create devices.')
    activeChannels.forEach((element) => {
      this.log.info(`Active channel: ${element}`)
      this.createEleroDevice(element)
    })
  }

  private createEleroDevice(channel: number): void {
    this.log.debug(`Create device with channel ${channel}.`)

    // create device with channel number as ID.
    this.createDevice(`channel_${channel.toString()}`)

    this.log.debug(`Create state channel.`)
    this.createState(
      `channel_${channel.toString()}`,
      '',
      'channel',
      { role: 'text', write: false, def: channel, defAck: true, type: 'number' },
      undefined,
    )

    this.log.debug(`Create state controlCommand.`)
    this.createState(
      `channel_${channel.toString()}`,
      '',
      'controlCommand',
      {
        role: 'state',
        states: {
          16: ControlCommand[16],
          32: ControlCommand[32],
          36: ControlCommand[36],
          64: ControlCommand[64],
          68: ControlCommand[68],
        },
        write: true,
        def: 16,
        defAck: true,
        type: 'number',
      },
      undefined,
    )

    this.log.debug(`Create state info.`)
    this.createState(
      `channel_${channel.toString()}`,
      '',
      'info',
      { role: 'text', write: false, def: '', type: 'string' },
      undefined,
    )

    this.log.debug(`Create state level.`)
    this.createState(
      `channel_${channel.toString()}`,
      '',
      'level',
      { role: 'level.blind', write: true, def: 0, min: 0, max: 100, unit: '%', type: 'number' },
      undefined,
    )

    this.log.debug(`Create state level_inverted.`)
    this.createState(
      `channel_${channel.toString()}`,
      '',
      'level_inverted',
      { role: 'level.blind', write: true, def: 0, min: 0, max: 100, unit: '%', type: 'number' },
      undefined,
    )
    this.log.debug(`Device with channel ${channel} created.`)
  }

  private async onMessage(obj: ioBroker.Message): Promise<void> {
    if (!obj) {
      return
    }
  }

  private async handleClientError(error: unknown): Promise<void> {
    this.log.debug('Try to handle error.')

    if (error instanceof Error) {
      this.log.error(`Unknown error: ${error}. Stack: ${error.stack}`)
    }
  }

  private setupRefreshTimeout(): void {
    this.log.debug('setupRefreshTimeout')
    const refreshIntervalInMilliseconds = this.refreshIntervalInMinutes * 60 * 1000
    this.log.debug(`refreshIntervalInMilliseconds=${refreshIntervalInMilliseconds}`)
    this.refreshTimeout = setTimeout(this.refreshTimeoutFunc.bind(this), refreshIntervalInMilliseconds)
  }

  private async refreshTimeoutFunc(): Promise<void> {
    this.log.debug(`refreshTimeoutFunc started.`)
    try {
      this.refreshInfo()
      this.setupRefreshTimeout()
    } catch (error) {
      await this.handleClientError(error)
    }
  }
}

if (module.parent) {
  // Export the constructor in compact mode
  module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new EleroUsbTransmitter(options)
} else {
  // otherwise start the instance directly
  ;(() => new EleroUsbTransmitter())()
}
