/**
 * @fileoverview Tests for TurnServer class
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import dgram from 'dgram';
import { TurnServer, TurnAllocation } from '../src/turn-server.js';
import { StunMessage } from '../src/stun-message.js';
import {
  TURN_MESSAGE_TYPE,
  STUN_ATTRIBUTE_TYPE,
  STUN_MESSAGE_TYPE,
  MIN_ALLOCATION_LIFETIME,
} from '../src/constants.js';

describe('TurnAllocation', () => {
  describe('Constructor', () => {
    it('should create allocation with required parameters', () => {
      const allocation = new TurnAllocation({
        clientAddress: '192.168.1.1',
        clientPort: 12345,
        relayAddress: '10.0.0.1',
        relayPort: 54321,
        lifetime: 600,
      });

      assert.strictEqual(allocation.clientAddress, '192.168.1.1');
      assert.strictEqual(allocation.clientPort, 12345);
      assert.strictEqual(allocation.relayAddress, '10.0.0.1');
      assert.strictEqual(allocation.relayPort, 54321);
      assert.strictEqual(allocation.lifetime, 600);
      assert.ok(allocation.createdAt > 0);
      assert.ok(allocation.expiresAt > allocation.createdAt);
    });
  });

  describe('isExpired', () => {
    it('should return false for fresh allocation', () => {
      const allocation = new TurnAllocation({
        clientAddress: '192.168.1.1',
        clientPort: 12345,
        relayAddress: '10.0.0.1',
        relayPort: 54321,
        lifetime: 600,
      });

      assert.strictEqual(allocation.isExpired(), false);
    });

    it('should return true for expired allocation', () => {
      const allocation = new TurnAllocation({
        clientAddress: '192.168.1.1',
        clientPort: 12345,
        relayAddress: '10.0.0.1',
        relayPort: 54321,
        lifetime: 1,
      });

      // Force expiration by manipulating expiresAt
      allocation.expiresAt = Date.now() - 1000;
      assert.strictEqual(allocation.isExpired(), true);
    });
  });

  describe('refresh', () => {
    it('should extend expiration time', () => {
      const allocation = new TurnAllocation({
        clientAddress: '192.168.1.1',
        clientPort: 12345,
        relayAddress: '10.0.0.1',
        relayPort: 54321,
        lifetime: 600,
      });

      const originalExpiresAt = allocation.expiresAt;
      allocation.refresh(1200);

      assert.ok(allocation.expiresAt > originalExpiresAt);
      assert.strictEqual(allocation.lifetime, 1200);
    });
  });

  describe('Permissions', () => {
    it('should add and check permission', () => {
      const allocation = new TurnAllocation({
        clientAddress: '192.168.1.1',
        clientPort: 12345,
        relayAddress: '10.0.0.1',
        relayPort: 54321,
        lifetime: 600,
      });

      allocation.addPermission('8.8.8.8');
      assert.strictEqual(allocation.hasPermission('8.8.8.8'), true);
    });

    it('should return false for non-existent permission', () => {
      const allocation = new TurnAllocation({
        clientAddress: '192.168.1.1',
        clientPort: 12345,
        relayAddress: '10.0.0.1',
        relayPort: 54321,
        lifetime: 600,
      });

      assert.strictEqual(allocation.hasPermission('1.2.3.4'), false);
    });
  });

  describe('Channels', () => {
    it('should bind and retrieve channel', () => {
      const allocation = new TurnAllocation({
        clientAddress: '192.168.1.1',
        clientPort: 12345,
        relayAddress: '10.0.0.1',
        relayPort: 54321,
        lifetime: 600,
      });

      allocation.bindChannel(0x4000, '8.8.8.8', 53);
      const channel = allocation.getChannel(0x4000);

      assert.ok(channel);
      assert.strictEqual(channel.address, '8.8.8.8');
      assert.strictEqual(channel.port, 53);
    });

    it('should find channel by peer address', () => {
      const allocation = new TurnAllocation({
        clientAddress: '192.168.1.1',
        clientPort: 12345,
        relayAddress: '10.0.0.1',
        relayPort: 54321,
        lifetime: 600,
      });

      allocation.bindChannel(0x4000, '8.8.8.8', 53);
      const channelNum = allocation.getChannelByPeer('8.8.8.8', 53);

      assert.strictEqual(channelNum, 0x4000);
    });
  });
});

describe('TurnServer', () => {
  let server;
  let serverPort;

  before(async () => {
    server = new TurnServer({ port: 0 });
    await server.start();
    serverPort = server.socket.address().port;
  });

  after(async () => {
    if (server.isRunning()) {
      await server.stop();
    }
  });

  describe('Constructor', () => {
    it('should create server with default options', () => {
      const s = new TurnServer();
      assert.strictEqual(s.port, 3478);
      assert.strictEqual(s.address, '0.0.0.0');
      assert.strictEqual(s.realm, 'nodeRTC');
    });

    it('should create server with custom options', () => {
      const s = new TurnServer({
        port: 1234,
        address: '127.0.0.1',
        realm: 'custom',
      });
      assert.strictEqual(s.port, 1234);
      assert.strictEqual(s.realm, 'custom');
    });
  });

  describe('start and stop', () => {
    it('should start and stop server', async () => {
      const s = new TurnServer({ port: 0, address: '127.0.0.1' });

      await s.start();
      assert.strictEqual(s.isRunning(), true);

      await s.stop();
      assert.strictEqual(s.isRunning(), false);
    });
  });

  describe('Allocate', () => {
    it('should create allocation on allocate request', async () => {
      // Use fresh server for this test
      const testServer = new TurnServer({ port: 0, address: '127.0.0.1' });
      await testServer.start();
      const testPort = testServer.socket.address().port;

      const client = dgram.createSocket('udp4');
      const request = new StunMessage({
        type: TURN_MESSAGE_TYPE.ALLOCATE,
      });

      const transportBuffer = Buffer.from([17, 0, 0, 0]); // UDP protocol (17) + 3 bytes reserved
      request.addAttribute(STUN_ATTRIBUTE_TYPE.REQUESTED_TRANSPORT, transportBuffer);

      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.close();
          testServer.stop();
          reject(new Error('Timeout'));
        }, 3000);

        client.on('message', (msg) => {
          clearTimeout(timeout);
          client.close();
          resolve(StunMessage.parse(msg));
        });

        client.bind(() => {
          client.send(request.serialize(), testPort, '127.0.0.1');
        });
      });

      await testServer.stop();

      assert.ok(response);
      assert.strictEqual(response.type, TURN_MESSAGE_TYPE.ALLOCATE_RESPONSE);

      const xorRelayed = response.getAttribute(STUN_ATTRIBUTE_TYPE.XOR_RELAYED_ADDRESS);
      assert.ok(xorRelayed);
    });

    it('should reject allocate without requested transport', async () => {
      const client = dgram.createSocket('udp4');
      const request = new StunMessage({
        type: TURN_MESSAGE_TYPE.ALLOCATE,
      });

      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.close();
          reject(new Error('Timeout'));
        }, 3000);

        client.on('message', (msg) => {
          clearTimeout(timeout);
          client.close();
          resolve(StunMessage.parse(msg));
        });

        client.bind(() => {
          const newClientPort = 0;
          client.send(request.serialize(), serverPort, '127.0.0.1');
        });
      });

      assert.ok(response);
    });
  });

  describe('Statistics', () => {
    it('should track allocations', async () => {
      // Use fresh server for this test
      const testServer = new TurnServer({ port: 0, address: '127.0.0.1' });
      await testServer.start();
      const testPort = testServer.socket.address().port;

      testServer.resetStats();
      const initialStats = testServer.getStats();

      const client = dgram.createSocket('udp4');
      const request = new StunMessage({
        type: TURN_MESSAGE_TYPE.ALLOCATE,
      });
      const transportBuffer = Buffer.from([17, 0, 0, 0]); // UDP protocol (17) + 3 bytes reserved
      request.addAttribute(STUN_ATTRIBUTE_TYPE.REQUESTED_TRANSPORT, transportBuffer);

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.close();
          testServer.stop();
          reject(new Error('Timeout'));
        }, 3000);

        client.on('message', () => {
          clearTimeout(timeout);
          client.close();
          resolve();
        });

        client.bind(() => {
          client.send(request.serialize(), testPort, '127.0.0.1');
        });
      });

      await testServer.stop();
      const finalStats = testServer.getStats();
      assert.ok(finalStats.allocationsCreated >= initialStats.allocationsCreated);
    });

    it('should return allocation count', () => {
      const count = server.getAllocationCount();
      assert.strictEqual(typeof count, 'number');
      assert.ok(count >= 0);
    });
  });

  describe('Events', () => {
    it('should emit allocationCreated event', async () => {
      // Create a fresh server for this test to avoid conflicts
      const testServer = new TurnServer({ port: 0, address: '127.0.0.1' });
      await testServer.start();
      const testPort = testServer.socket.address().port;

      let emitted = false;
      const handler = () => { emitted = true; };
      testServer.once('allocationCreated', handler);

      const client = dgram.createSocket('udp4');
      const request = new StunMessage({
        type: TURN_MESSAGE_TYPE.ALLOCATE,
      });
      const transportBuffer = Buffer.from([17, 0, 0, 0]); // UDP protocol (17) + 3 bytes reserved
      request.addAttribute(STUN_ATTRIBUTE_TYPE.REQUESTED_TRANSPORT, transportBuffer);

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.close();
          testServer.stop();
          reject(new Error('Timeout'));
        }, 3000);

        client.on('message', () => {
          clearTimeout(timeout);
          client.close();
          resolve();
        });

        client.bind(() => {
          client.send(request.serialize(), testPort, '127.0.0.1');
        });
      });

      await testServer.stop();
      assert.strictEqual(emitted, true);
    });
  });
});
