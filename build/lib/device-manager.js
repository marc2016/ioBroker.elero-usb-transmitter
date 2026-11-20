"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceManager = void 0;
const elero_usb_transmitter_client_1 = require("elero-usb-transmitter-client");
class DeviceManager {
    adapter;
    client;
    constructor(adapter, client) {
        this.adapter = adapter;
        this.client = client;
    }
    async createDevices() {
        let activeChannels;
        try {
            this.adapter.log.debug('Check aktive channels.');
            activeChannels = await this.client.checkChannels();
            this.adapter.log.debug(`Got ${activeChannels.length} active channels.`);
        }
        catch (error) {
            this.adapter.log.warn(`Can not check active channels, reconnecting: ${error}`);
            try {
                await this.client.close().catch(() => undefined);
                await this.client.open();
                activeChannels = await this.client.checkChannels();
            }
            catch (retryError) {
                this.adapter.log.error(`Can not check active channels after reconnect: ${retryError}`);
                return;
            }
        }
        this.adapter.log.debug('Iterate over active channels and create devices.');
        for (const channel of activeChannels) {
            this.adapter.log.info(`Active channel: ${channel}`);
            await this.createEleroDevice(channel);
        }
    }
    async createEleroDevice(channel) {
        this.adapter.log.debug(`Create device with channel ${channel}.`);
        // create device with channel number as ID.
        await this.adapter.setObjectNotExistsAsync(`channel_${channel}`, {
            type: 'device',
            common: {
                name: `channel_${channel}`,
            },
            native: {},
        });
        this.adapter.log.debug(`Create state channel.`);
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
        });
        this.adapter.log.debug(`Create state controlCommand.`);
        await this.adapter.setObjectNotExistsAsync(`channel_${channel}.controlCommand`, {
            type: 'state',
            common: {
                name: 'Control Command',
                role: 'state',
                states: {
                    16: elero_usb_transmitter_client_1.ControlCommand[16],
                    32: elero_usb_transmitter_client_1.ControlCommand[32],
                    36: elero_usb_transmitter_client_1.ControlCommand[36],
                    64: elero_usb_transmitter_client_1.ControlCommand[64],
                    68: elero_usb_transmitter_client_1.ControlCommand[68],
                },
                write: true,
                read: true,
                def: 16,
                defAck: true,
                type: 'number',
            },
            native: {},
        });
        this.adapter.log.debug(`Create state info.`);
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
        });
        this.adapter.log.debug(`Create state open.`);
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
        });
        this.adapter.log.debug(`Device with channel ${channel} created.`);
    }
    async updateDeviceNames() {
        for (const deviceConfig of this.adapter.config.deviceConfigs) {
            await this.adapter.extendObjectAsync(`channel_${deviceConfig.channel}`, {
                common: {
                    name: deviceConfig.name,
                },
            });
        }
    }
}
exports.DeviceManager = DeviceManager;
