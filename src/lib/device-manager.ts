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
    for (const channel of activeChannels) {
      this.adapter.log.info(`Active channel: ${channel}`)
      await this.createEleroDevice(channel)
    }
  }

  private async createEleroDevice(channel: number): Promise<void> {
    this.adapter.log.debug(`Create device with channel ${channel}.`)

    // create device with channel number as ID.
    await this.adapter.setObjectNotExistsAsync(`channel_${channel}`, {
      type: 'device',
      common: {
        name: `channel_${channel}`,
      },
      native: {},
    })

    this.adapter.log.debug(`Create state channel.`)
    await this.adapter.setObjectNotExistsAsync(`channel_${channel}.channel`, {
      type: 'state',
      common: {
        name: 'Channel',
        role: 'text',
        write: false,
        def: channel,
        defAck: true,
        type: 'number',
        read: true,
      },
      native: {},
    })

    this.adapter.log.debug(`Create state controlCommand.`)
    await this.adapter.setObjectNotExistsAsync(`channel_${channel}.controlCommand`, {
      type: 'state',
      common: {
        name: 'Control Command',
        role: 'state',
        states: {
          16: ControlCommand[16],
          32: ControlCommand[32],
          36: ControlCommand[36],
          64: ControlCommand[64],
          68: ControlCommand[68],
        },
        write: true,
        read: true,
        def: 16,
        defAck: true,
        type: 'number',
      },
      native: {},
    })

    this.adapter.log.debug(`Create state info.`)
    await this.adapter.setObjectNotExistsAsync(`channel_${channel}.info`, {
      type: 'state',
      common: {
        name: 'Info',
        role: 'text',
        write: false,
        read: true,
        def: '',
        type: 'string',
      },
      native: {},
    })

    this.adapter.log.debug(`Create state open.`)
    await this.adapter.setObjectNotExistsAsync(`channel_${channel}.open`, {
      type: 'state',
      common: {
        name: 'Open',
        role: 'switch',
        read: true,
        write: true,
        def: false,
        type: 'boolean',
      },
      native: {},
    })

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
