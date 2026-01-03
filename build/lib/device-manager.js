"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeviceManager = void 0;
const elero_usb_transmitter_client_1 = require("elero-usb-transmitter-client");
class DeviceManager {
    constructor(adapter, client) {
        this.adapter = adapter;
        this.client = client;
    }
    createDevices() {
        return __awaiter(this, void 0, void 0, function* () {
            let activeChannels;
            try {
                this.adapter.log.debug('Check aktive channels.');
                activeChannels = yield this.client.checkChannels();
                this.adapter.log.debug(`Got ${activeChannels.length} active channels.`);
            }
            catch (error) {
                this.adapter.log.error(`Can not check active channels: ${error}`);
                yield this.client.close();
                yield this.client.open();
                activeChannels = yield this.client.checkChannels();
            }
            this.adapter.log.debug('Iterate over active channels and create devices.');
            for (const channel of activeChannels) {
                this.adapter.log.info(`Active channel: ${channel}`);
                yield this.createEleroDevice(channel);
            }
        });
    }
    createEleroDevice(channel) {
        return __awaiter(this, void 0, void 0, function* () {
            this.adapter.log.debug(`Create device with channel ${channel}.`);
            // create device with channel number as ID.
            yield this.adapter.setObjectNotExistsAsync(`channel_${channel}`, {
                type: 'device',
                common: {
                    name: `channel_${channel}`,
                },
                native: {},
            });
            this.adapter.log.debug(`Create state channel.`);
            yield this.adapter.setObjectNotExistsAsync(`channel_${channel}.channel`, {
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
            yield this.adapter.setObjectNotExistsAsync(`channel_${channel}.controlCommand`, {
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
            yield this.adapter.setObjectNotExistsAsync(`channel_${channel}.info`, {
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
            yield this.adapter.setObjectNotExistsAsync(`channel_${channel}.open`, {
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
        });
    }
    updateDeviceNames() {
        return __awaiter(this, void 0, void 0, function* () {
            for (const deviceConfig of this.adapter.config.deviceConfigs) {
                yield this.adapter.extendObjectAsync(`channel_${deviceConfig.channel}`, {
                    common: {
                        name: deviceConfig.name,
                    },
                });
            }
        });
    }
}
exports.DeviceManager = DeviceManager;
