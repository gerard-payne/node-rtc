/**
 * ICE Server Demo
 * Demonstrates candidate gathering and SDP generation
 */

import { IceServer, IceCandidate } from '../src/index.js';
import { ICE_CANDIDATE_TYPE } from '../src/constants.js';

console.log('='.repeat(60));
console.log('ICE Server Demo');
console.log('='.repeat(60));
console.log();
console.log('ICE (Interactive Connectivity Establishment)');
console.log('Gathers multiple candidate types to find the best connection path');
console.log();
console.log('Candidate Types (in priority order):');
console.log('  1. host    - Direct local interface connection');
console.log('  2. srflx   - Server reflexive (public IP via STUN)');
console.log('  3. prflx   - Peer reflexive (learned during checks)');
console.log('  4. relay   - TURN relay (last resort, most reliable)');
console.log();

// Demo 1: Static candidate creation and SDP
console.log('Demo 1: ICE Candidate SDP Format');
console.log('-'.repeat(60));

const candidate = new IceCandidate({
  foundation: '1',
  component: 1,
  protocol: 'udp',
  priority: 2122260223,
  address: '192.168.1.100',
  port: 5000,
  type: ICE_CANDIDATE_TYPE.HOST,
});

console.log('Host Candidate:');
console.log(`  Foundation: ${candidate.foundation}`);
console.log(`  Component: ${candidate.component} (RTP)`);
console.log(`  Protocol: ${candidate.protocol}`);
console.log(`  Priority: ${candidate.priority}`);
console.log(`  Address: ${candidate.address}:${candidate.port}`);
console.log(`  Type: ${candidate.type}`);
console.log();
console.log('SDP Format:');
console.log(`  ${candidate.toSdp()}`);
console.log();

// Server reflexive candidate
const srflxCandidate = new IceCandidate({
  foundation: '2',
  component: 1,
  protocol: 'udp',
  priority: 1694498815,
  address: '203.0.113.50', // Public IP
  port: 5001,
  type: ICE_CANDIDATE_TYPE.SRFLX,
  relatedAddress: '192.168.1.100', // Local address
  relatedPort: 5000,
});

console.log('Server Reflexive Candidate:');
console.log(`  Public Address: ${srflxCandidate.address}:${srflxCandidate.port}`);
console.log(`  Local Address: ${srflxCandidate.relatedAddress}:${srflxCandidate.relatedPort}`);
console.log();
console.log('SDP Format:');
console.log(`  ${srflxCandidate.toSdp()}`);
console.log();

// Demo 2: Parse SDP
console.log('Demo 2: Parsing Remote SDP');
console.log('-'.repeat(60));

const remoteSdp = 'candidate:3 1 udp 100 198.51.100.10 6000 typ relay raddr 203.0.113.50 rport 5001';
console.log(`Input: ${remoteSdp}`);

const parsed = IceCandidate.fromSdp(remoteSdp);
if (parsed) {
  console.log('✅ Parsed successfully:');
  console.log(`  Foundation: ${parsed.foundation}`);
  console.log(`  Priority: ${parsed.priority}`);
  console.log(`  Type: ${parsed.type}`);
  console.log(`  Relay Address: ${parsed.address}:${parsed.port}`);
  console.log(`  Server Reflexive: ${parsed.relatedAddress}:${parsed.relatedPort}`);
}
console.log();

// Demo 3: Priority calculation
console.log('Demo 3: Priority Calculation');
console.log('-'.repeat(60));
console.log('Formula: (2^24)*typePreference + (2^8)*localPref + 256');
console.log();

const iceServer = new IceServer();

const priorities = [
  { type: ICE_CANDIDATE_TYPE.HOST, localPref: 65535 },
  { type: ICE_CANDIDATE_TYPE.SRFLX, localPref: 65535 },
  { type: ICE_CANDIDATE_TYPE.PRFLX, localPref: 65535 },
  { type: ICE_CANDIDATE_TYPE.RELAY, localPref: 65535 },
];

console.log('Type preferences: host=126, srflx=100, prflx=110, relay=0');
console.log();

for (const { type, localPref } of priorities) {
  const priority = iceServer.calculatePriority(type, localPref);
  const hex = priority.toString(16).toUpperCase();
  console.log(`  ${type.padEnd(6)}: ${priority.toString().padStart(10)} (0x${hex.padStart(8, '0')})`);
}
console.log();

// Demo 4: Host candidate gathering
console.log('Demo 4: Host Candidate Gathering');
console.log('-'.repeat(60));

const gatherServer = new IceServer({
  stunServers: [], // Skip STUN for this demo
  gatherHostCandidates: true,
  gatherSrflxCandidates: false,
  gatherRelayCandidates: false,
});

console.log('Gathering host candidates (local network interfaces)...');
console.log();

gatherServer.on('candidate', (candidate) => {
  console.log(`✅ Found candidate:`);
  console.log(`   Type: ${candidate.type}`);
  console.log(`   Address: ${candidate.address}:${candidate.port}`);
  console.log(`   Foundation: ${candidate.foundation}`);
  console.log(`   Priority: ${candidate.priority}`);
  console.log();
});

// Manually trigger gathering for demo purposes
await gatherServer.gatherHostCandidates_();

const hostCandidates = gatherServer.getCandidatesByType(ICE_CANDIDATE_TYPE.HOST);
console.log(`Total host candidates found: ${hostCandidates.length}`);
console.log();

// Demo 5: Candidate Pair Selection
console.log('Demo 5: Candidate Pair Selection');
console.log('-'.repeat(60));

const localCandidates = [
  new IceCandidate({
    foundation: '1',
    component: 1,
    protocol: 'udp',
    priority: 2122260223,
    address: '192.168.1.100',
    port: 5000,
    type: ICE_CANDIDATE_TYPE.HOST,
  }),
  new IceCandidate({
    foundation: '2',
    component: 1,
    protocol: 'udp',
    priority: 1694498815,
    address: '203.0.113.50',
    port: 5001,
    type: ICE_CANDIDATE_TYPE.SRFLX,
  }),
];

const remoteCandidates = [
  new IceCandidate({
    foundation: '1',
    component: 1,
    protocol: 'udp',
    priority: 2130706431,
    address: '10.0.0.5',
    port: 6000,
    type: ICE_CANDIDATE_TYPE.HOST,
  }),
  new IceCandidate({
    foundation: '3',
    component: 1,
    protocol: 'udp',
    priority: 100,
    address: '198.51.100.20',
    port: 7000,
    type: ICE_CANDIDATE_TYPE.RELAY,
  }),
];

console.log('Local candidates:');
localCandidates.forEach(c => console.log(`  ${c.type.padEnd(6)} ${c.address}:${c.port} (prio: ${c.priority})`));
console.log();

console.log('Remote candidates:');
remoteCandidates.forEach(c => console.log(`  ${c.type.padEnd(6)} ${c.address}:${c.port} (prio: ${c.priority})`));
console.log();

const pair = IceServer.selectCandidatePair(localCandidates, remoteCandidates);
console.log('Selected pair (highest priority):');
console.log(`  Local:  ${pair.local.type} ${pair.local.address}:${pair.local.port}`);
console.log(`  Remote: ${pair.remote.type} ${pair.remote.address}:${pair.remote.port}`);
console.log();

console.log('='.repeat(60));
console.log('ICE Demo Complete');
console.log('='.repeat(60));
console.log();
console.log('ICE connectivity checks would now be performed on the selected');
console.log('candidate pairs to determine which path actually works.');
