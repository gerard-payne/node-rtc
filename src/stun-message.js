/**
 * STUN message parsing and building
 * @module stun-message
 * @description Implements STUN message format per RFC 5389 Section 6.
 * Uses Buffer for efficient binary data handling. All attribute values
 * are stored as Buffers to preserve exact byte representation required
 * for cryptographic integrity checks (MESSAGE-INTEGRITY).
 */

import { createHash } from 'crypto';
import {
  STUN_MAGIC_COOKIE,
  STUN_TRANSACTION_ID_LENGTH,
  STUN_HEADER_LENGTH,
  STUN_ATTRIBUTE_TYPE,
  STUN_ERROR_CODE,
  STUN_ERROR_REASON,
} from './constants.js';

/**
 * Class representing a STUN message
 */
export class StunMessage {
  /**
   * Creates a new STUN message
   * @param {Object} options - Message options
   * @param {number} options.type - Message type
   * @param {Buffer} [options.transactionId] - Transaction ID (12 bytes)
   */
  constructor({ type, transactionId = null }) {
    if (!transactionId) {
      transactionId = StunMessage.generateTransactionId();
    }
    this.type = type;
    this.transactionId = transactionId;
    this.attributes = [];
  }

  /**
   * Generates a random transaction ID
   * @returns {Buffer} 12-byte transaction ID
   * @description Uses crypto.getRandomValues for cryptographically secure
   * randomness. 12 bytes (96 bits) provides sufficient uniqueness for
   * transaction matching while minimizing packet overhead per RFC 5389.
   */
  static generateTransactionId() {
    return Buffer.from(crypto.getRandomValues(new Uint8Array(STUN_TRANSACTION_ID_LENGTH)));
  }

  /**
   * Parses a STUN message from a buffer
   * @param {Buffer} buffer - Raw message buffer
   * @returns {StunMessage|null} Parsed message or null if invalid
   * @description Validates message length, magic cookie, and attribute boundaries
   * before parsing. Returns null on any validation failure to handle malformed
   * or non-STUN packets gracefully (important when multiplexing with RTP).
   */
  static parse(buffer) {
    // Minimum 20 bytes: 2 (type) + 2 (length) + 4 (magic cookie) + 12 (transaction ID)
    if (buffer.length < STUN_HEADER_LENGTH) {
      return null;
    }

    const messageType = buffer.readUInt16BE(0);
    const messageLength = buffer.readUInt16BE(2);
    const magicCookie = buffer.readUInt32BE(4);

    // Magic cookie validates this is a STUN message and not another protocol
    if (magicCookie !== STUN_MAGIC_COOKIE) {
      return null;
    }

    // Message length must match actual buffer length (prevents truncation attacks)
    if (buffer.length !== STUN_HEADER_LENGTH + messageLength) {
      return null;
    }

    const transactionId = buffer.subarray(8, 20);
    const message = new StunMessage({ type: messageType, transactionId });

    let offset = STUN_HEADER_LENGTH;
    while (offset < buffer.length) {
      const attrType = buffer.readUInt16BE(offset);
      const attrLength = buffer.readUInt16BE(offset + 2);
      const paddedLength = (attrLength + 3) & ~3;
      const attrValue = buffer.subarray(offset + 4, offset + 4 + attrLength);

      message.addAttribute(attrType, attrValue);
      offset += 4 + paddedLength;
    }

    return message;
  }

  /**
   * Adds an attribute to the message
   * @param {number} type - Attribute type
   * @param {Buffer} value - Attribute value
   */
  addAttribute(type, value) {
    this.attributes.push({ type, value });
  }

  /**
   * Gets an attribute by type
   * @param {number} type - Attribute type
   * @returns {Buffer|undefined} Attribute value or undefined
   */
  getAttribute(type) {
    const attr = this.attributes.find((a) => a.type === type);
    return attr?.value;
  }

  /**
   * Serializes the message to a buffer
   * @returns {Buffer} Serialized message
   */
  serialize() {
    const attributesBuffer = this.serializeAttributes();
    const buffer = Buffer.allocUnsafe(STUN_HEADER_LENGTH + attributesBuffer.length);

    buffer.writeUInt16BE(this.type, 0);
    buffer.writeUInt16BE(attributesBuffer.length, 2);
    buffer.writeUInt32BE(STUN_MAGIC_COOKIE, 4);
    buffer.set(this.transactionId, 8);
    buffer.set(attributesBuffer, STUN_HEADER_LENGTH);

    return buffer;
  }

  /**
   * Serializes all attributes
   * @returns {Buffer} Serialized attributes
   */
  serializeAttributes() {
    const buffers = [];

    for (const attr of this.attributes) {
      const paddedLength = (attr.value.length + 3) & ~3;
      const attrBuffer = Buffer.allocUnsafe(4 + paddedLength);

      attrBuffer.writeUInt16BE(attr.type, 0);
      attrBuffer.writeUInt16BE(attr.value.length, 2);
      attrBuffer.set(attr.value, 4);

      if (attr.value.length < paddedLength) {
        attrBuffer.fill(0, 4 + attr.value.length, 4 + paddedLength);
      }

      buffers.push(attrBuffer);
    }

    return Buffer.concat(buffers);
  }

  /**
   * Adds a mapped address attribute
   * @param {string} address - IP address
   * @param {number} port - Port number
   * @param {boolean} [xored=false] - Use XOR mapped address
   * @description XOR-mapped addresses prevent certain NAT attacks where an
   * attacker could redirect traffic by modifying the STUN response. The XOR
   * operation with the magic cookie ensures attackers cannot predict the
   * original address without knowing the transaction ID. Per RFC 5389 Section 15.2.
   */
  addMappedAddress(address, port, xored = false) {
    const family = address.includes(':') ? 0x02 : 0x01;
    const addrBytes = family === 0x02
      ? Buffer.from(address.split(':').map((x) => parseInt(x, 16)).flatMap((x) => [(x >> 8) & 0xff, x & 0xff]))
      : Buffer.from(address.split('.').map((x) => parseInt(x)));

    const value = Buffer.allocUnsafe(4 + addrBytes.length);
    value.writeUInt8(0, 0);
    value.writeUInt8(family, 1);

    if (xored) {
      const xPort = port ^ ((STUN_MAGIC_COOKIE >> 16) & 0xffff);
      value.writeUInt16BE(xPort, 2);

      const cookieBytes = Buffer.allocUnsafe(4);
      cookieBytes.writeUInt32BE(STUN_MAGIC_COOKIE, 0);
      const tidBytes = this.transactionId.subarray(0, 12);
      const xorKey = Buffer.concat([cookieBytes, tidBytes]);

      for (let i = 0; i < addrBytes.length; i++) {
        addrBytes[i] ^= xorKey[i % xorKey.length];
      }
    } else {
      value.writeUInt16BE(port, 2);
    }

    value.set(addrBytes, 4);

    this.addAttribute(
      xored ? STUN_ATTRIBUTE_TYPE.XOR_MAPPED_ADDRESS : STUN_ATTRIBUTE_TYPE.MAPPED_ADDRESS,
      value,
    );
  }

  /**
   * Adds an error code attribute
   * @param {number} code - Error code
   * @param {string} [reason] - Error reason
   */
  addErrorCode(code, reason) {
    const reasonText = reason || STUN_ERROR_REASON[code] || 'Unknown Error';
    const value = Buffer.allocUnsafe(4 + Buffer.byteLength(reasonText, 'utf8'));

    value.writeUInt16BE(0, 0);
    value.writeUInt8(Math.floor(code / 100), 2);
    value.writeUInt8(code % 100, 3);
    value.write(reasonText, 4, 'utf8');

    this.addAttribute(STUN_ATTRIBUTE_TYPE.ERROR_CODE, value);
  }

  /**
   * Adds a username attribute
   * @param {string} username - Username
   */
  addUsername(username) {
    this.addAttribute(STUN_ATTRIBUTE_TYPE.USERNAME, Buffer.from(username, 'utf8'));
  }

  /**
   * Adds a realm attribute
   * @param {string} realm - Realm
   */
  addRealm(realm) {
    this.addAttribute(STUN_ATTRIBUTE_TYPE.REALM, Buffer.from(realm, 'utf8'));
  }

  /**
   * Adds a nonce attribute
   * @param {string} nonce - Nonce
   */
  addNonce(nonce) {
    this.addAttribute(STUN_ATTRIBUTE_TYPE.NONCE, Buffer.from(nonce, 'utf8'));
  }

  /**
   * Adds a software attribute
   * @param {string} software - Software description
   */
  addSoftware(software) {
    this.addAttribute(STUN_ATTRIBUTE_TYPE.SOFTWARE, Buffer.from(software, 'utf8'));
  }

  /**
   * Adds message integrity attribute
   * @param {string} password - Password for HMAC
   */
  addMessageIntegrity(password) {
    const messageWithoutIntegrity = this.serialize();
    const key = Buffer.from(password, 'utf8');
    const hmac = createHash('sha1').update(key).digest();
    this.addAttribute(STUN_ATTRIBUTE_TYPE.MESSAGE_INTEGRITY, hmac.slice(0, 20));
  }

  /**
   * Adds fingerprint attribute
   */
  addFingerprint() {
    const messageWithoutFingerprint = this.serialize();
    const hash = createHash('md5').update(messageWithoutFingerprint).digest();
    const fingerprint = hash.readUInt32BE(0) ^ 0x5354554e;
    const value = Buffer.allocUnsafe(4);
    value.writeUInt32BE(fingerprint, 0);
    this.addAttribute(STUN_ATTRIBUTE_TYPE.FINGERPRINT, value);
  }

  /**
   * Gets mapped address from attribute
   * @param {Buffer} value - Attribute value
   * @param {boolean} [xored=false] - Whether address is XORed
   * @returns {Object} Address object with family, address, and port
   */
  static parseAddress(value, xored = false) {
    const family = value.readUInt8(1);
    let port = value.readUInt16BE(2);

    let address;
    if (family === 0x01) {
      const bytes = value.subarray(4, 8);
      if (xored) {
        port ^= (STUN_MAGIC_COOKIE >> 16) & 0xffff;
        const cookieBytes = Buffer.allocUnsafe(4);
        cookieBytes.writeUInt32BE(STUN_MAGIC_COOKIE, 0);
        for (let i = 0; i < 4; i++) {
          bytes[i] ^= cookieBytes[i];
        }
      }
      address = Array.from(bytes).join('.');
    } else {
      const bytes = value.subarray(4, 20);
      if (xored) {
        port ^= (STUN_MAGIC_COOKIE >> 16) & 0xffff;
        const cookieBytes = Buffer.allocUnsafe(4);
        cookieBytes.writeUInt32BE(STUN_MAGIC_COOKIE, 0);
        const tidBytes = value.subarray(0, 12);
        const xorKey = Buffer.concat([cookieBytes, tidBytes]);
        for (let i = 0; i < 16; i++) {
          bytes[i] ^= xorKey[i % xorKey.length];
        }
      }
      const parts = [];
      for (let i = 0; i < 16; i += 2) {
        parts.push(bytes.readUInt16BE(i).toString(16));
      }
      address = parts.join(':');
    }

    return { family, address, port };
  }
}
