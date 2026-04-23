# NodeRTC Demos

This folder contains interactive demonstrations of the STUN, TURN, and ICE server implementations.

## Running Demos

### Individual Demos

```bash
# STUN Server Demo
node demo/stun-demo.js

# TURN Server Demo
node demo/turn-demo.js

# ICE Server Demo
node demo/ice-demo.js
```

### All Demos

```bash
node demo/run-all.js
```

## Demo Contents

### STUN Demo (`stun-demo.js`)
- Starts a STUN server
- Simulates client binding requests
- Shows event handling (request, response, error)
- Demonstrates XOR-mapped address responses
- Displays server statistics

### TURN Demo (`turn-demo.js`)
- Starts a TURN server
- Creates allocations with lifetimes
- Sets up permissions for peer addresses
- Demonstrates channel binding for optimized relay
- Shows allocation event handling

### ICE Demo (`ice-demo.js`)
- Creates ICE candidates (host, srflx, relay)
- Converts candidates to/from SDP format
- Calculates priorities per RFC 5245
- Gathers host candidates from local interfaces
- Demonstrates candidate pair selection

## Output Format

Each demo outputs:
- `📡` Server startup messages
- `📤` Request messages
- `📥` Response messages
- `✅` Success confirmations
- `⚠️`  Warnings/errors
- `🆕` Event notifications

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  STUN Demo  │────→│  STUN Server│←────│  UDP Client │
└─────────────┘     └─────────────┘     └─────────────┘

┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  TURN Demo  │────→│  TURN Server│←────│  UDP Client │
└─────────────┘     └─────────────┘     └─────────────┘

┌─────────────┐     ┌─────────────┐
│  ICE Demo   │────→│  ICE Server │
└─────────────┘     └─────────────┘
```
