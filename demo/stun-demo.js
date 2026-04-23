/**
 * STUN Server Demo
 * Demonstrates binding requests/responses with XOR-mapped addresses
 */

import { StunServer } from '../src/index.js';
import dgram from 'dgram';
import { StunMessage } from '../src/stun-message.js';
import { STUN_MESSAGE_TYPE } from '../src/constants.js';

console.log('='.repeat(60));
console.log('STUN Server Demo');
console.log('='.repeat(60));
console.log();

// Create and start STUN server
const server = new StunServer({
  port: 0, // Auto-assign port
  address: '127.0.0.1',
  software: 'nodeRTC-Demo/1.0',
});

console.log('📡 Starting STUN server...');

server.on('listening', () => {
  const port = server.socket.address().port;
  console.log(`✅ STUN server listening on 127.0.0.1:${port}`);
  console.log();
  console.log('STUN Server Events:');
  console.log('  - request: When binding request received');
  console.log('  - response: When binding response sent');
  console.log('  - error: When message parsing fails');
  console.log();
});

server.on('request', (msg, rinfo) => {
  console.log(`📨 [REQUEST] Binding request from ${rinfo.address}:${rinfo.port}`);
  console.log(`   Transaction ID: ${msg.transactionId.toString('hex').slice(0, 12)}...`);
});

server.on('response', (msg, rinfo) => {
  console.log(`📤 [RESPONSE] Binding response sent to ${rinfo.address}:${rinfo.port}`);
  console.log(`   Type: ${msg.type === STUN_MESSAGE_TYPE.BINDING_RESPONSE ? 'BINDING_RESPONSE' : msg.type}`);
  console.log();
});

await server.start();

// Simulate a client sending binding requests
const serverPort = server.socket.address().port;

console.log('🧪 Simulating STUN client...');
console.log();

// Client 1 - Normal binding request
console.log('Test 1: Normal binding request');
console.log('-'.repeat(40));
const client1 = dgram.createSocket('udp4');
const request1 = new StunMessage({
  type: STUN_MESSAGE_TYPE.BINDING_REQUEST,
});

await new Promise((resolve) => {
  client1.on('message', (msg) => {
    const response = StunMessage.parse(msg);
    console.log(`📥 Client received response (type: ${response.type.toString(16)})`);
    console.log(`   Transaction ID matches: ${response.transactionId.toString('hex') === request1.transactionId.toString('hex')}`);
    client1.close();
    resolve();
  });

  client1.bind(() => {
    const clientPort = client1.address().port;
    console.log(`📤 Client sending binding request from port ${clientPort}`);
    client1.send(request1.serialize(), serverPort, '127.0.0.1');
  });
});

console.log();

// Client 2 - Multiple requests to show statistics
console.log('Test 2: Multiple requests (showing statistics)');
console.log('-'.repeat(40));

const client2 = dgram.createSocket('udp4');
const request2 = new StunMessage({
  type: STUN_MESSAGE_TYPE.BINDING_REQUEST,
});

await new Promise((resolve) => {
  let received = 0;
  client2.on('message', () => {
    received++;
    if (received >= 3) {
      console.log(`✅ Received all ${received} responses`);
      client2.close();
      resolve();
    }
  });

  client2.bind(() => {
    console.log('📤 Sending 3 binding requests...');
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        client2.send(request2.serialize(), serverPort, '127.0.0.1');
      }, i * 100);
    }
  });
});

console.log();
console.log('Server Statistics:');
const stats = server.getStats();
console.log(`  Requests received: ${stats.requestsReceived}`);
console.log(`  Responses sent: ${stats.responsesSent}`);
console.log(`  Errors: ${stats.errors}`);
console.log();

// Show invalid message handling
console.log('Test 3: Invalid message handling');
console.log('-'.repeat(40));
const client3 = dgram.createSocket('udp4');

server.once('error', (err) => {
  console.log(`⚠️  Server correctly rejected invalid message: ${err.message}`);
  console.log();
});

await new Promise((resolve) => {
  client3.bind(() => {
    console.log('📤 Sending invalid (non-STUN) message...');
    client3.send(Buffer.from('NOT_A_STUN_MESSAGE'), serverPort, '127.0.0.1');
    setTimeout(() => {
      client3.close();
      resolve();
    }, 200);
  });
});

console.log('='.repeat(60));
console.log('STUN Demo Complete');
console.log('='.repeat(60));

await server.stop();
console.log('👋 Server stopped');
