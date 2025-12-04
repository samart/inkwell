// WebSocket client for real-time sync

class WebSocketClient {
    constructor() {
        this.ws = null;
        this.listeners = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.connected = false;
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}/ws`;

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.connected = true;
            this.reconnectAttempts = 0;
            this.emit('connected');
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.connected = false;
            this.emit('disconnected');
            this.scheduleReconnect();
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.emit('error', error);
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (e) {
                console.error('Failed to parse WebSocket message:', e);
            }
        };
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            if (!this.connected) {
                this.connect();
            }
        }, delay);
    }

    handleMessage(message) {
        switch (message.type) {
            case 'fileEvent':
                this.emit('fileEvent', {
                    path: message.path,
                    eventType: message.data?.eventType,
                });
                break;

            case 'saved':
                this.emit('saved', { path: message.path });
                break;

            case 'error':
                this.emit('error', { message: message.content });
                break;

            default:
                console.log('Unknown message type:', message.type);
        }
    }

    send(type, data = {}) {
        if (!this.connected || this.ws.readyState !== WebSocket.OPEN) {
            console.warn('WebSocket not connected');
            return;
        }

        this.ws.send(JSON.stringify({ type, ...data }));
    }

    subscribe(path) {
        this.send('subscribe', { path });
    }

    unsubscribe(path) {
        this.send('unsubscribe', { path });
    }

    save(path, content) {
        this.send('save', { path, content });
    }

    // Event emitter
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    off(event, callback) {
        if (!this.listeners.has(event)) return;
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    emit(event, data) {
        if (!this.listeners.has(event)) return;
        for (const callback of this.listeners.get(event)) {
            callback(data);
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

export const ws = new WebSocketClient();
