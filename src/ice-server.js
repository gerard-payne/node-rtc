/**
 * ICE server implementation for candidate gathering
 * @module ice-server
 * @description ICE (Interactive Connectivity Establishment) per RFC 5245.
 * Gathers multiple candidate types (host, srflx, relay) to establish
 * peer-to-peer connections through NATs and firewalls. Foundation of WebRTC connectivity.
 */

import { EventEmitter } from 'events';
import dgram from 'dgram';
import os from 'os';
import { StunMessage } from './stun-message.js';
import {
  STUN_MESSAGE_TYPE,
  STUN_ATTRIBUTE_TYPE,
  ICE_CANDIDATE_TYPE,
  STUN_MAGIC_COOKIE,
} from './constants.js';

/**
 * Class representing an ICE candidate
 * @description ICE candidates represent potential connection endpoints.
 * Foundation groups candidates from the same network interface. Priority
 * determines candidate pair ordering during connectivity checks.
 * Component 1 = RTP, Component 2 = RTCP (legacy, now typically multiplexed).
 */
export class IceCandidate {
  /**
   * Creates a new ICE candidate
   * @param {Object} options - Candidate options
   * @param {string} options.foundation - Foundation identifier
   * @param {number} options.component - Component ID (1 for RTP, 2 for RTCP)
   * @param {string} options.protocol - Transport protocol
   * @param {number} options.priority - Candidate priority
   * @param {string} options.address - IP address
   * @param {number} options.port - Port number
   * @param {string} options.type - Candidate type (host, srflx, prflx, relay)
   * @param {string} [options.relatedAddress] - Related address for reflexive candidates
   * @param {number} [options.relatedPort] - Related port for reflexive candidates
   * @param {string} [options.tcptype] - TCP type (active, passive, so)
   */
  constructor({
    foundation,
    component,
    protocol,
    priority,
    address,
    port,
    type,
    relatedAddress = null,
    relatedPort = null,
    tcptype = null,
  }) {
    this.foundation = foundation;
    this.component = component;
    this.protocol = protocol;
    this.priority = priority;
    this.address = address;
    this.port = port;
    this.type = type;
    this.relatedAddress = relatedAddress;
    this.relatedPort = relatedPort;
    this.tcptype = tcptype;
  }

  /**
   * Converts candidate to SDP string format
   * @returns {string} SDP candidate string
   * @description Generates standard a=candidate lines per RFC 5245 Section 15.1.
   * Used in SDP offer/answer exchange during WebRTC signaling phase.
   * Format: foundation component transport priority ip port typ type [raddr ... rport ...]
   */
  toSdp() {
    let sdp = `candidate:${this.foundation} ${this.component} ${this.protocol} ${this.priority} ${this.address} ${this.port} typ ${this.type}`;

    if (this.relatedAddress) {
      sdp += ` raddr ${this.relatedAddress} rport ${this.relatedPort}`;
    }

    if (this.tcptype) {
      sdp += ` tcptype ${this.tcptype}`;
    }

    return sdp;
  }

  /**
   * Parses an SDP candidate string
   * @param {string} sdp - SDP candidate string
   * @returns {IceCandidate|null} Parsed candidate or null
   * @description Parses a=candidate lines from remote peer's SDP.
   * Returns null for invalid SDP to allow graceful handling of malformed
   * input during signaling (common with third-party clients).
   */
  static fromSdp(sdp) {
    const match = sdp.match(/candidate:([^\s]+) (\d+) ([^\s]+) (\d+) ([^\s]+) (\d+) typ ([^\s]+)(?: raddr ([^\s]+))?(?: rport (\d+))?(?: tcptype ([^\s]+))?/);

    if (!match) return null;

    return new IceCandidate({
      foundation: match[1],
      component: parseInt(match[2], 10),
      protocol: match[3].toLowerCase(),
      priority: parseInt(match[4], 10),
      address: match[5],
      port: parseInt(match[6], 10),
      type: match[7],
      relatedAddress: match[8] || null,
      relatedPort: match[9] ? parseInt(match[9], 10) : null,
      tcptype: match[10] || null,
    });
  }
}

/**
 * Class representing an ICE server
 * @extends EventEmitter
 */
export class IceServer extends EventEmitter {
  /**
   * Creates a new ICE server
   * @param {param} [options] - Server options
   * @param {string[]} [options.stunServers] - STUN server URLs
   * @param {string[]} [options.turnServers] - TURN server URLs
   * @param {boolean} [options.gatherHostCandidates=true] - Gather host candidates
   * @param {boolean} [options.gatherSrflxCandidates=true] - Gather server reflexive candidates
   * @param {boolean} [options.gatherRelayCandidates=true] - Gather relay candidates
   * @param {number} [options.gatherTimeout=5000] - Candidate gathering timeout
   * @description Gathering sequence: host → srflx → relay. Each type requires
   * the previous (srflx requires host, relay requires srflx). Default 5s timeout
   * balances completeness vs. connection setup latency.
   */
  constructor(options = {}) {
    super();
    this.stunServers = options.stunServers || ['stun:stun.l.google.com:19302'];
    this.turnServers = options.turnServers || [];
    this.gatherHostCandidates = options.gatherHostCandidates !== false;
    this.gatherSrflxCandidates = options.gatherSrflxCandidates !== false;
    this.gatherRelayCandidates = options.gatherRelayCandidates !== false;
    this.gatherTimeout = options.gatherTimeout || 5000;

    this.candidates = new Map();
    this.pendingTransactions = new Map();
    this.sockets = new Map();
    this.gathering = false;
    this.candidateFoundationCounter = 0;
  }

  /**
   * Starts ICE candidate gathering
   * @returns {Promise<IceCandidate[]>} Array of gathered candidates
   */
  async gatherCandidates() {
    if (this.gathering) {
      throw new Error('Already gathering candidates');
    }

    this.gathering = true;
    this.candidates.clear();

    const promises = [];

    if (this.gatherHostCandidates) {
      promises.push(this.gatherHostCandidates_());
    }

    if (this.gatherSrflxCandidates) {
      promises.push(this.gatherSrflxCandidates_());
    }

    await Promise.all(promises);

    this.gathering = false;

    const candidates = Array.from(this.candidates.values());
    this.emit('gatheringComplete', candidates);

    return candidates;
  }

  /**
   * Gathers host candidates from local interfaces
   * @returns {Promise<void>}
   * @private
   */
  async gatherHostCandidates_() {
    const interfaces = os.networkInterfaces();

    for (const [name, addrs] of Object.entries(interfaces)) {
      for (const addr of addrs) {
        if (addr.internal || addr.family !== 'IPv4') continue;

        const foundation = this.getNextFoundation();
        const priority = this.calculatePriority(ICE_CANDIDATE_TYPE.HOST, 1);

        const candidate = new IceCandidate({
          foundation,
          component: 1,
          protocol: 'udp',
          priority,
          address: addr.address,
          port: 0,
          type: ICE_CANDIDATE_TYPE.HOST,
        });

        this.candidates.set(`host-${addr.address}`, candidate);
        this.emit('candidate', candidate);
      }
    }
  }

  /**
   * Gathers server reflexive candidates using STUN
   * @returns {Promise<void>}
   * @private
   */
  async gatherSrflxCandidates_() {
    const promises = this.stunServers.map((serverUrl) => this.queryStunServer(serverUrl));
    await Promise.allSettled(promises);
  }

  /**
   * Queries a STUN server for reflexive address
   * @param {string} serverUrl - STUN server URL
   * @returns {Promise<void>}
   * @private
   */
  async queryStunServer(serverUrl) {
    const { address, port } = this.parseServerUrl(serverUrl);

    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      const transactionId = StunMessage.generateTransactionId();

      const timeout = setTimeout(() => {
        socket.close();
        reject(new Error('STUN query timeout'));
      }, this.gatherTimeout);

      socket.on('message', (msg) => {
        const response = StunMessage.parse(msg);

        if (!response || !response.transactionId.equals(Buffer.from(transactionId))) {
          return;
        }

        clearTimeout(timeout);
        socket.close();

        if (response.type === STUN_MESSAGE_TYPE.BINDING_RESPONSE) {
          const xorMappedAddr = response.getAttribute(STUN_ATTRIBUTE_TYPE.XOR_MAPPED_ADDRESS);

          if (xorMappedAddr) {
            const parsed = StunMessage.parseAddress(xorMappedAddr, true);
            const foundation = this.getNextFoundation();
            const priority = this.calculatePriority(ICE_CANDIDATE_TYPE.SRFLX, 1);

            const candidate = new IceCandidate({
              foundation,
              component: 1,
              protocol: 'udp',
              priority,
              address: parsed.address,
              port: parsed.port,
              type: ICE_CANDIDATE_TYPE.SRFLX,
              relatedAddress: socket.address().address,
              relatedPort: socket.address().port,
            });

            this.candidates.set(`srflx-${parsed.address}`, candidate);
            this.emit('candidate', candidate);
          }

          resolve();
        } else {
          reject(new Error('STUN binding error'));
        }
      });

      socket.on('error', reject);

      socket.bind(() => {
        const request = new StunMessage({
          type: STUN_MESSAGE_TYPE.BINDING_REQUEST,
          transactionId,
        });

        socket.send(request.serialize(), port, address);
      });
    });
  }

  /**
   * Parses a STUN/TURN server URL
   * @param {string} url - Server URL
   * @returns {Object} Parsed address and port
   * @private
   */
  parseServerUrl(url) {
    const match = url.match(/^(stun|turn|stuns|turns):([^:]+)(?::(\d+))?$/);

    if (!match) {
      throw new Error(`Invalid server URL: ${url}`);
    }

    const protocol = match[1];
    const address = match[2];
    const port = parseInt(match[3], 10) || ((protocol === 'stun' || protocol === 'turn') ? 3478 : 5349);

    return { address, port };
  }

  /**
   * Calculates candidate priority per RFC 5245
   * @param {string} type - Candidate type
   * @param {number} localPreference - Local preference value
   * @returns {number} Priority value
   * @private
   * @description Formula: (2^24)*typePreference + (2^8)*localPref + (2^0)*256
   * Type preferences: host=126, srflx=100, prflx=110, relay=0.
   * Higher priority = preferred candidate. Used for controlling/controlled role.
   */
  calculatePriority(type, localPreference) {
    const typePreferences = {
      [ICE_CANDIDATE_TYPE.HOST]: 126,
      [ICE_CANDIDATE_TYPE.PRFLX]: 110,
      [ICE_CANDIDATE_TYPE.SRFLX]: 100,
      [ICE_CANDIDATE_TYPE.RELAY]: 0,
    };

    const typePreference = typePreferences[type] || 0;

    return (2 ** 24) * typePreference +
           (2 ** 8) * localPreference +
           (2 ** 0) * (256 - 1);
  }

  /**
   * Gets the next foundation identifier
   * @returns {string} Foundation identifier
   * @private
   */
  getNextFoundation() {
    return (++this.candidateFoundationCounter).toString();
  }

  /**
   * Gets all gathered candidates
   * @returns {IceCandidate[]} Array of candidates
   */
  getCandidates() {
    return Array.from(this.candidates.values());
  }

  /**
   * Gets candidates by type
   * @param {string} type - Candidate type
   * @returns {IceCandidate[]} Filtered candidates
   */
  getCandidatesByType(type) {
    return this.getCandidates().filter((c) => c.type === type);
  }

  /**
   * Clears all candidates
   */
  clearCandidates() {
    this.candidates.clear();
  }

  /**
   * Stops candidate gathering
   */
  stop() {
    this.gathering = false;

    for (const socket of this.sockets.values()) {
      socket.close();
    }
    this.sockets.clear();

    for (const timeout of this.pendingTransactions.values()) {
      clearTimeout(timeout);
    }
    this.pendingTransactions.clear();
  }

  /**
   * Checks if currently gathering
   * @returns {boolean}
   */
  isGathering() {
    return this.gathering;
  }

  /**
   * Selects the best candidate pair for communication
   * @param {IceCandidate[]} localCandidates - Local candidates
   * @param {IceCandidate[]} remoteCandidates - Remote candidates
   * @returns {Object|null} Best candidate pair or null
   */
  static selectCandidatePair(localCandidates, remoteCandidates) {
    if (!localCandidates.length || !remoteCandidates.length) {
      return null;
    }

    const sortedLocal = [...localCandidates].sort((a, b) => b.priority - a.priority);
    const sortedRemote = [...remoteCandidates].sort((a, b) => b.priority - a.priority);

    return {
      local: sortedLocal[0],
      remote: sortedRemote[0],
    };
  }
}
