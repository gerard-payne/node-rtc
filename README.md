# NodeRTC

STUN/TURN/ICE server implementation in Node.js with full test coverage and JSDocs.

## Features

### STUN Server (RFC 5389)
- **Binding requests/responses** - Discover public IP address and port
- **XOR-mapped addresses** - Security feature to prevent NAT traversal attacks by XORing address bytes with magic cookie
- **Error handling** - Proper error codes and reasons per RFC 5389
- **Message integrity** - HMAC-SHA1 authentication support
- **Fingerprint verification** - CRC32-based message validation

### TURN Server (RFC 5766)
- **Relay allocations** - Allocate relay ports for media traffic with configurable lifetime
- **Lifetime management** - Automatic expiration and refresh mechanism (min: 60s, max: 3600s, default: 600s)
- **Permissions** - Control which peer addresses can send data through relay
- **Channel bindings** - Optimize data transfer using channel numbers (0x4000-0x7FFF) instead of STUN headers
- **Data relay** - Bidirectional UDP packet forwarding between client and peers
- **Authentication** - Optional username/password with nonce/realm support

### ICE Server (RFC 5245)
- **Host candidates** - Gather local network interface addresses
- **Server reflexive (srflx)** - Discover public address via STUN servers
- **Relay candidates** - Obtain relay addresses via TURN servers
- **Priority calculation** - RFC-compliant priority computation based on candidate type and local preference
- **SDP format support** - Parse and generate standard SDP candidate strings
- **Candidate pair selection** - Automatically select best local/remote candidate pair

### Development Features
- **Full test coverage** - 97+ tests using Node.js built-in test runner
- **Complete JSDoc documentation** - All classes, methods, and parameters documented
- **ES Modules (ESM) support** - Native ES module imports/exports
- **Event-driven architecture** - EventEmitter-based for extensibility
- **Statistics tracking** - Request/response counters and error monitoring

## Installation

```bash
npm install
```

## Usage

### STUN Server

```javascript
import { StunServer } from './src/index.js';

const stunServer = new StunServer({
  port: 3478,
  address: '0.0.0.0',
});

await stunServer.start();
console.log('STUN server running on port', stunServer.socket.address().port);
```

### TURN Server

```javascript
import { TurnServer } from './src/index.js';

const turnServer = new TurnServer({
  port: 3478,
  address: '0.0.0.0',
  relayAddress: '0.0.0.0',
  realm: 'myRealm',
  authenticate: async (username, nonce, messageIntegrity) => {
    // Implement authentication logic
    return true;
  },
});

await turnServer.start();
console.log('TURN server running on port', turnServer.socket.address().port);
```

### ICE Server

```javascript
import { IceServer } from './src/index.js';

const iceServer = new IceServer({
  stunServers: ['stun:stun.l.google.com:19302'],
  gatherHostCandidates: true,
  gatherSrflxCandidates: true,
});

const candidates = await iceServer.gatherCandidates();
console.log('Gathered candidates:', candidates);
```

## API Reference

See the generated JSDoc documentation in the `docs/` folder.

## Testing

Run all tests:

```bash
npm test
```

Run with coverage:

```bash
npm run test:coverage
```

## Documentation

Generate JSDoc documentation:

```bash
npm run docs
```

## Project Structure

```
.
├── src/
│   ├── index.js          # Main exports
│   ├── constants.js      # Protocol constants
│   ├── stun-message.js   # STUN message parsing/serialization
│   ├── stun-server.js   # STUN server implementation
│   ├── turn-server.js   # TURN server implementation
│   └── ice-server.js    # ICE server implementation
├── tests/
│   ├── constants.test.js
│   ├── stun-message.test.js
│   ├── stun-server.test.js
│   ├── turn-server.test.js
│   └── ice-server.test.js
└── README.md
```

## Standards Compliance

- STUN: RFC 5389
- TURN: RFC 5766
- ICE: RFC 5245

## License

MIT
