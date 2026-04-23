/**
 * STUN/TURN/ICE protocol constants
 * @module constants
 * @description Centralized constants ensure protocol compliance across all modules.
 * Using named constants instead of magic numbers prevents errors and makes the
 * code self-documenting per RFC 5389, 5766, and 5245 specifications.
 */

/**
 * STUN message types as defined in RFC 5389
 * @enum {number}
 */
export const STUN_MESSAGE_TYPE = {
  /** Binding request */
  BINDING_REQUEST: 0x0001,
  /** Binding response */
  BINDING_RESPONSE: 0x0101,
  /** Binding error response */
  BINDING_ERROR_RESPONSE: 0x0111,
  /** Shared secret request (deprecated) */
  SHARED_SECRET_REQUEST: 0x0002,
  /** Shared secret response (deprecated) */
  SHARED_SECRET_RESPONSE: 0x0102,
  /** Shared secret error response (deprecated) */
  SHARED_SECRET_ERROR_RESPONSE: 0x0112,
};

/**
 * TURN message types as defined in RFC 5766
 * @enum {number}
 */
export const TURN_MESSAGE_TYPE = {
  /** Allocate request */
  ALLOCATE: 0x0003,
  /** Allocate response */
  ALLOCATE_RESPONSE: 0x0103,
  /** Allocate error response */
  ALLOCATE_ERROR_RESPONSE: 0x0113,
  /** Refresh request */
  REFRESH: 0x0004,
  /** Refresh response */
  REFRESH_RESPONSE: 0x0104,
  /** Refresh error response */
  REFRESH_ERROR_RESPONSE: 0x0114,
  /** Send indication */
  SEND: 0x0006,
  /** Data indication */
  DATA: 0x0007,
  /** CreatePermission request */
  CREATE_PERMISSION: 0x0008,
  /** CreatePermission response */
  CREATE_PERMISSION_RESPONSE: 0x0108,
  /** CreatePermission error response */
  CREATE_PERMISSION_ERROR_RESPONSE: 0x0118,
  /** ChannelBind request */
  CHANNEL_BIND: 0x0009,
  /** ChannelBind response */
  CHANNEL_BIND_RESPONSE: 0x0109,
  /** ChannelBind error response */
  CHANNEL_BIND_ERROR_RESPONSE: 0x0119,
};

/**
 * STUN attribute types as defined in RFC 5389 and RFC 5766
 * @enum {number}
 */
export const STUN_ATTRIBUTE_TYPE = {
  /** Mapped address */
  MAPPED_ADDRESS: 0x0001,
  /** Response address (deprecated) */
  RESPONSE_ADDRESS: 0x0002,
  /** Change address (deprecated) */
  CHANGE_ADDRESS: 0x0003,
  /** Source address (deprecated) */
  SOURCE_ADDRESS: 0x0004,
  /** Changed address (deprecated) */
  CHANGED_ADDRESS: 0x0005,
  /** Username */
  USERNAME: 0x0006,
  /** Password (deprecated) */
  PASSWORD: 0x0007,
  /** Message integrity */
  MESSAGE_INTEGRITY: 0x0008,
  /** Error code */
  ERROR_CODE: 0x0009,
  /** Unknown attributes */
  UNKNOWN_ATTRIBUTES: 0x000a,
  /** Reflected from (deprecated) */
  REFLECTED_FROM: 0x000b,
  /** Realm */
  REALM: 0x0014,
  /** Nonce */
  NONCE: 0x0015,
  /** XOR mapped address */
  XOR_MAPPED_ADDRESS: 0x0020,
  /** Software */
  SOFTWARE: 0x8022,
  /** Alternate server */
  ALTERNATE_SERVER: 0x8023,
  /** Fingerprint */
  FINGERPRINT: 0x8028,
  /** XOR relayed address (TURN) */
  XOR_RELAYED_ADDRESS: 0x0016,
  /** XOR peer address (TURN) */
  XOR_PEER_ADDRESS: 0x0012,
  /** Lifetime (TURN) */
  LIFETIME: 0x000d,
  /** Data (TURN) */
  DATA: 0x0013,
  /** Channel number (TURN) */
  CHANNEL_NUMBER: 0x000c,
  /** Requested transport (TURN) */
  REQUESTED_TRANSPORT: 0x0019,
  /** Even port (TURN) */
  EVEN_PORT: 0x0018,
  /** Reservation token (TURN) */
  RESERVATION_TOKEN: 0x0022,
  /** Priority (ICE) */
  PRIORITY: 0x0024,
  /** Use candidate (ICE) */
  USE_CANDIDATE: 0x0025,
  /** ICE controlled */
  ICE_CONTROLLED: 0x8029,
  /** ICE controlling */
  ICE_CONTROLLING: 0x802a,
};

/**
 * STUN error codes
 * @enum {number}
 */
export const STUN_ERROR_CODE = {
  /** Bad request */
  BAD_REQUEST: 400,
  /** Unauthorized */
  UNAUTHORIZED: 401,
  /** Unknown attribute */
  UNKNOWN_ATTRIBUTE: 420,
  /** Stale nonce */
  STALE_NONCE: 438,
  /** Server error */
  SERVER_ERROR: 500,
  /** Insufficient capacity */
  INSUFFICIENT_CAPACITY: 508,
};

/**
 * STUN error code reasons
 * @enum {string}
 */
export const STUN_ERROR_REASON = {
  [STUN_ERROR_CODE.BAD_REQUEST]: 'Bad Request',
  [STUN_ERROR_CODE.UNAUTHORIZED]: 'Unauthorized',
  [STUN_ERROR_CODE.UNKNOWN_ATTRIBUTE]: 'Unknown Attribute',
  [STUN_ERROR_CODE.STALE_NONCE]: 'Stale Nonce',
  [STUN_ERROR_CODE.SERVER_ERROR]: 'Server Error',
  [STUN_ERROR_CODE.INSUFFICIENT_CAPACITY]: 'Insufficient Capacity',
};

/**
 * STUN magic cookie for XOR operations
 * @constant {number}
 * @description Fixed value 0x2112a442 defined in RFC 5389 Section 6. Used to:
 * 1. Verify STUN messages (first 4 bits of transaction ID)
 * 2. XOR mapped addresses for security (prevents simple NAT translation attacks)
 * 3. Distinguish STUN from other protocols when multiplexed on same port
 */
export const STUN_MAGIC_COOKIE = 0x2112a442;

/**
 * STUN transaction ID length in bytes
 * @constant {number}
 */
export const STUN_TRANSACTION_ID_LENGTH = 12;

/**
 * STUN header length in bytes
 * @constant {number}
 */
export const STUN_HEADER_LENGTH = 20;

/**
 * Default STUN port
 * @constant {number}
 */
export const DEFAULT_STUN_PORT = 3478;

/**
 * Default TURN port
 * @constant {number}
 */
export const DEFAULT_TURN_PORT = 3478;

/**
 * Default TURNS (TURN over TLS) port
 * @constant {number}
 */
export const DEFAULT_TURNS_PORT = 5349;

/**
 * Transport protocols
 * @enum {string}
 */
export const TRANSPORT_PROTOCOL = {
  UDP: 'udp',
  TCP: 'tcp',
  TLS: 'tls',
};

/**
 * ICE candidate types
 * @enum {string}
 */
export const ICE_CANDIDATE_TYPE = {
  HOST: 'host',
  SRFLX: 'srflx',
  PRFLX: 'prflx',
  RELAY: 'relay',
};

/**
 * Default TURN allocation lifetime in seconds
 * @constant {number}
 * @description 10 minutes is the recommended default per RFC 5766 Section 6.2.
 * Balances between keeping allocations active for active sessions while
 * cleaning up abandoned allocations to prevent resource exhaustion.
 */
export const DEFAULT_ALLOCATION_LIFETIME = 600;

/**
 * Maximum TURN allocation lifetime in seconds
 * @constant {number}
 * @description 1 hour maximum prevents indefinite resource holding.
 * Per RFC 5766, clients must refresh before expiry. Long lifetimes
 * reduce refresh traffic but increase server memory usage.
 */
export const MAX_ALLOCATION_LIFETIME = 3600;

/**
 * Minimum TURN allocation lifetime in seconds
 * @constant {number}
 * @description 1 minute minimum prevents excessive refresh requests
 * that could overwhelm the server. Also allows quick cleanup of
 * misconfigured or abandoned allocations.
 */
export const MIN_ALLOCATION_LIFETIME = 60;

/**
 * Default channel lifetime in seconds
 * @constant {number}
 */
export const DEFAULT_CHANNEL_LIFETIME = 600;

/**
 * Minimum channel number (16384)
 * @constant {number}
 * @description Channel numbers 0x4000-0x7FFF (16384-32767) reserved for TURN.
 * Below 0x4000 is reserved for future protocol use per RFC 5766 Section 11.
 * Using channels instead of STUN headers reduces per-packet overhead by 20 bytes.
 */
export const MIN_CHANNEL_NUMBER = 0x4000;

/**
 * Maximum channel number
 * @constant {number}
 */
export const MAX_CHANNEL_NUMBER = 0x7fff;
