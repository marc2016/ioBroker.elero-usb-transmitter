import * as utils from '@iobroker/adapter-core'
import { ControlCommand, UsbTransmitterClient } from 'elero-usb-transmitter-client'

export class DeviceManager {
  private adapter: utils.AdapterInstance
  private client: UsbTransmitterClient

  constructor(adapter: utils.AdapterInstance, client: UsbTransmitterClient) {
    this.adapter = adapter
    this.client = client
  }

  public async createDevices(): Promise<void> {
    let activeChannels: number[]
    try {
      this.adapter.log.debug('Check aktive channels.')
      activeChannels = await this.client.checkChannels()
      this.adapter.log.debug(`Got ${activeChannels.length} active channels.`)
    } catch (error) {
      this.adapter.log.error(`Can not check active channels: ${error}`)
      await this.client.close()
      await this.client.open()
      activeChannels = await this.client.checkChannels()
    }

    this.adapter.log.debug('Iterate over active channels and create devices.')
    activeChannels.forEach((element) => {
      this.adapter.log.info(`Active channel: ${element}`)
      this.createEleroDevice(element)
    })
  }

  private createEleroDevice(channel: number): void {
    this.adapter.log.debug(`Create device with channel ${channel}.`)

    // create device with channel number as ID.
    this.adapter.createDevice(`channel_${channel.toString()}`)

    this.adapter.log.debug(`Create state channel.`)
    this.adapter.createState(
      `channel_${channel.toString()}`,
      '',
      'channel',
      { role: 'text', write: false, def: channel, defAck: true, type: 'number' },
      undefined,
    )

    this.adapter.log.debug(`Create state controlCommand.`)
    this.adapter.createState(
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

    this.adapter.log.debug(`Create state info.`)
    this.adapter.createState(
      `channel_${channel.toString()}`,
      '',
      'info',
      { role: 'text', write: false, def: '', type: 'string' },
      undefined,
    )

    this.adapter.log.debug(`Create state open.`)
    this.adapter.createState(
      `channel_${channel.toString()}`,
      '',
      'open',
      { role: 'switch', read: true, write: true, def: false, type: 'boolean' },
      undefined,
    )

    this.adapter.log.debug(`Device with channel ${channel} created.`)
  }

  public async updateDeviceNames(): Promise<void> {
    for (const deviceConfig of this.adapter.config.deviceConfigs) {
      await this.adapter.extendObjectAsync(`channel_${deviceConfig.channel}`, {
        common: {
          name: deviceConfig.name,
        },
      })
    }
  }
}
