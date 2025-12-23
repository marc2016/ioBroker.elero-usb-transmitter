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
            activeChannels.forEach((element) => {
                this.adapter.log.info(`Active channel: ${element}`);
                this.createEleroDevice(element);
            });
        });
    }
    createEleroDevice(channel) {
        this.adapter.log.debug(`Create device with channel ${channel}.`);
        // create device with channel number as ID.
        this.adapter.createDevice(`channel_${channel.toString()}`);
        this.adapter.log.debug(`Create state channel.`);
        this.adapter.createState(`channel_${channel.toString()}`, '', 'channel', { role: 'text', write: false, def: channel, defAck: true, type: 'number' }, undefined);
        this.adapter.log.debug(`Create state controlCommand.`);
        this.adapter.createState(`channel_${channel.toString()}`, '', 'controlCommand', {
            role: 'state',
            states: {
                16: elero_usb_transmitter_client_1.ControlCommand[16],
                32: elero_usb_transmitter_client_1.ControlCommand[32],
                36: elero_usb_transmitter_client_1.ControlCommand[36],
                64: elero_usb_transmitter_client_1.ControlCommand[64],
                68: elero_usb_transmitter_client_1.ControlCommand[68],
            },
            write: true,
            def: 16,
            defAck: true,
            type: 'number',
        }, undefined);
        this.adapter.log.debug(`Create state info.`);
        this.adapter.createState(`channel_${channel.toString()}`, '', 'info', { role: 'text', write: false, def: '', type: 'string' }, undefined);
        this.adapter.log.debug(`Create state open.`);
        this.adapter.createState(`channel_${channel.toString()}`, '', 'open', { role: 'switch', read: true, write: true, def: false, type: 'boolean' }, undefined);
        this.adapter.log.debug(`Device with channel ${channel} created.`);
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
