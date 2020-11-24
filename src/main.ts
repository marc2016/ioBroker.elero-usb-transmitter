// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core'
import { ControlCommand, InfoData, Response, UsbTransmitterClient } from 'elero-usb-transmitter-client'
import { Job, scheduleJob } from 'node-schedule'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ioBroker {
    interface AdapterConfig {
      refreshInterval: number | string
      usbStickDevicePath: string
      deviceConfigs: DeviceConfig[]
    }

    interface DeviceConfig {
      channel: number
      name: string
      transitTime: number
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
    this.on('message', this.onMessage.bind(this))
    this.on('unload', this.onUnload.bind(this))
  }

  /**
   * Is called when databases are connected and adapter received configuration.
   */
  private async onReady(): Promise<void> {
    let refreshInterval = 1
    if (this.config.refreshInterval != '') {
      refreshInterval = Number.parseInt(<string>this.config.refreshInterval)
    }
    this.refreshJob = scheduleJob(`*/${refreshInterval} * * * *`, () => {
      const boundedRefreshInfo = this.refreshInfo.bind(this)
      boundedRefreshInfo()
    })

    this.client = new UsbTransmitterClient(this.config.usbStickDevicePath)
    await this.client.open()
    await this.createDevices()
    await this.refreshInfo()
    await this.updateDeviceNames()
    this.subscribeStates('*')
  }

  private async calcTransitTime(channel: number): Promise<number> {
    let info: Response
    try {
      info = await this.client.getInfo(channel)
    } catch (error) {
      this.log.error(error)
      return 0
    }
    let endPosition: InfoData
    let command: ControlCommand
    if (info.status == InfoData.INFO_BOTTOM_POSITION_STOP) {
      endPosition = InfoData.INFO_TOP_POSITION_STOP
      command = ControlCommand.up
    } else if (info.status == InfoData.INFO_TOP_POSITION_STOP) {
      endPosition = InfoData.INFO_BOTTOM_POSITION_STOP
      command = ControlCommand.down
    } else {
      return 0
    }
    const start = process.hrtime()
    this.client.sendControlCommand(channel, command)

    let currentInfo = await this.client.getInfo(channel)
    while (currentInfo.status != endPosition) {
      await sleep(1000)
      this.log.debug('Check info')
      try {
        currentInfo = await this.client.getInfo(channel)
      } catch (error) {
        this.log.info(error)
      }
    }
    const end = process.hrtime(start)
    const transitTimeSeconds = end[0]
    return transitTimeSeconds
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
      if (info?.status != null) {
          this.setStateChanged(`${device._id}.info`, InfoData[info.status], true)
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
      this.refreshJob?.cancel()
      this.client?.close()
      callback()
    } catch (e) {
      callback()
    }
  }

  private async sendControlCommand(deviceName: string, value: number | string): Promise<void> {
    const channelState = await this.getStateAsync(`${deviceName}.channel`)
    const channel = <number>channelState?.val
    await this.client.sendControlCommand(channel, Number.parseInt(<string>value))
    this.setStateChangedAsync(`${deviceName}.controlCommand`, value, true)
  }

  /**
   * Is called if a subscribed state changes
   */
  private onStateChange(id: string, state: ioBroker.State | null | undefined): void {
    if (state) {
      const elements = id.split('.')
      const deviceName = elements[elements.length - 2]
      const stateName = elements[elements.length - 1]

      if (stateName == 'controlCommand') {
        this.sendControlCommand(deviceName, <number>state.val)
      }
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
      { role: 'text', write: false, def: channel, defAck: true },
      undefined,
    )
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
      },
      undefined,
    )
    this.createState(`channel_${channel.toString()}`, '', 'info', { role: 'text', write: false, def: '' }, undefined)
  }

  private async onMessage(obj: ioBroker.Message): Promise<void> {
    if (!obj) {
      return
    }

    if (obj.command == 'calcTransitTime') {
      const channel = Number.parseInt(obj.message.toString())
      const transitTime = await this.calcTransitTime(channel)
      this.sendTo(obj.from, obj.command, { transitTime: transitTime }, obj.callback)
    }
    return
  }
}

function sleep(ms: number): Promise<unknown> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

if (module.parent) {
  // Export the constructor in compact mode
  module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new EleroUsbTransmitter(options)
} else {
  // otherwise start the instance directly
  ;(() => new EleroUsbTransmitter())()
}
