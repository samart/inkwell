package server

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"inkwell/internal/filesystem"

	"github.com/gorilla/websocket"
)

const (
	// Time allowed to write a message to the peer
	writeWait = 10 * time.Second

	// Time allowed to read the next pong message from the peer
	pongWait = 60 * time.Second

	// Send pings to peer with this period (must be less than pongWait)
	pingPeriod = (pongWait * 9) / 10

	// Maximum message size allowed from peer
	maxMessageSize = 512 * 1024 // 512KB
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for local development
	},
}

// WSMessage represents a WebSocket message
type WSMessage struct {
	Type    string          `json:"type"`
	Path    string          `json:"path,omitempty"`
	Content string          `json:"content,omitempty"`
	Data    json.RawMessage `json:"data,omitempty"`
}

// Client represents a WebSocket client
type Client struct {
	hub        *Hub
	conn       *websocket.Conn
	send       chan []byte
	subscribed map[string]bool // Paths this client is subscribed to
	mu         sync.RWMutex
}

// Hub maintains the set of active clients and broadcasts messages
type Hub struct {
	server     *Server
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	done       chan struct{}
	mu         sync.RWMutex
}

// NewHub creates a new Hub
func NewHub(server *Server) *Hub {
	return &Hub{
		server:     server,
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		done:       make(chan struct{}),
	}
}

// Run starts the hub's main loop
func (h *Hub) Run() {
	for {
		select {
		case <-h.done:
			return
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

// Close shuts down the hub
func (h *Hub) Close() {
	close(h.done)
}

// BroadcastFileEvent sends a file event to all clients
func (h *Hub) BroadcastFileEvent(event filesystem.FileEvent) {
	msg := WSMessage{
		Type: "fileEvent",
		Path: event.Path,
	}
	data, _ := json.Marshal(map[string]interface{}{
		"eventType": event.Type,
	})
	msg.Data = data

	msgBytes, err := json.Marshal(msg)
	if err != nil {
		return
	}

	h.broadcast <- msgBytes
}

// HandleWebSocket handles WebSocket connections
func (h *Hub) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}

	client := &Client{
		hub:        h,
		conn:       conn,
		send:       make(chan []byte, 256),
		subscribed: make(map[string]bool),
	}

	h.register <- client

	// Start goroutines for reading and writing
	go client.writePump()
	go client.readPump()
}

// readPump pumps messages from the WebSocket connection to the hub
func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		c.handleMessage(message)
	}
}

// writePump pumps messages from the hub to the WebSocket connection
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			// Add queued messages to the current WebSocket frame
			n := len(c.send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.send)
			}

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// handleMessage processes incoming WebSocket messages
func (c *Client) handleMessage(data []byte) {
	var msg WSMessage
	if err := json.Unmarshal(data, &msg); err != nil {
		log.Println("Invalid WebSocket message:", err)
		return
	}

	switch msg.Type {
	case "subscribe":
		c.mu.Lock()
		c.subscribed[msg.Path] = true
		c.mu.Unlock()

	case "unsubscribe":
		c.mu.Lock()
		delete(c.subscribed, msg.Path)
		c.mu.Unlock()

	case "save":
		// Save file and notify
		if err := c.hub.server.fs.WriteFile(msg.Path, msg.Content); err != nil {
			c.sendError("Failed to save file: " + err.Error())
			return
		}
		c.sendMessage(WSMessage{
			Type: "saved",
			Path: msg.Path,
		})
	}
}

// sendMessage sends a message to the client
func (c *Client) sendMessage(msg WSMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}

	select {
	case c.send <- data:
	default:
		// Channel full, client is slow
	}
}

// sendError sends an error message to the client
func (c *Client) sendError(message string) {
	c.sendMessage(WSMessage{
		Type:    "error",
		Content: message,
	})
}
