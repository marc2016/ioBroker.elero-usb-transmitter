declare namespace ioBroker {
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
