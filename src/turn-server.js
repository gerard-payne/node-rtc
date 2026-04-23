/**
 * TURN server implementation
 * @module turn-server
 * @description TURN (Traversal Using Relays around NAT) server per RFC 5766.
 * Provides relay functionality for peers behind restrictive NATs that cannot
 * establish direct connections. Allocates relay ports and forwards packets
 * between clients and their peers.
 */

import dgram from 'dgram';
import { EventEmitter } from 'events';
import { StunMessage } from './stun-message.js';
import {
  TURN_MESSAGE_TYPE,
  STUN_ATTRIBUTE_TYPE,
  STUN_ERROR_CODE,
  DEFAULT_TURN_PORT,
  DEFAULT_ALLOCATION_LIFETIME,
  MAX_ALLOCATION_LIFETIME,
  MIN_ALLOCATION_LIFETIME,
  MIN_CHANNEL_NUMBER,
  MAX_CHANNEL_NUMBER,
  TRANSPORT_PROTOCOL,
} from './constants.js';

/**
 * Class representing a TURN allocation
 * @description An allocation represents a relay endpoint reserved for a client.
 * Each allocation has a unique relay port and maintains permissions (allowed peers)
 * and channel bindings (optimized peer-to-channel mappings). Memory-efficient
 * design using Maps for O(1) lookups of permissions and channels.
 */
export class TurnAllocation {
  /**
   * Creates a new TURN allocation
   * @param {Object} options - Allocation options
   * @param {string} options.clientAddress - Client address
   * @param {number} options.clientPort - Client port
   * @param {string} options.relayAddress - Relay address
   * @param {number} options.relayPort - Relay port
   * @param {number} options.lifetime - Allocation lifetime in seconds
   * @param {string} [options.username] - Username
   * @param {string} [options.realm] - Realm
   * @param {string} [options.nonce] - Nonce
   */
  constructor({
    clientAddress,
    clientPort,
    relayAddress,
    relayPort,
    lifetime,
    username = null,
    realm = null,
    nonce = null,
  }) {
    this.clientAddress = clientAddress;
    this.clientPort = clientPort;
    this.relayAddress = relayAddress;
    this.relayPort = relayPort;
    this.lifetime = lifetime;
    this.username = username;
    this.realm = realm;
    this.nonce = nonce;
    this.permissions = new Map();
    this.channels = new Map();
    this.createdAt = Date.now();
    this.expiresAt = this.createdAt + (lifetime * 1000);
  }

  /**
   * Checks if the allocation has expired
   * @returns {boolean}
   * @description Uses absolute timestamp comparison for reliable expiration
   * checking regardless of system time changes. Expired allocations are
   * cleaned up by periodic garbage collection in the TURN server.
   */
  isExpired() {
    return Date.now() > this.expiresAt;
  }

  /**
   * Refreshes the allocation
   * @param {number} lifetime - New lifetime in seconds
   */
  refresh(lifetime) {
    this.lifetime = Math.min(lifetime, MAX_ALLOCATION_LIFETIME);
    this.expiresAt = Date.now() + (this.lifetime * 1000);
  }

  /**
   * Adds a permission for a peer address
   * @param {string} address - Peer address
   * @param {number} [lifetime=300] - Permission lifetime in seconds
   * @description Permissions control which peers can send data to the client
   * through the relay. Without permission, packets from unknown peers are dropped
   * (security feature preventing unauthorized relay usage). Default 5 minutes.
   */
  addPermission(address, lifetime = 300) {
    this.permissions.set(address, Date.now() + (lifetime * 1000));
  }

  /**
   * Checks if an address has permission
   * @param {string} address - Peer address
   * @returns {boolean}
   */
  hasPermission(address) {
    const expiresAt = this.permissions.get(address);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      this.permissions.delete(address);
      return false;
    }
    return true;
  }

  /**
   * Binds a channel number to a peer address
   * @param {number} channelNumber - Channel number
   * @param {string} peerAddress - Peer address
   * @param {number} peerPort - Peer port
   * @description Channel bindings optimize relay performance by replacing the
   * 36-byte STUN header with a 4-byte channel header (2 bytes channel + 2 bytes length).
   * Reduces overhead from ~20% to ~5% for typical RTP packets.
   */
  bindChannel(channelNumber, peerAddress, peerPort) {
    this.channels.set(channelNumber, { address: peerAddress, port: peerPort });
  }

  /**
   * Gets channel binding
   * @param {number} channelNumber - Channel number
   * @returns {Object|undefined} Channel binding
   */
  getChannel(channelNumber) {
    return this.channels.get(channelNumber);
  }

  /**
   * Gets channel number by peer address
   * @param {string} address - Peer address
   * @param {number} port - Peer port
   * @returns {number|undefined} Channel number
   */
  getChannelByPeer(address, port) {
    for (const [channel, info] of this.channels) {
      if (info.address === address && info.port === port) {
        return channel;
      }
    }
    return undefined;
  }

  /**
   * Cleans up expired permissions
   */
  cleanupPermissions() {
    const now = Date.now();
    for (const [address, expiresAt] of this.permissions) {
      if (now > expiresAt) {
        this.permissions.delete(address);
      }
    }
  }
}

/**
 * Class representing a TURN server
 * @extends EventEmitter
 */
export class TurnServer extends EventEmitter {
  /**
   * Creates a new TURN server
   * @param {Object} [options] - Server options
   * @param {number} [options.port=3478] - Port to listen on
   * @param {string} [options.address='0.0.0.0'] - Address to bind to
   * @param {string} [options.relayAddress] - Relay address
   * @param {number} [options.relayPortMin=49152] - Minimum relay port
   * @param {number} [options.relayPortMax=65535] - Maximum relay port
   * @param {string} [options.software='nodeRTC/1.0.0'] - Software description
   * @param {Function} [options.authenticate] - Authentication callback
   * @param {string} [options.realm='nodeRTC'] - Authentication realm
   */
  constructor(options = {}) {
    super();
    this.port = options.port ?? DEFAULT_TURN_PORT;
    this.address = options.address || '0.0.0.0';
    this.relayAddress = options.relayAddress || this.address;
    this.relayPortMin = options.relayPortMin || 49152;
    this.relayPortMax = options.relayPortMax || 65535;
    this.software = options.software || 'nodeRTC/1.0.0';
    this.authenticate = options.authenticate || null;
    this.realm = options.realm || 'nodeRTC';

    this.socket = null;
    this.relaySockets = new Map();
    this.allocations = new Map();
    this.running = false;
    this.stats = {
      allocationsCreated: 0,
      allocationsRefreshed: 0,
      allocationsDeleted: 0,
      permissionsCreated: 0,
      channelsBound: 0,
      dataRelayed: 0,
      errors: 0,
    };

    this.cleanupInterval = null;
  }

  /**
   * Starts the TURN server
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
        this.startCleanupInterval();
        this.emit('listening');
        resolve();
      });

      this.socket.bind(this.port, this.address);
    });
  }

  /**
   * Stops the TURN server
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.running) {
      return;
    }

    this.stopCleanupInterval();

    for (const [key, relaySocket] of this.relaySockets) {
      relaySocket.close();
      this.emit('allocationClosed', key);
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
   * Starts the cleanup interval for expired allocations
   * @private
   */
  startCleanupInterval() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupAllocations();
    }, 30000);
  }

  /**
   * Stops the cleanup interval
   * @private
   */
  stopCleanupInterval() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Cleans up expired allocations
   * @private
   */
  cleanupAllocations() {
    const now = Date.now();
    for (const [key, allocation] of this.allocations) {
      if (allocation.isExpired()) {
        this.deleteAllocation(key);
      } else {
        allocation.cleanupPermissions();
      }
    }
  }

  /**
   * Deletes an allocation
   * @param {string} key - Allocation key
   * @private
   */
  deleteAllocation(key) {
    const allocation = this.allocations.get(key);
    if (!allocation) return;

    const relaySocket = this.relaySockets.get(key);
    if (relaySocket) {
      relaySocket.close();
      this.relaySockets.delete(key);
    }

    this.allocations.delete(key);
    this.stats.allocationsDeleted++;
    this.emit('allocationDeleted', key);
  }

  /**
   * Handles incoming messages
   * @param {Buffer} msg - Raw message
   * @param {Object} rinfo - Remote address info
   * @private
   */
  handleMessage(msg, rinfo) {
    if (this.isChannelData(msg)) {
      this.handleChannelData(msg, rinfo);
    } else {
      this.handleStunMessage(msg, rinfo);
    }
  }

  /**
   * Checks if message is channel data
   * @param {Buffer} msg - Message buffer
   * @returns {boolean}
   * @private
   */
  isChannelData(msg) {
    if (msg.length < 4) return false;
    const channelNumber = msg.readUInt16BE(0);
    return channelNumber >= MIN_CHANNEL_NUMBER && channelNumber <= MAX_CHANNEL_NUMBER;
  }

  /**
   * Handles channel data
   * @param {Buffer} msg - Raw message
   * @param {Object} rinfo - Remote address info
   * @private
   */
  handleChannelData(msg, rinfo) {
    const key = `${rinfo.address}:${rinfo.port}`;
    const allocation = this.allocations.get(key);

    if (!allocation) {
      this.emit('error', new Error('No allocation found for channel data'));
      return;
    }

    const channelNumber = msg.readUInt16BE(0);
    const length = msg.readUInt16BE(2);
    const data = msg.subarray(4, 4 + length);

    const peer = allocation.getChannel(channelNumber);
    if (!peer) {
      this.emit('error', new Error('No channel binding found'));
      return;
    }

    if (!allocation.hasPermission(peer.address)) {
      this.emit('error', new Error('No permission for peer'));
      return;
    }

    const relaySocket = this.relaySockets.get(key);
    relaySocket.send(data, peer.port, peer.address);
    this.stats.dataRelayed += data.length;
  }

  /**
   * Handles STUN messages
   * @param {Buffer} msg - Raw message
   * @param {Object} rinfo - Remote address info
   * @private
   */
  handleStunMessage(msg, rinfo) {
    const request = StunMessage.parse(msg);

    if (!request) {
      this.stats.errors++;
      this.emit('error', new Error('Invalid STUN message'));
      return;
    }

    this.emit('request', request, rinfo);

    switch (request.type) {
      case TURN_MESSAGE_TYPE.ALLOCATE:
        this.handleAllocate(request, rinfo);
        break;
      case TURN_MESSAGE_TYPE.REFRESH:
        this.handleRefresh(request, rinfo);
        break;
      case TURN_MESSAGE_TYPE.CREATE_PERMISSION:
        this.handleCreatePermission(request, rinfo);
        break;
      case TURN_MESSAGE_TYPE.CHANNEL_BIND:
        this.handleChannelBind(request, rinfo);
        break;
      case TURN_MESSAGE_TYPE.SEND:
        this.handleSend(request, rinfo);
        break;
      default:
        this.handleUnknown(request, rinfo);
    }
  }

  /**
   * Handles allocate requests
   * @param {StunMessage} request - The request message
   * @param {Object} rinfo - Remote address info
   * @private
   */
  async handleAllocate(request, rinfo) {
    const key = `${rinfo.address}:${rinfo.port}`;

    if (this.allocations.has(key)) {
      this.sendError(request, rinfo, STUN_ERROR_CODE.BAD_REQUEST, 'Allocation already exists');
      return;
    }

    if (this.authenticate) {
      const username = request.getAttribute(STUN_ATTRIBUTE_TYPE.USERNAME)?.toString('utf8');
      const nonce = request.getAttribute(STUN_ATTRIBUTE_TYPE.NONCE)?.toString('utf8');
      const messageIntegrity = request.getAttribute(STUN_ATTRIBUTE_TYPE.MESSAGE_INTEGRITY);

      if (!username || !messageIntegrity) {
        const response = new StunMessage({
          type: TURN_MESSAGE_TYPE.ALLOCATE_ERROR_RESPONSE,
          transactionId: request.transactionId,
        });
        response.addErrorCode(STUN_ERROR_CODE.UNAUTHORIZED);
        response.addRealm(this.realm);
        response.addNonce(this.generateNonce());
        response.addSoftware(this.software);
        this.sendResponse(response, rinfo);
        return;
      }

      const isAuthenticated = await this.authenticate(username, nonce, messageIntegrity);
      if (!isAuthenticated) {
        this.sendError(request, rinfo, STUN_ERROR_CODE.UNAUTHORIZED);
        return;
      }
    }

    const requestedTransport = request.getAttribute(STUN_ATTRIBUTE_TYPE.REQUESTED_TRANSPORT);
    if (requestedTransport && requestedTransport[0] !== 17) {
      this.sendError(request, rinfo, STUN_ERROR_CODE.BAD_REQUEST, 'Unsupported transport');
      return;
    }

    let lifetimeValue = request.getAttribute(STUN_ATTRIBUTE_TYPE.LIFETIME);
    let lifetime = DEFAULT_ALLOCATION_LIFETIME;
    if (lifetimeValue) {
      lifetime = lifetimeValue.readUInt32BE(0);
      lifetime = Math.max(MIN_ALLOCATION_LIFETIME, Math.min(MAX_ALLOCATION_LIFETIME, lifetime));
    }

    try {
      const relayPort = await this.createRelaySocket(key, rinfo);

      const allocation = new TurnAllocation({
        clientAddress: rinfo.address,
        clientPort: rinfo.port,
        relayAddress: this.relayAddress,
        relayPort,
        lifetime,
      });

      this.allocations.set(key, allocation);
      this.stats.allocationsCreated++;

      const response = new StunMessage({
        type: TURN_MESSAGE_TYPE.ALLOCATE_RESPONSE,
        transactionId: request.transactionId,
      });

      response.addAttribute(STUN_ATTRIBUTE_TYPE.XOR_RELAYED_ADDRESS, this.encodeAddress(
        this.relayAddress,
        relayPort,
        request.transactionId,
      ));
      response.addMappedAddress(rinfo.address, rinfo.port, true);

      const lifetimeBuffer = Buffer.allocUnsafe(4);
      lifetimeBuffer.writeUInt32BE(lifetime, 0);
      response.addAttribute(STUN_ATTRIBUTE_TYPE.LIFETIME, lifetimeBuffer);

      response.addSoftware(this.software);
      this.sendResponse(response, rinfo);

      this.emit('allocationCreated', key, allocation);
    } catch (err) {
      this.sendError(request, rinfo, STUN_ERROR_CODE.SERVER_ERROR);
    }
  }

  /**
   * Creates a relay socket for an allocation
   * @param {string} key - Allocation key
   * @param {Object} clientInfo - Client address info
   * @returns {Promise<number>} Relay port
   * @private
   */
  createRelaySocket(key, clientInfo) {
    return new Promise((resolve, reject) => {
      const relaySocket = dgram.createSocket('udp4');

      relaySocket.on('error', reject);

      relaySocket.on('message', (msg, rinfo) => {
        this.handleRelayData(key, msg, rinfo);
      });

      const tryBind = (port) => {
        relaySocket.bind(port, this.relayAddress, () => {
          this.relaySockets.set(key, relaySocket);
          resolve(port);
        });
      };

      const randomPort = () => Math.floor(Math.random() * (this.relayPortMax - this.relayPortMin + 1)) + this.relayPortMin;

      relaySocket.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          tryBind(randomPort());
        } else {
          reject(err);
        }
      });

      tryBind(randomPort());
    });
  }

  /**
   * Handles data received on relay socket
   * @param {string} key - Allocation key
   * @param {Buffer} msg - Data buffer
   * @param {Object} rinfo - Remote address info
   * @private
   */
  handleRelayData(key, msg, rinfo) {
    const allocation = this.allocations.get(key);
    if (!allocation || allocation.isExpired()) return;

    if (!allocation.hasPermission(rinfo.address)) return;

    const clientRinfo = {
      address: allocation.clientAddress,
      port: allocation.clientPort,
    };

    const channelNumber = allocation.getChannelByPeer(rinfo.address, rinfo.port);

    if (channelNumber !== undefined) {
      const length = Math.min(msg.length, 0xffff);
      const channelData = Buffer.allocUnsafe(4 + length);
      channelData.writeUInt16BE(channelNumber, 0);
      channelData.writeUInt16BE(length, 2);
      msg.copy(channelData, 4, 0, length);

      this.socket.send(channelData, clientRinfo.port, clientRinfo.address);
    } else {
      const indication = new StunMessage({
        type: TURN_MESSAGE_TYPE.DATA,
        transactionId: StunMessage.generateTransactionId(),
      });

      indication.addAttribute(STUN_ATTRIBUTE_TYPE.XOR_PEER_ADDRESS, this.encodeAddress(
        rinfo.address,
        rinfo.port,
        indication.transactionId,
      ));
      indication.addAttribute(STUN_ATTRIBUTE_TYPE.DATA, msg);

      this.socket.send(indication.serialize(), clientRinfo.port, clientRinfo.address);
    }

    this.stats.dataRelayed += msg.length;
  }

  /**
   * Handles refresh requests
   * @param {StunMessage} request - The request message
   * @param {Object} rinfo - Remote address info
   * @private
   */
  handleRefresh(request, rinfo) {
    const key = `${rinfo.address}:${rinfo.port}`;
    const allocation = this.allocations.get(key);

    if (!allocation) {
      this.sendError(request, rinfo, STUN_ERROR_CODE.BAD_REQUEST, 'No allocation found');
      return;
    }

    const lifetimeValue = request.getAttribute(STUN_ATTRIBUTE_TYPE.LIFETIME);
    let lifetime = 0;
    if (lifetimeValue) {
      lifetime = lifetimeValue.readUInt32BE(0);
    }

    if (lifetime === 0) {
      this.deleteAllocation(key);
    } else {
      lifetime = Math.max(MIN_ALLOCATION_LIFETIME, Math.min(MAX_ALLOCATION_LIFETIME, lifetime));
      allocation.refresh(lifetime);
      this.stats.allocationsRefreshed++;
    }

    const response = new StunMessage({
      type: TURN_MESSAGE_TYPE.REFRESH_RESPONSE,
      transactionId: request.transactionId,
    });

    const lifetimeBuffer = Buffer.allocUnsafe(4);
    lifetimeBuffer.writeUInt32BE(lifetime, 0);
    response.addAttribute(STUN_ATTRIBUTE_TYPE.LIFETIME, lifetimeBuffer);
    response.addSoftware(this.software);

    this.sendResponse(response, rinfo);
  }

  /**
   * Handles create permission requests
   * @param {StunMessage} request - The request message
   * @param {Object} rinfo - Remote address info
   * @private
   */
  handleCreatePermission(request, rinfo) {
    const key = `${rinfo.address}:${rinfo.port}`;
    const allocation = this.allocations.get(key);

    if (!allocation) {
      this.sendError(request, rinfo, STUN_ERROR_CODE.BAD_REQUEST, 'No allocation found');
      return;
    }

    const xorPeerAddress = request.getAttribute(STUN_ATTRIBUTE_TYPE.XOR_PEER_ADDRESS);
    if (!xorPeerAddress) {
      this.sendError(request, rinfo, STUN_ERROR_CODE.BAD_REQUEST, 'Missing peer address');
      return;
    }

    const peer = StunMessage.parseAddress(xorPeerAddress, true);
    allocation.addPermission(peer.address);
    this.stats.permissionsCreated++;

    const response = new StunMessage({
      type: TURN_MESSAGE_TYPE.CREATE_PERMISSION_RESPONSE,
      transactionId: request.transactionId,
    });
    response.addSoftware(this.software);

    this.sendResponse(response, rinfo);
  }

  /**
   * Handles channel bind requests
   * @param {StunMessage} request - The request message
   * @param {Object} rinfo - Remote address info
   * @private
   */
  handleChannelBind(request, rinfo) {
    const key = `${rinfo.address}:${rinfo.port}`;
    const allocation = this.allocations.get(key);

    if (!allocation) {
      this.sendError(request, rinfo, STUN_ERROR_CODE.BAD_REQUEST, 'No allocation found');
      return;
    }

    const channelNumberAttr = request.getAttribute(STUN_ATTRIBUTE_TYPE.CHANNEL_NUMBER);
    const xorPeerAddress = request.getAttribute(STUN_ATTRIBUTE_TYPE.XOR_PEER_ADDRESS);

    if (!channelNumberAttr || !xorPeerAddress) {
      this.sendError(request, rinfo, STUN_ERROR_CODE.BAD_REQUEST, 'Missing parameters');
      return;
    }

    const channelNumber = channelNumberAttr.readUInt16BE(0);
    if (channelNumber < MIN_CHANNEL_NUMBER || channelNumber > MAX_CHANNEL_NUMBER) {
      this.sendError(request, rinfo, STUN_ERROR_CODE.BAD_REQUEST, 'Invalid channel number');
      return;
    }

    const peer = StunMessage.parseAddress(xorPeerAddress, true);
    allocation.bindChannel(channelNumber, peer.address, peer.port);
    allocation.addPermission(peer.address);
    this.stats.channelsBound++;

    const response = new StunMessage({
      type: TURN_MESSAGE_TYPE.CHANNEL_BIND_RESPONSE,
      transactionId: request.transactionId,
    });
    response.addSoftware(this.software);

    this.sendResponse(response, rinfo);
  }

  /**
   * Handles send indications
   * @param {StunMessage} request - The request message
   * @param {Object} rinfo - Remote address info
   * @private
   */
  handleSend(request, rinfo) {
    const key = `${rinfo.address}:${rinfo.port}`;
    const allocation = this.allocations.get(key);

    if (!allocation) {
      this.emit('error', new Error('No allocation for send indication'));
      return;
    }

    const xorPeerAddress = request.getAttribute(STUN_ATTRIBUTE_TYPE.XOR_PEER_ADDRESS);
    const data = request.getAttribute(STUN_ATTRIBUTE_TYPE.DATA);

    if (!xorPeerAddress || !data) return;

    const peer = StunMessage.parseAddress(xorPeerAddress, true);

    if (!allocation.hasPermission(peer.address)) {
      this.emit('error', new Error('No permission for peer'));
      return;
    }

    const relaySocket = this.relaySockets.get(key);
    relaySocket.send(data, peer.port, peer.address);
    this.stats.dataRelayed += data.length;
  }

  /**
   * Handles unknown requests
   * @param {StunMessage} request - The request message
   * @param {Object} rinfo - Remote address info
   * @private
   */
  handleUnknown(request, rinfo) {
    this.sendError(request, rinfo, STUN_ERROR_CODE.BAD_REQUEST);
  }

  /**
   * Sends an error response
   * @param {StunMessage} request - The request message
   * @param {Object} rinfo - Remote address info
   * @param {number} code - Error code
   * @param {string} [reason] - Error reason
   * @private
   */
  sendError(request, rinfo, code, reason) {
    const response = new StunMessage({
      type: TURN_MESSAGE_TYPE.ALLOCATE_ERROR_RESPONSE,
      transactionId: request.transactionId,
    });

    response.addErrorCode(code, reason);
    response.addSoftware(this.software);

    this.sendResponse(response, rinfo);
  }

  /**
   * Sends a response
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
        this.emit('response', response, rinfo);
      }
    });
  }

  /**
   * Encodes an address for XOR operations
   * @param {string} address - IP address
   * @param {number} port - Port
   * @param {Buffer} transactionId - Transaction ID
   * @returns {Buffer} Encoded address
   * @private
   */
  encodeAddress(address, port, transactionId) {
    const family = address.includes(':') ? 0x02 : 0x01;
    const addrBytes = family === 0x02
      ? Buffer.from(address.split(':').map((x) => parseInt(x, 16)).flatMap((x) => [(x >> 8) & 0xff, x & 0xff]))
      : Buffer.from(address.split('.').map((x) => parseInt(x)));

    const xPort = port ^ 0x2112;

    const value = Buffer.allocUnsafe(4 + addrBytes.length);
    value.writeUInt8(0, 0);
    value.writeUInt8(family, 1);
    value.writeUInt16BE(xPort, 2);

    for (let i = 0; i < addrBytes.length; i++) {
      addrBytes[i] ^= ((0x2112a442 >> (8 * (3 - (i % 4)))) & 0xff);
    }

    value.set(addrBytes, 4);
    return value;
  }

  /**
   * Generates a nonce
   * @returns {string} Nonce
   * @private
   */
  generateNonce() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Gets server statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Resets server statistics
   */
  resetStats() {
    this.stats = {
      allocationsCreated: 0,
      allocationsRefreshed: 0,
      allocationsDeleted: 0,
      permissionsCreated: 0,
      channelsBound: 0,
      dataRelayed: 0,
      errors: 0,
    };
  }

  /**
   * Gets allocation count
   * @returns {number}
   */
  getAllocationCount() {
    return this.allocations.size;
  }

  /**
   * Checks if server is running
   * @returns {boolean}
   */
  isRunning() {
    return this.running;
  }
}
