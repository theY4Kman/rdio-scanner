export enum WebSocketCommand {
    BulkCall = 'BLC',
    Call = 'CAL',
    Config = 'CFG',
    Expired = 'XPR',
    ListCall = 'LCL',
    ListenersCount = 'LSC',
    LivefeedMap = 'LFM',
    Max = 'MAX',
    Pin = 'PIN',
    Version = 'VER',
}

export enum WebSocketCallFlag {
    Download = 'd',
    Play = 'p',
}

export class WebSocketManager {
    private ws: WebSocket | undefined;
    private shouldReconnect = true;
    private reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private onMessage: (command: string, payload: unknown, flags?: string) => void,
    ) {}

    get isConnected(): boolean {
        return this.ws?.readyState === WebSocket.OPEN;
    }

    connect(): void {
        this.shouldReconnect = true;
        this.openWebSocket();
    }

    send(command: string, payload?: unknown, flags?: string): void {
        if (this.ws?.readyState !== WebSocket.OPEN) {
            return;
        }

        const message: unknown[] = [command];

        if (payload) {
            message.push(payload);
        }

        if (flags !== null && flags !== undefined) {
            message.push(flags);
        }

        this.ws.send(JSON.stringify(message));
    }

    close(): void {
        this.shouldReconnect = false;

        if (this.reconnectTimer !== undefined) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = undefined;
        }

        if (this.ws) {
            this.ws.onclose = null;
            this.ws.onerror = null;
            this.ws.onmessage = null;
            this.ws.onopen = null;
            this.ws.close();
            this.ws = undefined;
        }
    }

    private openWebSocket(): void {
        const websocketUrl = window.location.href.replace(/^http/, 'ws');

        this.ws = new WebSocket(websocketUrl);

        this.ws.onopen = () => {
            if (this.ws) {
                this.ws.onmessage = (ev: MessageEvent) => this.parseMessage(ev.data);
            }
        };

        this.ws.onclose = (ev: CloseEvent) => {
            if (ev.code !== 1000 && this.shouldReconnect) {
                this.reconnectTimer = setTimeout(() => {
                    this.reconnectTimer = undefined;
                    this.reconnect();
                }, 2000);
            }
        };

        this.ws.onerror = () => {
            // Error handling is done via onclose
        };
    }

    private reconnect(): void {
        this.close();
        this.shouldReconnect = true;
        this.openWebSocket();
    }

    private parseMessage(raw: string): void {
        let message: unknown;
        try {
            message = JSON.parse(raw);
        } catch (error) {
            console.warn(`Invalid control message received, ${error}`);
            return;
        }

        if (Array.isArray(message)) {
            const [command, payload, flags] = message;
            this.onMessage(command as string, payload, flags as string | undefined);
        }
    }
}
