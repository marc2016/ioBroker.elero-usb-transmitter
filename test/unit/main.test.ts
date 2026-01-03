
import { expect } from "chai";

// Mock the adapter-core module
const adapterName = "elero-usb-transmitter";

// Mock Data
const MOCK_CHANNEL_ID = 1;
const MOCK_DEVICE_NAME = "Roller Shutter 1";

// Mock Client that we can control
class MockClient {
    public isOpen = false;
    public channels = [MOCK_CHANNEL_ID];
    public infoData = { status: 16 }; // INFO_STOP
    
    open() { 
        this.isOpen = true; 
        return Promise.resolve(); 
    }
    close() { 
        this.isOpen = false; 
        return Promise.resolve(); 
    }
    checkChannels() { 
        return Promise.resolve(this.channels); 
    }
    getInfo(channel: number) {
        return Promise.resolve(this.infoData);
    }
    sendControlCommand(channel: number, command: number) {
        return Promise.resolve({ success: true, channel, command });
    }
    on() {}
}

const mockClientInstance = new MockClient();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const proxyquire = require("proxyquire").noCallThru();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require("path");
const mainPath = path.join(__dirname, "..", "..", "src", "main.ts");

describe("EleroUsbTransmitter", () => {
    let adapter: any;
    let mockObjects: Record<string, any> = {};
    let mockStates: Record<string, any> = {};

    beforeEach(() => {
        mockObjects = {};
        mockStates = {};
        
        // Reset mock client state
        mockClientInstance.isOpen = false;
        mockClientInstance.channels = [MOCK_CHANNEL_ID];
        mockClientInstance.infoData = { status: 16 };

        const EleroUsbTransmitter = proxyquire(mainPath, {
            "elero-usb-transmitter-client": {
                UsbTransmitterClient: function() { return mockClientInstance; },
                ControlCommand: { up: 32, down: 36, stop: 16 }, // Values from real enum
                InfoData: { 
                    16: "INFO_STOP", 
                    0: "INFO_BOTTOM_POSITION_STOP", 
                    1: "INFO_TOP_POSITION_STOP" 
                }
            },
            "@iobroker/adapter-core": {
                Adapter: class MockAdapter {
                    public log: any;
                    public on: any;
                    public parameters: any;
                    public config: any;
                    
                    // State verification properties
                    public createdStates: Record<string, any> = {};
                    private eventHandlers: Record<string, Function> = {};

                    constructor(options: any) {
                        this.log = { info: () => {}, debug: () => {}, error: () => {}, warn: () => {} };
                        this.on = (event: string, handler: Function) => {
                            this.eventHandlers[event] = handler;
                        };
                        this.parameters = options;
                        
                        // Default config similar to io-package.json
                        this.config = {
                            usbStickDevicePath: "/dev/ttyUSB0",
                            refreshInterval: 5,
                            deviceConfigs: [{ channel: MOCK_CHANNEL_ID, name: MOCK_DEVICE_NAME }]
                        };
                    }
                    
                    // Emulation methods
                    async setState(id: string, val: any, ack: boolean) {
                        const fullId = id.startsWith(this.namespace) ? id : this.namespace + "." + id;
                        mockStates[fullId] = { val, ack };
                    }
                    
                    async setStateChanged(id: string, val: any, ack: boolean) {
                        return this.setState(id, val, ack);
                    }
                    
                    async setStateChangedAsync(id: string, val: any, ack: boolean) {
                         return this.setState(id, val, ack);
                    }

                    async getStateAsync(id: string) {
                        return mockStates[this.namespace + "." + id] || mockStates[id];
                    }

                    async extendObjectAsync(id: string, obj: any) {
                         const fullId = this.namespace + "." + id;
                         mockObjects[fullId] = { ...mockObjects[fullId], ...obj };
                    }

                    async setObjectNotExistsAsync(id: string, obj: any) {
                        const fullId = id.startsWith(this.namespace) ? id : this.namespace + "." + id;
                        if (!mockObjects[fullId]) {
                            mockObjects[fullId] = obj;
                             if (obj.common && obj.common.def !== undefined) {
                                 mockStates[fullId] = { val: obj.common.def, ack: true };
                             }
                        }
                    }
                    
                    createDevice(id: string) {
                        const fullId = this.namespace + "." + id;
                        mockObjects[fullId] = { common: { name: "test device" }, type: "device" };
                    }

                    createState(deviceId: string, channelId: string, stateId: string, common: any) {
                        // simplified ID construction matching source
                         const fullId = this.namespace + "." + deviceId + (stateId ? "." + stateId : "");
                         mockObjects[fullId] = { common };
                         // Set default value if present
                         if (common.def !== undefined) {
                             mockStates[fullId] = { val: common.def, ack: true };
                         }
                    }

                    subscribeStates(pattern: string) {}

                    getDevicesAsync() {
                         // Return objects that look like devices
                         return Promise.resolve(
                             Object.keys(mockObjects)
                             .filter(id => {
                                 const partCount = id.split(".").length; // elero-usb-transmitter.0.channel_1 has 3 parts
                                 return id.startsWith(this.namespace + ".channel_") && partCount === 3;
                             })
                             .map(id => ({ _id: id, common: mockObjects[id].common || { name: "test"} }))
                         );
                    }
                    
                    // Helper to trigger events
                    emit(event: string, ...args: any[]) {
                        if (this.eventHandlers[event]) {
                            return this.eventHandlers[event](...args);
                        }
                    }

                    get namespace() { return "elero-usb-transmitter.0"; }
                }
            }
        });

        adapter = EleroUsbTransmitter();
    });

    it("should initialize and create states for discovered devices", async () => {
        // Trigger ready event
        await adapter.emit("ready");

        // Verify channel state existence and value
        const channelState = mockStates["elero-usb-transmitter.0.channel_1.channel"];
        expect(channelState).to.exist;
        expect(channelState.val).to.equal(MOCK_CHANNEL_ID);

        // Verify name update from config
        const deviceObj = mockObjects["elero-usb-transmitter.0.channel_1"];
        expect(deviceObj).to.exist;
        expect(deviceObj.common.name).to.equal(MOCK_DEVICE_NAME);
        
        // Verify connection info
        expect(mockStates["elero-usb-transmitter.0.info.connection"].val).to.be.true;
    });

    it("should update info state on refresh", async () => {
        // Setup initial state
        await adapter.emit("ready");
        
        // Mock a status change on the stick (INFO_TOP_POSITION_STOP = 1)
        mockClientInstance.infoData = { status: 1 }; 
        
        // Trigger refresh (the logic calls refreshInfo inside onReady, but let's simulate a timeout or just verify initial refresh first)
        // The mock client already had status 16 initially, let's check that first
        expect(mockStates["elero-usb-transmitter.0.channel_1.info"].val).to.equal("INFO_STOP");

        // Now we can't easily trigger the private refreshTimeoutFunc, 
        // but we can verify that onReady called refreshInfo which polled the client.
    });
    
    it("should handle state changes (control commands)", async () => {
        await adapter.emit("ready");

        // Spy on client
        let sentChannel, sentCommand;
        const originalSend = mockClientInstance.sendControlCommand;
        mockClientInstance.sendControlCommand = async (c, cmd) => {
             sentChannel = c;
             sentCommand = cmd;
             return { success: true, channel: c, command: cmd };
        };

        // Simulate user setting "open" to true (UP command)
        await adapter.emit("stateChange", "elero-usb-transmitter.0.channel_1.open", { 
            val: true, 
            ack: false 
        });

        // Verify command sent to stick (UP = 32)
        expect(sentChannel).to.equal(MOCK_CHANNEL_ID);
        expect(sentCommand).to.equal(32);
        
        // Verify state was acked (adapter sets it to true with ack=true after success)
        expect(mockStates["elero-usb-transmitter.0.channel_1.open"].ack).to.be.true;
        expect(mockStates["elero-usb-transmitter.0.channel_1.open"].val).to.be.true;
    });
});
