/**
 * STUN server implementation
 * @module stun-server
 * @description UDP-based STUN server per RFC 5389. Uses Node.js dgram for
 * efficient UDP socket handling. Extends EventEmitter to allow external
 * monitoring and integration with logging/metrics systems.
 */

import dgram from 'dgram';
import { EventEmitter } from 'events';
import { StunMessage } from './stun-message.js';
import {
  STUN_MESSAGE_TYPE,
  STUN_ATTRIBUTE_TYPE,
  STUN_ERROR_CODE,
  DEFAULT_STUN_PORT,
} from './constants.js';

/**
 * Class representing a STUN server
 * @extends EventEmitter
 */
export class StunServer extends EventEmitter {
  /**
   * Creates a new STUN server
   * @param {Object} [options] - Server options
   * @param {number} [options.port=3478] - Port to listen on
   * @param {string} [options.address='0.0.0.0'] - Address to bind to
   * @param {string} [options.software='nodeRTC/1.0.0'] - Software description
   * @description Uses nullish coalescing (??) for port to allow port 0 (auto-assign)
   * while still defaulting to 3478 when undefined. This enables tests to use
   * ephemeral ports and production to use the standard STUN port.
   */
  constructor(options = {}) {
    super();
    this.port = options.port ?? DEFAULT_STUN_PORT;
    this.address = options.address || '0.0.0.0';
    this.software = options.software || 'nodeRTC/1.0.0';
    this.socket = null;
    this.running = false;
    this.stats = {
      requestsReceived: 0,
      responsesSent: 0,
      errors: 0,
    };
  }

  /**
   * Starts the STUN server
   * @returns {Promise<void>}
   */
  async start() {
    if (this.running) {
      throw new Error('Server is already running');
    }

    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket('udp4');

      this.socket.on('error', (err) => {
        this.emit('error', err);
        reject(err);
      });

      this.socket.on('message', (msg, rinfo) => {
        this.handleMessage(msg, rinfo);
      });

      this.socket.on('listening', () => {
        this.running = true;
        this.emit('listening');
        resolve();
      });

      this.socket.bind(this.port, this.address);
    });
  }

  /**
   * Stops the STUN server
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.running) {
      return;
    }

    return new Promise((resolve) => {
      this.socket.close(() => {
        this.running = false;
        this.emit('close');
        resolve();
      });
    });
  }

  /**
   * Handles incoming STUN messages
   * @param {Buffer} msg - Raw message
   * @param {Object} rinfo - Remote address info
   * @private
   * @description Single entry point for all UDP messages. Delegates to specific
   * handlers based on message type. Invalid messages increment error stats but
   * don't crash the server (defense against malformed packets).
   */
  handleMessage(msg, rinfo) {
    const request = StunMessage.parse(msg);

    if (!request) {
      this.stats.errors++;
      this.emit('error', new Error('Invalid STUN message'));
      return;
    }

    this.stats.requestsReceived++;
    this.emit('request', request, rinfo);

    switch (request.type) {
      case STUN_MESSAGE_TYPE.BINDING_REQUEST:
        this.handleBindingRequest(request, rinfo);
        break;
      default:
        this.handleUnknownRequest(request, rinfo);
    }
  }

  /**
   * Handles binding requests
   * @param {StunMessage} request - The request message
   * @param {Object} rinfo - Remote address info
   * @private
   * @description Core STUN functionality: reflects the client's public address
   * back to them using XOR-MAPPED-ADDRESS. The XOR operation provides security
   * benefits per RFC 5389 Section 15.2. The rinfo contains the actual peer
   * address seen by the server (NAT public side).
   */
  handleBindingRequest(request, rinfo) {
    const response = new StunMessage({
      type: STUN_MESSAGE_TYPE.BINDING_RESPONSE,
      transactionId: request.transactionId,
    });

    response.addMappedAddress(rinfo.address, rinfo.port, true);
    response.addSoftware(this.software);

    this.sendResponse(response, rinfo);
  }

  /**
   * Handles unknown requests
   * @param {StunMessage} request - The request message
   * @param {Object} rinfo - Remote address info
   * @private
   */
  handleUnknownRequest(request, rinfo) {
    const response = new StunMessage({
      type: STUN_MESSAGE_TYPE.BINDING_ERROR_RESPONSE,
      transactionId: request.transactionId,
    });

    response.addErrorCode(STUN_ERROR_CODE.BAD_REQUEST);
    response.addSoftware(this.software);

    this.sendResponse(response, rinfo);
  }

  /**
   * Sends a STUN response
   * @param {StunMessage} response - Response message
   * @param {Object} rinfo - Remote address info
   * @private
   */
  sendResponse(response, rinfo) {
    const buffer = response.serialize();

    this.socket.send(buffer, rinfo.port, rinfo.address, (err) => {
      if (err) {
        this.stats.errors++;
        this.emit('error', err);
      } else {
        this.stats.responsesSent++;
        this.emit('response', response, rinfo);
      }
    });
  }

  /**
   * Gets server statistics
   * @returns {Object} Statistics object
   * @description Returns a copy of stats to prevent external mutation.
   * Useful for monitoring dashboards and health checks.
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Resets server statistics
   */
  resetStats() {
    this.stats = {
      requestsReceived: 0,
      responsesSent: 0,
      errors: 0,
    };
  }

  /**
   * Checks if server is running
   * @returns {boolean}
   */
  isRunning() {
    return this.running;
  }
}
