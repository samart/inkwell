// WebSocket client for real-time sync

type EventCallback = (data: unknown) => void;

interface FileEvent {
  path: string;
  eventType: string;
}

class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: Map<string, EventCallback[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private connected = false;

  connect(): void {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.connected = true;
      this.reconnectAttempts = 0;
      this.emit('connected', null);
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.connected = false;
      this.emit('disconnected', null);
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

  private scheduleReconnect(): void {
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

  private handleMessage(message: { type: string; path?: string; content?: string; data?: { eventType?: string } }): void {
    switch (message.type) {
      case 'fileEvent':
        this.emit('fileEvent', {
          path: message.path,
          eventType: message.data?.eventType,
        } as FileEvent);
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

  private send(type: string, data: Record<string, unknown> = {}): void {
    if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return;
    }

    this.ws.send(JSON.stringify({ type, ...data }));
  }

  subscribe(path: string): void {
    this.send('subscribe', { path });
  }

  unsubscribe(path: string): void {
    this.send('unsubscribe', { path });
  }

  save(path: string, content: string): void {
    this.send('save', { path, content });
  }

  on(event: string, callback: EventCallback): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: EventCallback): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  private emit(event: string, data: unknown): void {
    const callbacks = this.listeners.get(event);
    if (!callbacks) return;
    for (const callback of callbacks) {
      callback(data);
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const ws = new WebSocketClient();
export type { FileEvent };
