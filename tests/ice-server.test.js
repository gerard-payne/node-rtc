/**
 * @fileoverview Tests for IceServer class
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { IceServer, IceCandidate } from '../src/ice-server.js';
import { ICE_CANDIDATE_TYPE } from '../src/constants.js';

describe('IceCandidate', () => {
  describe('Constructor', () => {
    it('should create candidate with required parameters', () => {
      const candidate = new IceCandidate({
        foundation: '1',
        component: 1,
        protocol: 'udp',
        priority: 100,
        address: '192.168.1.1',
        port: 12345,
        type: ICE_CANDIDATE_TYPE.HOST,
      });

      assert.strictEqual(candidate.foundation, '1');
      assert.strictEqual(candidate.component, 1);
      assert.strictEqual(candidate.protocol, 'udp');
      assert.strictEqual(candidate.priority, 100);
      assert.strictEqual(candidate.address, '192.168.1.1');
      assert.strictEqual(candidate.port, 12345);
      assert.strictEqual(candidate.type, ICE_CANDIDATE_TYPE.HOST);
    });

    it('should create candidate with optional parameters', () => {
      const candidate = new IceCandidate({
        foundation: '1',
        component: 1,
        protocol: 'udp',
        priority: 100,
        address: '8.8.8.8',
        port: 12345,
        type: ICE_CANDIDATE_TYPE.SRFLX,
        relatedAddress: '192.168.1.1',
        relatedPort: 54321,
      });

      assert.strictEqual(candidate.relatedAddress, '192.168.1.1');
      assert.strictEqual(candidate.relatedPort, 54321);
    });
  });

  describe('toSdp', () => {
    it('should convert host candidate to SDP', () => {
      const candidate = new IceCandidate({
        foundation: '1',
        component: 1,
        protocol: 'udp',
        priority: 2122260223,
        address: '192.168.1.1',
        port: 12345,
        type: ICE_CANDIDATE_TYPE.HOST,
      });

      const sdp = candidate.toSdp();
      assert.ok(sdp.includes('candidate:1'));
      assert.ok(sdp.includes('udp'));
      assert.ok(sdp.includes('192.168.1.1'));
      assert.ok(sdp.includes('12345'));
      assert.ok(sdp.includes('typ host'));
    });

    it('should convert srflx candidate to SDP with raddr/rport', () => {
      const candidate = new IceCandidate({
        foundation: '2',
        component: 1,
        protocol: 'udp',
        priority: 100,
        address: '8.8.8.8',
        port: 12345,
        type: ICE_CANDIDATE_TYPE.SRFLX,
        relatedAddress: '192.168.1.1',
        relatedPort: 54321,
      });

      const sdp = candidate.toSdp();
      assert.ok(sdp.includes('typ srflx'));
      assert.ok(sdp.includes('raddr 192.168.1.1'));
      assert.ok(sdp.includes('rport 54321'));
    });
  });

  describe('fromSdp', () => {
    it('should parse host candidate from SDP', () => {
      const sdp = 'candidate:1 1 udp 2122260223 192.168.1.1 12345 typ host';
      const candidate = IceCandidate.fromSdp(sdp);

      assert.ok(candidate);
      assert.strictEqual(candidate.foundation, '1');
      assert.strictEqual(candidate.component, 1);
      assert.strictEqual(candidate.protocol, 'udp');
      assert.strictEqual(candidate.priority, 2122260223);
      assert.strictEqual(candidate.address, '192.168.1.1');
      assert.strictEqual(candidate.port, 12345);
      assert.strictEqual(candidate.type, 'host');
    });

    it('should parse srflx candidate from SDP', () => {
      const sdp = 'candidate:2 1 udp 100 8.8.8.8 12345 typ srflx raddr 192.168.1.1 rport 54321';
      const candidate = IceCandidate.fromSdp(sdp);

      assert.ok(candidate);
      assert.strictEqual(candidate.type, 'srflx');
      assert.strictEqual(candidate.relatedAddress, '192.168.1.1');
      assert.strictEqual(candidate.relatedPort, 54321);
    });

    it('should return null for invalid SDP', () => {
      const candidate = IceCandidate.fromSdp('invalid');
      assert.strictEqual(candidate, null);
    });
  });
});

describe('IceServer', () => {
  describe('Constructor', () => {
    it('should create server with default options', () => {
      const server = new IceServer();
      assert.ok(server.stunServers.length > 0);
      assert.strictEqual(server.gatherHostCandidates, true);
      assert.strictEqual(server.gatherSrflxCandidates, true);
      assert.strictEqual(server.gatherRelayCandidates, true);
    });

    it('should create server with custom options', () => {
      const server = new IceServer({
        stunServers: ['stun:custom:1234'],
        gatherHostCandidates: false,
        gatherTimeout: 10000,
      });

      assert.deepStrictEqual(server.stunServers, ['stun:custom:1234']);
      assert.strictEqual(server.gatherHostCandidates, false);
      assert.strictEqual(server.gatherTimeout, 10000);
    });
  });

  describe('parseServerUrl', () => {
    it('should parse STUN URL with port', () => {
      const server = new IceServer();
      const result = server.parseServerUrl('stun:stun.l.google.com:19302');

      assert.strictEqual(result.address, 'stun.l.google.com');
      assert.strictEqual(result.port, 19302);
    });

    it('should parse STUN URL without port', () => {
      const server = new IceServer();
      const result = server.parseServerUrl('stun:stun.example.com');

      assert.strictEqual(result.address, 'stun.example.com');
      assert.strictEqual(result.port, 3478);
    });

    it('should parse TURNS URL', () => {
      const server = new IceServer();
      const result = server.parseServerUrl('turns:turn.example.com:5349');

      assert.strictEqual(result.address, 'turn.example.com');
      assert.strictEqual(result.port, 5349);
    });

    it('should throw for invalid URL', () => {
      const server = new IceServer();
      assert.throws(() => {
        server.parseServerUrl('invalid');
      }, /Invalid server URL/);
    });
  });

  describe('calculatePriority', () => {
    it('should calculate host priority correctly', () => {
      const server = new IceServer();
      const priority = server.calculatePriority(ICE_CANDIDATE_TYPE.HOST, 1);

      assert.ok(priority > 0);
      const expectedPriority = (2 ** 24) * 126 + (2 ** 8) * 1 + (2 ** 0) * 255;
      assert.strictEqual(priority, expectedPriority);
    });

    it('should calculate srflx priority correctly', () => {
      const server = new IceServer();
      const priority = server.calculatePriority(ICE_CANDIDATE_TYPE.SRFLX, 1);

      const expectedPriority = (2 ** 24) * 100 + (2 ** 8) * 1 + (2 ** 0) * 255;
      assert.strictEqual(priority, expectedPriority);
    });
  });

  describe('getCandidates and clearCandidates', () => {
    it('should return empty array initially', () => {
      const server = new IceServer();
      const candidates = server.getCandidates();
      assert.deepStrictEqual(candidates, []);
    });

    it('should clear candidates', () => {
      const server = new IceServer();
      server.candidates.set('test', { type: 'host' });
      server.clearCandidates();

      assert.strictEqual(server.getCandidates().length, 0);
    });
  });

  describe('getCandidatesByType', () => {
    it('should filter candidates by type', () => {
      const server = new IceServer();

      server.candidates.set('host1', new IceCandidate({
        foundation: '1',
        component: 1,
        protocol: 'udp',
        priority: 100,
        address: '192.168.1.1',
        port: 12345,
        type: ICE_CANDIDATE_TYPE.HOST,
      }));

      server.candidates.set('srflx1', new IceCandidate({
        foundation: '2',
        component: 1,
        protocol: 'udp',
        priority: 50,
        address: '8.8.8.8',
        port: 12345,
        type: ICE_CANDIDATE_TYPE.SRFLX,
      }));

      const hostCandidates = server.getCandidatesByType(ICE_CANDIDATE_TYPE.HOST);
      assert.strictEqual(hostCandidates.length, 1);
      assert.strictEqual(hostCandidates[0].type, ICE_CANDIDATE_TYPE.HOST);
    });
  });

  describe('isGathering', () => {
    it('should return false initially', () => {
      const server = new IceServer();
      assert.strictEqual(server.isGathering(), false);
    });
  });

  describe('stop', () => {
    it('should stop gathering', () => {
      const server = new IceServer();
      server.gathering = true;
      server.stop();
      assert.strictEqual(server.isGathering(), false);
    });
  });

  describe('selectCandidatePair', () => {
    it('should select highest priority pair', () => {
      const localCandidates = [
        new IceCandidate({
          foundation: '1',
          component: 1,
          protocol: 'udp',
          priority: 100,
          address: '192.168.1.1',
          port: 12345,
          type: ICE_CANDIDATE_TYPE.HOST,
        }),
        new IceCandidate({
          foundation: '2',
          component: 1,
          protocol: 'udp',
          priority: 200,
          address: '10.0.0.1',
          port: 12345,
          type: ICE_CANDIDATE_TYPE.HOST,
        }),
      ];

      const remoteCandidates = [
        new IceCandidate({
          foundation: '1',
          component: 1,
          protocol: 'udp',
          priority: 150,
          address: '192.168.2.1',
          port: 54321,
          type: ICE_CANDIDATE_TYPE.HOST,
        }),
      ];

      const pair = IceServer.selectCandidatePair(localCandidates, remoteCandidates);

      assert.ok(pair);
      assert.strictEqual(pair.local.priority, 200);
      assert.strictEqual(pair.remote.priority, 150);
    });

    it('should return null for empty candidates', () => {
      const pair = IceServer.selectCandidatePair([], []);
      assert.strictEqual(pair, null);
    });
  });
});
