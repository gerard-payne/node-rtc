/**
 * TURN Server Demo
 * Demonstrates allocations, permissions, and channel bindings
 */

import { TurnServer, TurnAllocation } from '../src/index.js';
import { StunMessage } from '../src/stun-message.js';
import { TURN_MESSAGE_TYPE, STUN_ATTRIBUTE_TYPE } from '../src/constants.js';
import dgram from 'dgram';

console.log('='.repeat(60));
console.log('TURN Server Demo');
console.log('='.repeat(60));
console.log();
console.log('TURN provides relay functionality for NAT traversal.');
console.log('Key concepts:');
console.log('  - Allocation: Reserve a relay port on the server');
console.log('  - Permission: Authorize specific peers to send data');
console.log('  - Channel: Optimize data transfer with channel numbers');
console.log();

// Create TURN server
const server = new TurnServer({
  port: 0,
  address: '127.0.0.1',
  relayAddress: '127.0.0.1',
  realm: 'nodeRTC-Demo',
});

console.log('📡 Starting TURN server...');

server.on('listening', () => {
  const port = server.socket.address().port;
  console.log(`✅ TURN server listening on 127.0.0.1:${port}`);
  console.log();
});

server.on('allocationCreated', (key, allocation) => {
  console.log(`🆕 [EVENT] Allocation created: ${key}`);
  console.log(`   Relay: ${allocation.relayAddress}:${allocation.relayPort}`);
  console.log(`   Lifetime: ${allocation.lifetime}s`);
  console.log();
});

await server.start();
const serverPort = server.socket.address().port;

// Demo 1: Create Allocation
console.log('Demo 1: Create Allocation');
console.log('-'.repeat(60));

const client1 = dgram.createSocket('udp4');
const allocateRequest = new StunMessage({
  type: TURN_MESSAGE_TYPE.ALLOCATE,
});

// REQUESTED-TRANSPORT attribute (UDP = 17)
const transportAttr = Buffer.from([17, 0, 0, 0]);
allocateRequest.addAttribute(STUN_ATTRIBUTE_TYPE.REQUESTED_TRANSPORT, transportAttr);

await new Promise((resolve) => {
  client1.on('message', (msg) => {
    const response = StunMessage.parse(msg);
    console.log(`📥 [RESPONSE] Type: ${response.type.toString(16)} (Allocate Response)`);

    const relayedAttr = response.getAttribute(STUN_ATTRIBUTE_TYPE.XOR_RELAYED_ADDRESS);
    const mappedAttr = response.getAttribute(STUN_ATTRIBUTE_TYPE.XOR_MAPPED_ADDRESS);

    if (relayedAttr) {
      console.log('✅ Allocation successful!');
      console.log(`   XOR-RELAYED-ADDRESS: <received>`);
    }
    if (mappedAttr) {
      console.log(`   XOR-MAPPED-ADDRESS: <client's server-reflexive address>`);
    }

    const lifetimeAttr = response.getAttribute(STUN_ATTRIBUTE_TYPE.LIFETIME);
    if (lifetimeAttr) {
      const lifetime = lifetimeAttr.readUInt32BE(0);
      console.log(`   LIFETIME: ${lifetime} seconds`);
    }

    console.log();
    client1.close();
    resolve();
  });

  client1.bind(() => {
    const clientPort = client1.address().port;
    console.log(`📤 [REQUEST] Allocate request from client port ${clientPort}`);
    console.log('   Attributes:');
    console.log('     - REQUESTED-TRANSPORT: UDP (17)');
    client1.send(allocateRequest.serialize(), serverPort, '127.0.0.1');
  });
});

// Wait a moment then show stats
await new Promise(r => setTimeout(r, 100));

console.log('Current Server State:');
console.log(`   Active allocations: ${server.getAllocationCount()}`);
console.log(`   Total created: ${server.getStats().allocationsCreated}`);
console.log();

// Demo 2: Create Permission
console.log('Demo 2: Create Permission');
console.log('-'.repeat(60));
console.log('Permissions control which peer addresses can send data to the client');
console.log();

// Reuse same client socket for the same allocation
const client2 = dgram.createSocket('udp4');

await new Promise((resolve) => {
  // First create allocation
  const req1 = new StunMessage({ type: TURN_MESSAGE_TYPE.ALLOCATE });
  req1.addAttribute(STUN_ATTRIBUTE_TYPE.REQUESTED_TRANSPORT, Buffer.from([17, 0, 0, 0]));

  client2.once('message', () => {
    console.log('✅ Allocation established');

    // Now create permission
    const req2 = new StunMessage({ type: TURN_MESSAGE_TYPE.CREATE_PERMISSION });

    // XOR-PEER-ADDRESS for peer 192.168.1.100:12345 (encoded)
    const peerFamily = 0x01;
    const peerPort = 12345 ^ 0x2112; // XOR with high bits of magic cookie
    const peerAddr = Buffer.from([192 ^ 0x21, 168 ^ 0x12, 1 ^ 0xa4, 100 ^ 0x42]);
    const peerAttr = Buffer.concat([Buffer.from([0, peerFamily]), Buffer.from([(peerPort >> 8) & 0xff, peerPort & 0xff]), peerAddr]);
    req2.addAttribute(STUN_ATTRIBUTE_TYPE.XOR_PEER_ADDRESS, peerAttr);

    client2.once('message', (msg2) => {
      const resp2 = StunMessage.parse(msg2);
      if (resp2.type === TURN_MESSAGE_TYPE.CREATE_PERMISSION_RESPONSE) {
        console.log('✅ Permission created for peer 192.168.1.100:12345');
        console.log('   Peer can now send data through the relay to this client');
      }
      console.log();
      client2.close();
      resolve();
    });

    console.log('📤 [REQUEST] CreatePermission for 192.168.1.100:12345');
    client2.send(req2.serialize(), serverPort, '127.0.0.1');
  });

  client2.bind(() => {
    client2.send(req1.serialize(), serverPort, '127.0.0.1');
  });
});

// Demo 3: Channel Bind
console.log('Demo 3: Channel Bind');
console.log('-'.repeat(60));
console.log('Channel bindings reduce packet overhead from 36 bytes to 4 bytes');
console.log();

const client3 = dgram.createSocket('udp4');

await new Promise((resolve) => {
  // Create allocation first
  const req1 = new StunMessage({ type: TURN_MESSAGE_TYPE.ALLOCATE });
  req1.addAttribute(STUN_ATTRIBUTE_TYPE.REQUESTED_TRANSPORT, Buffer.from([17, 0, 0, 0]));

  client3.once('message', () => {
    console.log('✅ Allocation established');

    // Channel bind
    const req2 = new StunMessage({ type: TURN_MESSAGE_TYPE.CHANNEL_BIND });

    // CHANNEL-NUMBER (0x4000 = 16384)
    const channelAttr = Buffer.from([0x40, 0x00, 0, 0]);
    req2.addAttribute(STUN_ATTRIBUTE_TYPE.CHANNEL_NUMBER, channelAttr);

    // XOR-PEER-ADDRESS
    const peerPort = 54321 ^ 0x2112;
    const peerAddr = Buffer.from([10 ^ 0x21, 0 ^ 0x12, 0 ^ 0xa4, 50 ^ 0x42]);
    const peerAttr = Buffer.concat([Buffer.from([0, 0x01]), Buffer.from([(peerPort >> 8) & 0xff, peerPort & 0xff]), peerAddr]);
    req2.addAttribute(STUN_ATTRIBUTE_TYPE.XOR_PEER_ADDRESS, peerAttr);

    client3.once('message', (msg2) => {
      const resp2 = StunMessage.parse(msg2);
      if (resp2.type === TURN_MESSAGE_TYPE.CHANNEL_BIND_RESPONSE) {
        console.log('✅ Channel 0x4000 bound to peer 10.0.0.50:54321');
        console.log('   Data can now be sent as [ChannelNum:2][Length:2][Data:N]');
        console.log('   vs [STUN Header:20][XOR-PEER-ADDR:12][DATA:4+N]');
        console.log('   Savings: ~20 bytes per packet!');
      }
      console.log();
      client3.close();
      resolve();
    });

    console.log('📤 [REQUEST] ChannelBind for channel 0x4000 -> 10.0.0.50:54321');
    client3.send(req2.serialize(), serverPort, '127.0.0.1');
  });

  client3.bind(() => {
    client3.send(req1.serialize(), serverPort, '127.0.0.1');
  });
});

// Final statistics
console.log('='.repeat(60));
console.log('TURN Server Statistics');
console.log('='.repeat(60));
const finalStats = server.getStats();
console.log(`Allocations created:   ${finalStats.allocationsCreated}`);
console.log(`Permissions created:   ${finalStats.permissionsCreated}`);
console.log(`Channels bound:        ${finalStats.channelsBound}`);
console.log(`Current allocations:   ${server.getAllocationCount()}`);
console.log();

await server.stop();
console.log('👋 TURN server stopped');
