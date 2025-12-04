package main

import (
	"context"
	"embed"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"inkwell/internal/config"
	"inkwell/internal/server"

	"github.com/pkg/browser"
)

//go:embed all:web
var webContent embed.FS

func main() {
	// Parse configuration
	cfg, err := config.Parse()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}

	// Create server with embedded web content
	srv, err := server.New(cfg, webContent)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error creating server: %v\n", err)
		os.Exit(1)
	}

	// Channel to listen for errors from server
	serverErrors := make(chan error, 1)

	// Start server in goroutine
	go func() {
		serverErrors <- srv.Start()
	}()

	// Open browser after a short delay (to ensure server is ready)
	if !cfg.NoBrowser {
		go func() {
			time.Sleep(200 * time.Millisecond)
			url := cfg.URL()
			fmt.Printf("\n  Inkwell is running at: %s\n\n", url)
			if err := browser.OpenURL(url); err != nil {
				log.Printf("Failed to open browser: %v", err)
			}
		}()
	} else {
		fmt.Printf("\n  Inkwell is running at: %s\n\n", cfg.URL())
	}

	// Channel to listen for interrupt signal
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, os.Interrupt, syscall.SIGTERM)

	// Block until we receive a signal or error
	select {
	case err := <-serverErrors:
		if err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server error: %v", err)
		}
	case sig := <-shutdown:
		log.Printf("Received signal %v, shutting down...", sig)

		// Give outstanding requests 5 seconds to complete
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		if err := srv.Shutdown(ctx); err != nil {
			log.Printf("Graceful shutdown failed: %v", err)
			os.Exit(1)
		}
	}

	fmt.Println("Inkwell stopped.")
}
