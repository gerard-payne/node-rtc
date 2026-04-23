/**
 * @fileoverview Tests for StunServer class
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import dgram from 'dgram';
import { StunServer } from '../src/stun-server.js';
import { StunMessage } from '../src/stun-message.js';
import {
  STUN_MESSAGE_TYPE,
  STUN_ATTRIBUTE_TYPE,
} from '../src/constants.js';

describe('StunServer', () => {
  let server;
  let serverPort;

  before(async () => {
    server = new StunServer({ port: 0 });
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
      const s = new StunServer();
      assert.strictEqual(s.port, 3478);
      assert.strictEqual(s.address, '0.0.0.0');
      assert.strictEqual(s.running, false);
    });

    it('should create server with custom options', () => {
      const s = new StunServer({
        port: 1234,
        address: '127.0.0.1',
        software: 'Custom/1.0',
      });
      assert.strictEqual(s.port, 1234);
      assert.strictEqual(s.address, '127.0.0.1');
      assert.strictEqual(s.software, 'Custom/1.0');
    });
  });

  describe('start', () => {
    it('should start server and emit listening event', async () => {
      const s = new StunServer({ port: 0 });
      let listeningEmitted = false;

      s.on('listening', () => {
        listeningEmitted = true;
      });

      await s.start();

      assert.strictEqual(s.isRunning(), true);
      assert.strictEqual(listeningEmitted, true);

      await s.stop();
    });

    it('should throw if server already running', async () => {
      const s = new StunServer({ port: 0 });
      await s.start();

      await assert.rejects(
        s.start(),
        /already running/,
      );

      await s.stop();
    });
  });

  describe('stop', () => {
    it('should stop server and emit close event', async () => {
      const s = new StunServer({ port: 0 });
      await s.start();

      let closeEmitted = false;
      s.on('close', () => {
        closeEmitted = true;
      });

      await s.stop();

      assert.strictEqual(s.isRunning(), false);
      assert.strictEqual(closeEmitted, true);
    });

    it('should not throw if server not running', async () => {
      const s = new StunServer({ port: 0 });
      await s.stop();
      assert.strictEqual(s.isRunning(), false);
    });
  });

  describe('handleMessage', () => {
    it('should handle binding request and respond', async () => {
      const client = dgram.createSocket('udp4');
      const request = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_REQUEST,
      });

      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.close();
          reject(new Error('Timeout'));
        }, 2000);

        client.on('message', (msg) => {
          clearTimeout(timeout);
          client.close();
          resolve(StunMessage.parse(msg));
        });

        client.bind(() => {
          const buffer = request.serialize();
          client.send(buffer, serverPort, '127.0.0.1');
        });
      });

      assert.ok(response);
      assert.strictEqual(response.type, STUN_MESSAGE_TYPE.BINDING_RESPONSE);
      assert.ok(response.transactionId.equals(request.transactionId));

      const xorMappedAddr = response.getAttribute(STUN_ATTRIBUTE_TYPE.XOR_MAPPED_ADDRESS);
      assert.ok(xorMappedAddr);
    });

    it('should include software attribute in response', async () => {
      const client = dgram.createSocket('udp4');
      const request = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_REQUEST,
      });

      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.close();
          reject(new Error('Timeout'));
        }, 2000);

        client.on('message', (msg) => {
          clearTimeout(timeout);
          client.close();
          resolve(StunMessage.parse(msg));
        });

        client.bind(() => {
          client.send(request.serialize(), serverPort, '127.0.0.1');
        });
      });

      const software = response.getAttribute(STUN_ATTRIBUTE_TYPE.SOFTWARE);
      assert.ok(software);
      assert.ok(software.toString('utf8').includes('nodeRTC'));
    });
  });

  describe('Statistics', () => {
    it('should track requests received', async () => {
      const initialStats = server.getStats();
      const client = dgram.createSocket('udp4');
      const request = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_REQUEST,
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.close();
          reject(new Error('Timeout'));
        }, 2000);

        client.on('message', () => {
          clearTimeout(timeout);
          client.close();
          resolve();
        });

        client.bind(() => {
          client.send(request.serialize(), serverPort, '127.0.0.1');
        });
      });

      const finalStats = server.getStats();
      assert.ok(finalStats.requestsReceived > initialStats.requestsReceived);
    });

    it('should reset statistics', () => {
      server.resetStats();
      const stats = server.getStats();
      assert.strictEqual(stats.requestsReceived, 0);
      assert.strictEqual(stats.responsesSent, 0);
      assert.strictEqual(stats.errors, 0);
    });
  });

  describe('Events', () => {
    it('should emit request event', async () => {
      let requestEmitted = false;
      const handler = () => { requestEmitted = true; };
      server.once('request', handler);

      const client = dgram.createSocket('udp4');
      const request = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_REQUEST,
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.close();
          reject(new Error('Timeout'));
        }, 2000);

        client.on('message', () => {
          clearTimeout(timeout);
          client.close();
          resolve();
        });

        client.bind(() => {
          client.send(request.serialize(), serverPort, '127.0.0.1');
        });
      });

      assert.strictEqual(requestEmitted, true);
    });

    it('should emit response event', async () => {
      let responseEmitted = false;
      const handler = () => { responseEmitted = true; };
      server.once('response', handler);

      const client = dgram.createSocket('udp4');
      const request = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_REQUEST,
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          client.close();
          reject(new Error('Timeout'));
        }, 2000);

        client.on('message', () => {
          clearTimeout(timeout);
          client.close();
          resolve();
        });

        client.bind(() => {
          client.send(request.serialize(), serverPort, '127.0.0.1');
        });
      });

      assert.strictEqual(responseEmitted, true);
    });
  });
});
