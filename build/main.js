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
/* eslint-disable @typescript-eslint/triple-slash-reference */
/// <reference path="./types.d.ts" />
// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const elero_usb_transmitter_client_1 = require("elero-usb-transmitter-client");
const device_manager_1 = require("./lib/device-manager");
const REFRESH_INTERVAL_IN_MINUTES_DEFAULT = 5;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
class EleroUsbTransmitter extends utils.Adapter {
    constructor(options = {}) {
        super(Object.assign(Object.assign({}, options), { name: 'elero-usb-transmitter' }));
        this.refreshIntervalInMinutes = REFRESH_INTERVAL_IN_MINUTES_DEFAULT;
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    /**
     * Is called when databases are connected and adapter received configuration.
     */
    onReady() {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            if (!this.config.usbStickDevicePath) {
                this.setState('info.connection', false, true);
                this.log.error('Path for device is not set.');
                return;
            }
            this.client = new elero_usb_transmitter_client_1.UsbTransmitterClient(this.config.usbStickDevicePath);
            this.deviceManager = new device_manager_1.DeviceManager(this, this.client);
            this.log.debug('Try to open connection to stick.');
            yield this.client.open();
            this.log.debug('Connection is open.');
            yield this.deviceManager.createDevices();
            yield this.refreshInfo();
            yield this.deviceManager.updateDeviceNames();
            this.subscribeStates('*');
            this.setState('info.connection', true, true);
            this.refreshIntervalInMinutes = (_b = (_a = this.config) === null || _a === void 0 ? void 0 : _a.refreshInterval) !== null && _b !== void 0 ? _b : REFRESH_INTERVAL_IN_MINUTES_DEFAULT;
            this.setupRefreshTimeout();
        });
    }
    refreshInfo() {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.info('Refreshing info of devices.');
            const devices = yield this.getDevicesAsync();
            for (const device of devices) {
                const name = device.common.name;
                this.log.debug(`Refreshing info of device ${name}.`);
                const channelState = yield this.getStateAsync(`${device._id}.channel`);
                const channel = channelState === null || channelState === void 0 ? void 0 : channelState.val;
                try {
                    const info = yield this.retryOperation(() => this.client.getInfo(channel), RETRY_ATTEMPTS, RETRY_DELAY_MS);
                    if (info == null) {
                        this.log.debug(`No info for channel ${channel} returned.`);
                        continue;
                    }
                    this.log.debug(`Info for channel ${channel} returned.`);
                    if (info.status != null) {
                        this.log.debug(`Status of channel ${channel}: ${info.status}`);
                        const statusText = elero_usb_transmitter_client_1.InfoData[info.status];
                        if (statusText) {
                            yield this.setStateChangedAsync(`${device._id}.info`, statusText, true);
                        }
                        else {
                            this.log.debug(`Unknown status: ${info.status}`);
                        }
                        if (info.status == elero_usb_transmitter_client_1.InfoData.INFO_BOTTOM_POSITION_STOP) {
                            yield this.setStateChangedAsync(`${device._id}.open`, false, true);
                        }
                        else if (info.status == elero_usb_transmitter_client_1.InfoData.INFO_TOP_POSITION_STOP) {
                            yield this.setStateChangedAsync(`${device._id}.open`, true, true);
                        }
                    }
                    this.setState('info.connection', true, true);
                }
                catch (error) {
                    this.setState('info.connection', false, true);
                    this.log.error(`Error while refreshing device: ${error}.`);
                }
            }
        });
    }
    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     */
    onUnload(callback) {
        var _a;
        try {
            if (this.refreshTimeout)
                clearTimeout(this.refreshTimeout);
            (_a = this.client) === null || _a === void 0 ? void 0 : _a.close();
            callback();
        }
        catch (_e) {
            callback();
        }
    }
    sendControlCommand(deviceName, value) {
        return __awaiter(this, void 0, void 0, function* () {
            const channelState = yield this.getStateAsync(`${deviceName}.channel`);
            const channel = channelState === null || channelState === void 0 ? void 0 : channelState.val;
            this.log.debug(`Try to send control command ${value} to ${deviceName} with channel ${channel}.`);
            const response = yield this.client.sendControlCommand(channel, Number.parseInt(value));
            this.log.info(`Response from sending command ${value} to device ${deviceName}: ${JSON.stringify(response)}`);
            yield this.setStateChangedAsync(`${deviceName}.controlCommand`, value, true);
        });
    }
    setOpen(deviceName, newState) {
        return __awaiter(this, void 0, void 0, function* () {
            if (newState) {
                yield this.sendControlCommand(deviceName, elero_usb_transmitter_client_1.ControlCommand.up);
            }
            else {
                yield this.sendControlCommand(deviceName, elero_usb_transmitter_client_1.ControlCommand.down);
            }
            yield this.setStateChangedAsync(`${deviceName}.open`, newState, true);
        });
    }
    /**
     * Is called if a subscribed state changes
     */
    onStateChange(id, state) {
        return __awaiter(this, void 0, void 0, function* () {
            if (state) {
                if (state.ack)
                    return;
                const elements = id.split('.');
                const deviceName = elements[elements.length - 2];
                const stateName = elements[elements.length - 1];
                if (stateName == 'controlCommand') {
                    try {
                        yield this.sendControlCommand(deviceName, state.val);
                    }
                    catch (error) {
                        this.log.error(`Can not send control command: ${error}`);
                    }
                }
                if (stateName == 'open') {
                    this.log.debug(`new value for open: ${state.val}`);
                    try {
                        yield this.setOpen(deviceName, state.val);
                    }
                    catch (e) {
                        this.handleClientError(e);
                    }
                }
                // The state was changed
                this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
            }
            else {
                // The state was deleted
                this.log.info(`state ${id} deleted`);
            }
        });
    }
    handleClientError(error) {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.debug('Try to handle error.');
            this.setState('info.connection', false, true);
            if (error instanceof Error) {
                this.log.error(`Unknown error: ${error}. Stack: ${error.stack}`);
            }
        });
    }
    setupRefreshTimeout() {
        this.log.debug('setupRefreshTimeout');
        const refreshIntervalInMilliseconds = this.refreshIntervalInMinutes * 60 * 1000;
        this.log.debug(`refreshIntervalInMilliseconds=${refreshIntervalInMilliseconds}`);
        this.refreshTimeout = setTimeout(this.refreshTimeoutFunc.bind(this), refreshIntervalInMilliseconds);
    }
    refreshTimeoutFunc() {
        return __awaiter(this, void 0, void 0, function* () {
            this.log.debug(`refreshTimeoutFunc started.`);
            try {
                this.refreshInfo();
                this.setState('info.connection', true, true);
                this.setupRefreshTimeout();
            }
            catch (error) {
                yield this.handleClientError(error);
            }
        });
    }
    retryOperation(operation, retries, delayMs) {
        return __awaiter(this, void 0, void 0, function* () {
            for (let i = 0; i < retries; i++) {
                try {
                    return yield operation();
                }
                catch (error) {
                    if (i === retries - 1)
                        throw error;
                    this.log.debug(`Operation failed, retrying in ${delayMs}ms... (Attempt ${i + 1}/${retries})`);
                    yield new Promise((resolve) => setTimeout(resolve, delayMs));
                }
            }
            throw new Error('Operation failed after retries');
        });
    }
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
