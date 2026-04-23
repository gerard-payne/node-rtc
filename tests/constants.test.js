/**
 * @fileoverview Tests for constants module
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  STUN_MESSAGE_TYPE,
  TURN_MESSAGE_TYPE,
  STUN_ATTRIBUTE_TYPE,
  STUN_ERROR_CODE,
  STUN_ERROR_REASON,
  STUN_MAGIC_COOKIE,
  STUN_TRANSACTION_ID_LENGTH,
  STUN_HEADER_LENGTH,
  DEFAULT_STUN_PORT,
  DEFAULT_TURN_PORT,
  DEFAULT_ALLOCATION_LIFETIME,
  MAX_ALLOCATION_LIFETIME,
  MIN_ALLOCATION_LIFETIME,
  TRANSPORT_PROTOCOL,
  ICE_CANDIDATE_TYPE,
} from '../src/constants.js';

describe('Constants', () => {
  describe('STUN_MESSAGE_TYPE', () => {
    it('should have binding request type', () => {
      assert.strictEqual(STUN_MESSAGE_TYPE.BINDING_REQUEST, 0x0001);
    });

    it('should have binding response type', () => {
      assert.strictEqual(STUN_MESSAGE_TYPE.BINDING_RESPONSE, 0x0101);
    });

    it('should have binding error response type', () => {
      assert.strictEqual(STUN_MESSAGE_TYPE.BINDING_ERROR_RESPONSE, 0x0111);
    });
  });

  describe('TURN_MESSAGE_TYPE', () => {
    it('should have allocate type', () => {
      assert.strictEqual(TURN_MESSAGE_TYPE.ALLOCATE, 0x0003);
    });

    it('should have refresh type', () => {
      assert.strictEqual(TURN_MESSAGE_TYPE.REFRESH, 0x0004);
    });

    it('should have create permission type', () => {
      assert.strictEqual(TURN_MESSAGE_TYPE.CREATE_PERMISSION, 0x0008);
    });

    it('should have channel bind type', () => {
      assert.strictEqual(TURN_MESSAGE_TYPE.CHANNEL_BIND, 0x0009);
    });
  });

  describe('STUN_ATTRIBUTE_TYPE', () => {
    it('should have mapped address type', () => {
      assert.strictEqual(STUN_ATTRIBUTE_TYPE.MAPPED_ADDRESS, 0x0001);
    });

    it('should have xor mapped address type', () => {
      assert.strictEqual(STUN_ATTRIBUTE_TYPE.XOR_MAPPED_ADDRESS, 0x0020);
    });

    it('should have message integrity type', () => {
      assert.strictEqual(STUN_ATTRIBUTE_TYPE.MESSAGE_INTEGRITY, 0x0008);
    });
  });

  describe('STUN_ERROR_CODE', () => {
    it('should have bad request code', () => {
      assert.strictEqual(STUN_ERROR_CODE.BAD_REQUEST, 400);
    });

    it('should have unauthorized code', () => {
      assert.strictEqual(STUN_ERROR_CODE.UNAUTHORIZED, 401);
    });
  });

  describe('Protocol Constants', () => {
    it('should have correct magic cookie', () => {
      assert.strictEqual(STUN_MAGIC_COOKIE, 0x2112a442);
    });

    it('should have correct transaction ID length', () => {
      assert.strictEqual(STUN_TRANSACTION_ID_LENGTH, 12);
    });

    it('should have correct header length', () => {
      assert.strictEqual(STUN_HEADER_LENGTH, 20);
    });
  });

  describe('Port Constants', () => {
    it('should have default STUN port', () => {
      assert.strictEqual(DEFAULT_STUN_PORT, 3478);
    });

    it('should have default TURN port', () => {
      assert.strictEqual(DEFAULT_TURN_PORT, 3478);
    });
  });

  describe('Allocation Lifetime Constants', () => {
    it('should have default allocation lifetime', () => {
      assert.strictEqual(DEFAULT_ALLOCATION_LIFETIME, 600);
    });

    it('should have max allocation lifetime', () => {
      assert.strictEqual(MAX_ALLOCATION_LIFETIME, 3600);
    });

    it('should have min allocation lifetime', () => {
      assert.strictEqual(MIN_ALLOCATION_LIFETIME, 60);
    });
  });

  describe('ICE_CANDIDATE_TYPE', () => {
    it('should have host type', () => {
      assert.strictEqual(ICE_CANDIDATE_TYPE.HOST, 'host');
    });

    it('should have srflx type', () => {
      assert.strictEqual(ICE_CANDIDATE_TYPE.SRFLX, 'srflx');
    });

    it('should have relay type', () => {
      assert.strictEqual(ICE_CANDIDATE_TYPE.RELAY, 'relay');
    });
  });

  describe('TRANSPORT_PROTOCOL', () => {
    it('should have UDP protocol', () => {
      assert.strictEqual(TRANSPORT_PROTOCOL.UDP, 'udp');
    });

    it('should have TCP protocol', () => {
      assert.strictEqual(TRANSPORT_PROTOCOL.TCP, 'tcp');
    });
  });
});
