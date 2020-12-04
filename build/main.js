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
                const boundedRefreshInfo = this.refreshInfo.bind(this);
                boundedRefreshInfo();
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
            let info;
            try {
                info = yield this.client.getInfo(channel);
            }
            catch (error) {
                this.log.error(error);
                return 0;
            }
            let endPosition;
            let command;
            if (info.status == elero_usb_transmitter_client_1.InfoData.INFO_BOTTOM_POSITION_STOP) {
                endPosition = elero_usb_transmitter_client_1.InfoData.INFO_TOP_POSITION_STOP;
                command = elero_usb_transmitter_client_1.ControlCommand.up;
            }
            else if (info.status == elero_usb_transmitter_client_1.InfoData.INFO_TOP_POSITION_STOP) {
                endPosition = elero_usb_transmitter_client_1.InfoData.INFO_BOTTOM_POSITION_STOP;
                command = elero_usb_transmitter_client_1.ControlCommand.down;
            }
            else {
                return 0;
            }
            yield this.client.sendControlCommand(channel, command);
            const start = process.hrtime();
            let currentInfo = yield this.client.getInfo(channel);
            while (currentInfo.status != endPosition) {
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
            this.log.info('Refreshing info of devices.');
            const devices = yield this.getDevicesAsync();
            devices.forEach((device) => __awaiter(this, void 0, void 0, function* () {
                const name = device.common.name;
                this.log.debug(`Refreshing info of device ${name}.`);
                const channelState = yield this.getStateAsync(`${name}.channel`);
                const channel = channelState === null || channelState === void 0 ? void 0 : channelState.val;
                try {
                    const info = yield this.client.getInfo(channel);
                    if (info == null) {
                        return;
                    }
                    if (info.status != null) {
                        this.setStateChanged(`${device._id}.info`, elero_usb_transmitter_client_1.InfoData[info.status], true);
                        if (info.status == elero_usb_transmitter_client_1.InfoData.INFO_BOTTOM_POSITION_STOP) {
                            this.setStateChangedAsync(`${device._id}.level`, 100, true);
                        }
                        else if (info.status == elero_usb_transmitter_client_1.InfoData.INFO_TOP_POSITION_STOP) {
                            this.setStateChangedAsync(`${device._id}.level`, 0, true);
                        }
                    }
                }
                catch (error) {
                    this.log.error(`Error while refreshing device: ${error}.`);
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
            const response = yield this.client.sendControlCommand(channel, Number.parseInt(value));
            this.log.info(`Response from sending command ${value} to device ${deviceName}: ${JSON.stringify(response)}`);
            this.setStateChangedAsync(`${deviceName}.controlCommand`, value, true);
        });
    }
    setLevel(deviceName, newLevel) {
        return __awaiter(this, void 0, void 0, function* () {
            const channelState = yield this.getStateAsync(`${deviceName}.channel`);
            if (channelState == null) {
                return;
            }
            const channel = channelState.val;
            const infoState = yield this.getStateAsync(`${deviceName}.info`);
            if (infoState == null) {
                return;
            }
            const info = infoState.val;
            let command;
            let levelToSet = newLevel;
            if (elero_usb_transmitter_client_1.InfoData[info] == elero_usb_transmitter_client_1.InfoData.INFO_BOTTOM_POSITION_STOP) {
                command = elero_usb_transmitter_client_1.ControlCommand.up;
                levelToSet = 100 - newLevel;
            }
            else if (elero_usb_transmitter_client_1.InfoData[info] == elero_usb_transmitter_client_1.InfoData.INFO_TOP_POSITION_STOP) {
                command = elero_usb_transmitter_client_1.ControlCommand.down;
            }
            else {
                yield this.client.sendControlCommand(channel, elero_usb_transmitter_client_1.ControlCommand.down);
                let currentInfo = yield this.client.getInfo(channel);
                while (currentInfo.status != elero_usb_transmitter_client_1.InfoData.INFO_BOTTOM_POSITION_STOP) {
                    yield sleep(1000);
                    this.log.debug('Check info');
                    try {
                        currentInfo = yield this.client.getInfo(channel);
                    }
                    catch (error) {
                        this.log.info(error);
                    }
                }
                command = elero_usb_transmitter_client_1.ControlCommand.up;
                levelToSet = 100 - newLevel;
            }
            const deviceConfig = this.config.deviceConfigs[channel - 1];
            const transitTime = deviceConfig.transitTime;
            const transitTimePerPercent = transitTime / 100;
            const timeToRun = transitTimePerPercent * levelToSet;
            if (timeToRun > 0) {
                try {
                    yield this.client.sendControlCommand(channel, command);
                }
                catch (error) {
                    this.log.error(`Error while starting setLevel: ${error}`);
                }
                const start = process.hrtime();
                let end = process.hrtime(start);
                while (end[0] <= timeToRun) {
                    end = process.hrtime(start);
                }
                yield this.sendCommandSafe(channel, elero_usb_transmitter_client_1.ControlCommand.stop);
            }
            // this.setStateChangedAsync(`${deviceName}.level`, newLevel, true)
        });
    }
    sendCommandSafe(channel, command) {
        return __awaiter(this, void 0, void 0, function* () {
            let response = null;
            while (response == null) {
                try {
                    response = yield this.client.sendControlCommand(channel, command);
                }
                catch (error) {
                    this.log.error(error);
                }
            }
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
                try {
                    this.sendControlCommand(deviceName, state.val);
                }
                catch (error) {
                    this.log.error(`Can not send control command: ${error}`);
                }
            }
            if (stateName == 'level') {
                this.log.debug(`new level ${state.val}`);
                try {
                    this.setLevel(deviceName, state.val);
                }
                catch (error) {
                    this.log.error(error);
                }
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
            let activeChannels;
            try {
                activeChannels = yield this.client.checkChannels();
            }
            catch (error) {
                this.log.error(`Can not check active channels: ${error}`);
                yield this.client.close();
                yield this.client.open();
                activeChannels = yield this.client.checkChannels();
            }
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
        this.createState(`channel_${channel.toString()}`, '', 'level', { role: 'level.blind', write: true, def: 0, min: 0, max: 100, unit: '%' }, undefined);
    }
    onMessage(obj) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!obj) {
                return;
            }
            if (obj.command == 'calcTransitTime') {
                const channel = Number.parseInt(obj.message.toString());
                const transitTime = yield this.calcTransitTime(channel);
                this.sendTo(obj.from, obj.command, { transitTime: transitTime }, obj.callback);
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
