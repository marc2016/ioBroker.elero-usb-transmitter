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
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const elero_usb_transmitter_client_1 = require("elero-usb-transmitter-client");
const node_schedule_1 = require("node-schedule");
class EleroUsbTransmitter extends utils.Adapter {
    constructor(options = {}) {
        super(Object.assign(Object.assign({}, options), { name: 'elero-usb-transmitter' }));
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    onReady() {
        return __awaiter(this, void 0, void 0, function* () {
            let refreshInterval = 1;
            if (this.config.refreshInterval != '') {
                refreshInterval = Number.parseInt(this.config.refreshInterval);
            }
            this.refreshJob = node_schedule_1.scheduleJob(`*/${refreshInterval} * * * *`, () => {
                this.refreshInfo.bind(this);
            });
            this.client = new elero_usb_transmitter_client_1.UsbTransmitterClient(this.config.usbStickDevicePath);
            yield this.client.open();
            yield this.createDevices();
            yield this.refreshInfo();
            yield this.updateDeviceNames();
            this.subscribeStates('*');
        });
    }
    calcTransitTime(channel) {
        return __awaiter(this, void 0, void 0, function* () {
            const info = yield this.client.getInfo(channel);
            if (info.status != elero_usb_transmitter_client_1.InfoData.INFO_BOTTOM_POSITION_STOP) {
                return 0;
            }
            const start = process.hrtime();
            this.client.sendControlCommand(channel, elero_usb_transmitter_client_1.ControlCommand.up);
            let currentInfo = yield this.client.getInfo(channel);
            while (currentInfo.status != elero_usb_transmitter_client_1.InfoData.INFO_TOP_POSITION_STOP) {
                yield sleep(1000);
                this.log.debug('Check info');
                try {
                    currentInfo = yield this.client.getInfo(channel);
                }
                catch (error) {
                    this.log.info(error);
                }
            }
            const end = process.hrtime(start);
            const transitTimeSeconds = end[0];
            return transitTimeSeconds;
        });
    }
    updateDeviceNames() {
        return __awaiter(this, void 0, void 0, function* () {
            this.config.deviceConfigs.forEach((deviceConfig) => __awaiter(this, void 0, void 0, function* () {
                yield this.extendObjectAsync(`channel_${deviceConfig.channel}`, {
                    common: {
                        name: deviceConfig.name,
                    },
                });
            }));
        });
    }
    refreshInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            const devices = yield this.getDevicesAsync();
            devices.forEach((device) => __awaiter(this, void 0, void 0, function* () {
                const name = device.common.name;
                const channelState = yield this.getStateAsync(`${name}.channel`);
                const channel = channelState === null || channelState === void 0 ? void 0 : channelState.val;
                const info = yield this.client.getInfo(channel);
                if ((info === null || info === void 0 ? void 0 : info.status) != null) {
                    this.setStateChangedAsync(`${name}.info`, elero_usb_transmitter_client_1.InfoData[info.status], true);
                }
            }));
        });
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        var _a, _b;
        try {
            (_a = this.refreshJob) === null || _a === void 0 ? void 0 : _a.cancel();
            (_b = this.client) === null || _b === void 0 ? void 0 : _b.close();
            callback();
        }
        catch (e) {
            callback();
        }
    }
    sendControlCommand(deviceName, value) {
        return __awaiter(this, void 0, void 0, function* () {
            const channelState = yield this.getStateAsync(`${deviceName}.channel`);
            const channel = channelState === null || channelState === void 0 ? void 0 : channelState.val;
            yield this.client.sendControlCommand(channel, Number.parseInt(value));
            this.setStateChangedAsync(`${deviceName}.controlCommand`, value, true);
        });
    }
    /**
     * Is called if a subscribed state changes
     */
    onStateChange(id, state) {
        if (state) {
            const elements = id.split('.');
            const deviceName = elements[elements.length - 2];
            const stateName = elements[elements.length - 1];
            if (stateName == 'controlCommand') {
                this.sendControlCommand(deviceName, state.val);
            }
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        }
        else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }
    createDevices() {
        return __awaiter(this, void 0, void 0, function* () {
            const activeChannels = yield this.client.checkChannels();
            activeChannels.forEach((element) => {
                this.log.info(`Active channel: ${element}`);
                this.createEleroDevice(element);
            });
        });
    }
    createEleroDevice(channel) {
        this.createDevice(`channel_${channel.toString()}`);
        this.createState(`channel_${channel.toString()}`, '', 'channel', { role: 'text', write: false, def: channel, defAck: true }, undefined);
        this.createState(`channel_${channel.toString()}`, '', 'controlCommand', {
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
        }, undefined);
        this.createState(`channel_${channel.toString()}`, '', 'info', { role: 'text', write: false, def: '' }, undefined);
    }
    onMessage(obj) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!obj) {
                return;
            }
            if (obj.command == 'calcTransitTime') {
                // const channel = obj.message
                // const transitTime = await this.calcTransitTime(channel)
                // return transitTime
                this.sendTo(obj.from, obj.command, { transitTime: 42 }, obj.callback);
            }
            return;
        });
    }
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
if (module.parent) {
    // Export the constructor in compact mode
    module.exports = (options) => new EleroUsbTransmitter(options);
}
else {
    // otherwise start the instance directly
    ;
    (() => new EleroUsbTransmitter())();
}
