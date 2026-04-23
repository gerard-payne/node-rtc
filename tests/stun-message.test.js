/**
 * @fileoverview Tests for StunMessage class
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { StunMessage } from '../src/stun-message.js';
import {
  STUN_MESSAGE_TYPE,
  STUN_ATTRIBUTE_TYPE,
  STUN_MAGIC_COOKIE,
  STUN_HEADER_LENGTH,
} from '../src/constants.js';

describe('StunMessage', () => {
  describe('Constructor', () => {
    it('should create message with type and auto-generated transaction ID', () => {
      const msg = new StunMessage({ type: STUN_MESSAGE_TYPE.BINDING_REQUEST });

      assert.strictEqual(msg.type, STUN_MESSAGE_TYPE.BINDING_REQUEST);
      assert.ok(msg.transactionId);
      assert.strictEqual(msg.transactionId.length, 12);
      assert.deepStrictEqual(msg.attributes, []);
    });

    it('should create message with provided transaction ID', () => {
      const tid = Buffer.alloc(12, 0xAB);
      const msg = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_REQUEST,
        transactionId: tid,
      });

      assert.ok(msg.transactionId.equals(tid));
    });
  });

  describe('generateTransactionId', () => {
    it('should generate 12-byte transaction ID', () => {
      const tid = StunMessage.generateTransactionId();
      assert.strictEqual(tid.length, 12);
    });

    it('should generate different IDs on each call', () => {
      const tid1 = StunMessage.generateTransactionId();
      const tid2 = StunMessage.generateTransactionId();
      assert.ok(!tid1.equals(tid2) || tid1.compare(tid2) !== 0);
    });
  });

  describe('parse', () => {
    it('should parse valid binding request', () => {
      const tid = Buffer.alloc(12, 0xAB);
      const original = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_REQUEST,
        transactionId: tid,
      });

      const serialized = original.serialize();
      const parsed = StunMessage.parse(serialized);

      assert.ok(parsed);
      assert.strictEqual(parsed.type, STUN_MESSAGE_TYPE.BINDING_REQUEST);
      assert.ok(parsed.transactionId.equals(tid));
    });

    it('should return null for message too short', () => {
      const result = StunMessage.parse(Buffer.alloc(10));
      assert.strictEqual(result, null);
    });

    it('should return null for invalid magic cookie', () => {
      const buffer = Buffer.alloc(20);
      buffer.writeUInt16BE(STUN_MESSAGE_TYPE.BINDING_REQUEST, 0);
      buffer.writeUInt16BE(0, 2);
      buffer.writeUInt32BE(0xDEADBEEF, 4);
      buffer.fill(0xAB, 8, 20);

      const result = StunMessage.parse(buffer);
      assert.strictEqual(result, null);
    });

    it('should return null for mismatched length', () => {
      const buffer = Buffer.alloc(20);
      buffer.writeUInt16BE(STUN_MESSAGE_TYPE.BINDING_REQUEST, 0);
      buffer.writeUInt16BE(100, 2);
      buffer.writeUInt32BE(STUN_MAGIC_COOKIE, 4);
      buffer.fill(0xAB, 8, 20);

      const result = StunMessage.parse(buffer);
      assert.strictEqual(result, null);
    });

    it('should parse message with attributes', () => {
      const msg = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_REQUEST,
      });
      msg.addSoftware('Test/1.0');

      const parsed = StunMessage.parse(msg.serialize());
      assert.ok(parsed);
      assert.strictEqual(parsed.attributes.length, 1);
    });
  });

  describe('addAttribute and getAttribute', () => {
    it('should add and retrieve attribute', () => {
      const msg = new StunMessage({ type: STUN_MESSAGE_TYPE.BINDING_REQUEST });
      const value = Buffer.from('test');

      msg.addAttribute(STUN_ATTRIBUTE_TYPE.USERNAME, value);

      const retrieved = msg.getAttribute(STUN_ATTRIBUTE_TYPE.USERNAME);
      assert.ok(retrieved.equals(value));
    });

    it('should return undefined for non-existent attribute', () => {
      const msg = new StunMessage({ type: STUN_MESSAGE_TYPE.BINDING_REQUEST });
      const result = msg.getAttribute(STUN_ATTRIBUTE_TYPE.REALM);
      assert.strictEqual(result, undefined);
    });
  });

  describe('serialize', () => {
    it('should serialize basic message', () => {
      const msg = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_REQUEST,
      });

      const buffer = msg.serialize();

      assert.strictEqual(buffer.length, STUN_HEADER_LENGTH);
      assert.strictEqual(buffer.readUInt16BE(0), STUN_MESSAGE_TYPE.BINDING_REQUEST);
      assert.strictEqual(buffer.readUInt16BE(2), 0);
      assert.strictEqual(buffer.readUInt32BE(4), STUN_MAGIC_COOKIE);
    });

    it('should serialize message with attributes', () => {
      const msg = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_RESPONSE,
      });
      msg.addSoftware('Test/1.0');

      const buffer = msg.serialize();

      assert.ok(buffer.length > STUN_HEADER_LENGTH);
      assert.strictEqual(buffer.readUInt16BE(0), STUN_MESSAGE_TYPE.BINDING_RESPONSE);
    });
  });

  describe('addMappedAddress', () => {
    it('should add IPv4 mapped address', () => {
      const msg = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_RESPONSE,
      });

      msg.addMappedAddress('192.168.1.1', 12345);

      const attr = msg.getAttribute(STUN_ATTRIBUTE_TYPE.MAPPED_ADDRESS);
      assert.ok(attr);
      assert.strictEqual(attr.readUInt8(1), 0x01);
      assert.strictEqual(attr.readUInt16BE(2), 12345);
    });

    it('should add XOR mapped address', () => {
      const msg = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_RESPONSE,
      });

      msg.addMappedAddress('192.168.1.1', 12345, true);

      const attr = msg.getAttribute(STUN_ATTRIBUTE_TYPE.XOR_MAPPED_ADDRESS);
      assert.ok(attr);
    });
  });

  describe('addErrorCode', () => {
    it('should add error code with default reason', () => {
      const msg = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_ERROR_RESPONSE,
      });

      msg.addErrorCode(400);

      const attr = msg.getAttribute(STUN_ATTRIBUTE_TYPE.ERROR_CODE);
      assert.ok(attr);
      assert.strictEqual(attr.readUInt8(2), 4);
      assert.strictEqual(attr.readUInt8(3), 0);
    });

    it('should add error code with custom reason', () => {
      const msg = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_ERROR_RESPONSE,
      });

      msg.addErrorCode(401, 'Custom Error');

      const attr = msg.getAttribute(STUN_ATTRIBUTE_TYPE.ERROR_CODE);
      assert.ok(attr);
      const reason = attr.toString('utf8', 4);
      assert.ok(reason.includes('Custom Error'));
    });
  });

  describe('addUsername', () => {
    it('should add username attribute', () => {
      const msg = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_REQUEST,
      });

      msg.addUsername('testuser');

      const attr = msg.getAttribute(STUN_ATTRIBUTE_TYPE.USERNAME);
      assert.ok(attr);
      assert.strictEqual(attr.toString('utf8'), 'testuser');
    });
  });

  describe('addRealm', () => {
    it('should add realm attribute', () => {
      const msg = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_REQUEST,
      });

      msg.addRealm('testrealm');

      const attr = msg.getAttribute(STUN_ATTRIBUTE_TYPE.REALM);
      assert.ok(attr);
      assert.strictEqual(attr.toString('utf8'), 'testrealm');
    });
  });

  describe('addNonce', () => {
    it('should add nonce attribute', () => {
      const msg = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_REQUEST,
      });

      msg.addNonce('testnonce');

      const attr = msg.getAttribute(STUN_ATTRIBUTE_TYPE.NONCE);
      assert.ok(attr);
      assert.strictEqual(attr.toString('utf8'), 'testnonce');
    });
  });

  describe('addSoftware', () => {
    it('should add software attribute', () => {
      const msg = new StunMessage({
        type: STUN_MESSAGE_TYPE.BINDING_RESPONSE,
      });

      msg.addSoftware('Test/1.0');

      const attr = msg.getAttribute(STUN_ATTRIBUTE_TYPE.SOFTWARE);
      assert.ok(attr);
      assert.strictEqual(attr.toString('utf8'), 'Test/1.0');
    });
  });

  describe('parseAddress', () => {
    it('should parse IPv4 address', () => {
      const value = Buffer.alloc(8);
      value.writeUInt8(0, 0);
      value.writeUInt8(0x01, 1);
      value.writeUInt16BE(12345, 2);
      value.writeUInt8(192, 4);
      value.writeUInt8(168, 5);
      value.writeUInt8(1, 6);
      value.writeUInt8(1, 7);

      const parsed = StunMessage.parseAddress(value);
      assert.strictEqual(parsed.family, 0x01);
      assert.strictEqual(parsed.address, '192.168.1.1');
      assert.strictEqual(parsed.port, 12345);
    });
  });
});
