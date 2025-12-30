/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="./types.d.ts" />
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
import * as utils from '@iobroker/adapter-core'
import { ControlCommand, InfoData, UsbTransmitterClient } from 'elero-usb-transmitter-client'

import { DeviceManager } from './lib/device-manager'

const REFRESH_INTERVAL_IN_MINUTES_DEFAULT = 5

class EleroUsbTransmitter extends utils.Adapter {
  private refreshTimeout: NodeJS.Timeout | undefined
  private refreshIntervalInMinutes = REFRESH_INTERVAL_IN_MINUTES_DEFAULT

  private client!: UsbTransmitterClient
  private deviceManager!: DeviceManager

  public constructor(options: Partial<utils.AdapterOptions> = {}) {
    super({
      ...options,
      name: 'elero-usb-transmitter',
    })

    this.on('ready', this.onReady.bind(this))
    this.on('stateChange', this.onStateChange.bind(this))
    this.on('unload', this.onUnload.bind(this))
  }

  /**
   * Is called when databases are connected and adapter received configuration.
   */
  private async onReady(): Promise<void> {
    if (!this.config.usbStickDevicePath) {
      this.setState('info.connection', false, true)
      this.log.error('Path for device is not set.')
      return
    }
    this.client = new UsbTransmitterClient(this.config.usbStickDevicePath)
    this.deviceManager = new DeviceManager(this, this.client)
    this.log.debug('Try to open connection to stick.')
    await this.client.open()
    this.log.debug('Connection is open.')
    await this.deviceManager.createDevices()
    await this.refreshInfo()
    await this.deviceManager.updateDeviceNames()
    this.subscribeStates('*')

    this.setState('info.connection', true, true)
    this.refreshIntervalInMinutes = this.config?.refreshInterval ?? REFRESH_INTERVAL_IN_MINUTES_DEFAULT

    this.setupRefreshTimeout()
  }
  private async refreshInfo(): Promise<void> {
    this.log.info('Refreshing info of devices.')
    const devices = await this.getDevicesAsync()
    for (const device of devices) {
      const name = device.common.name
      this.log.debug(`Refreshing info of device ${name}.`)
      const channelState = await this.getStateAsync(`${device._id}.channel`)
      const channel = <number>channelState?.val
      try {
        const info = await this.client.getInfo(channel)
        if (info == null) {
          this.log.debug(`No info for channel ${channel} returned.`)
          continue
        }
        this.log.debug(`Info for channel ${channel} returned.`)
        if (info.status != null) {
          this.log.debug(`Status of channel ${channel}: ${info.status}`)
          const statusText = InfoData[info.status]
          if (statusText) {
            await this.setStateChangedAsync(`${device._id}.info`, statusText, true)
          } else {
            this.log.debug(`Unknown status: ${info.status}`)
          }

          if (info.status == InfoData.INFO_BOTTOM_POSITION_STOP) {
            await this.setStateChangedAsync(`${device._id}.open`, false, true)
          } else if (info.status == InfoData.INFO_TOP_POSITION_STOP) {
            await this.setStateChangedAsync(`${device._id}.open`, true, true)
          }
        }
        this.setState('info.connection', true, true)
      } catch (error) {
        this.setState('info.connection', false, true)
        this.log.error(`Error while refreshing device: ${error}.`)
      }
    }
  }

  /**
   * Is called when adapter shuts down - callback has to be called under any circumstances!
   */
  private onUnload(callback: () => void): void {
    try {
      if (this.refreshTimeout) clearTimeout(this.refreshTimeout)
      this.client?.close()
      callback()
    } catch (_e) {
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

  private async setOpen(deviceName: string, newState: boolean): Promise<void> {
    if (newState) {
      await this.sendControlCommand(deviceName, ControlCommand.up)
    } else {
      await this.sendControlCommand(deviceName, ControlCommand.down)
    }

    await this.setStateChangedAsync(`${deviceName}.open`, newState, true)
  }

  /**
   * Is called if a subscribed state changes
   */
  private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
    if (state) {
      if (state.ack) return

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
      if (stateName == 'open') {
        this.log.debug(`new value for open: ${state.val}`)
        try {
          await this.setOpen(deviceName, <boolean>state.val)
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

  private async handleClientError(error: unknown): Promise<void> {
    this.log.debug('Try to handle error.')

    this.setState('info.connection', false, true)
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
      this.setState('info.connection', true, true)
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
