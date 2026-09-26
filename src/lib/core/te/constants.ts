// TE SysEx protocol constants. The facts come from TE's public web apps (update utility, EP sample
// tool) as documented in docs/research/60-firmware.md §4; the machine-readable copy is
// knowledge/firmware/te-sysex.json and constants.spec.ts keeps the two in sync. Only the OP-XY
// replies logged in docs/research/90-device-probe.md are verified on hardware (OS 1.1.33).

/** Teenage Engineering's MIDI manufacturer id: bytes 1–3 of every TE SysEx frame. */
export const TE_MANUFACTURER_ID: readonly [number, number, number] = [0x00, 0x20, 0x76];

/** MIDI System Exclusive start byte. */
export const SYSEX_START = 0xf0;

/** MIDI End Of Exclusive byte. */
export const SYSEX_END = 0xf7;

/** Byte 5 of a TE protocol frame (request, response or event). */
export const TE_PROTOCOL_MARKER = 0x40;

/**
 * Byte 5 of a firmware debug log frame (`F0 00 20 76 <dev> 33 <ASCII…> F7`). The EP community treats
 * these as "stop all traffic, power-cycle", and so do we.
 */
export const TE_DEBUG_MARKER = 0x33;

/** Byte 6 flag: set in requests, cleared in responses and events. */
export const TE_FLAG_IS_REQUEST = 0x40;

/** Byte 6 flag: a 12-bit request id is present (low 5 bits of byte 6, then byte 7). */
export const TE_FLAG_HAS_REQUEST_ID = 0x20;

/** Largest 12-bit request id; ids wrap to 0 after it. */
export const TE_REQUEST_ID_MAX = 0x0fff;

/** TE's default reply timeout (TE's own client uses it for every command except DFU). */
export const TE_DEFAULT_TIMEOUT_MS = 20_000;

/** TE command numbers (byte 8 of a frame). Anything not listed here is undocumented. */
export const TE_CMD = {
	GREET: 0x01,
	ECHO: 0x02,
	/** Firmware update / reboot into TE Boot. Listed only so policy.ts can recognise and refuse it. */
	DFU: 0x03,
	FILE: 0x05,
	SETTINGS: 0x06,
	/** Defined in TE's client library, used by neither of TE's apps. Never sent. */
	PRODUCT_SPECIFIC: 0x7f
} as const;

/** Name of a documented TE command. */
export type TeCommandName = keyof typeof TE_CMD;

/** Status byte values (responses only; the byte sits after the command, outside the packed data). */
export const TE_STATUS = {
	OK: 0,
	ERROR: 1,
	COMMAND_NOT_FOUND: 2,
	BAD_REQUEST: 3,
	SPECIFIC_ERROR_START: 16,
	SPECIFIC_ERROR_END: 63,
	/** 64 and above: command-specific success or "still working"; the request stays open. */
	SPECIFIC_SUCCESS_START: 64
} as const;

/** FILE (0x05) sub-commands: the first byte of the unpacked payload. */
export const TE_FILE = {
	INIT: 0x01,
	PUT: 0x02,
	GET: 0x03,
	LIST: 0x04,
	PLAYBACK: 0x05,
	DELETE: 0x06,
	METADATA: 0x07,
	INFO: 0x0b,
	MOVE: 0x0c
} as const;

/** Second payload byte of FILE PUT: open a transfer, or send a data page. */
export const TE_FILE_PUT_TYPE = { INIT: 0x00, DATA: 0x01 } as const;

/** Second payload byte of FILE GET: open a transfer, or fetch a data page. */
export const TE_FILE_GET_TYPE = { INIT: 0x00, DATA: 0x01 } as const;

/** Second payload byte of FILE METADATA. */
export const TE_FILE_METADATA = { SET: 0x01, GET: 0x02, SET_PAGED: 0x04 } as const;

/** Third payload byte of FILE METADATA SET_PAGED. */
export const TE_FILE_METADATA_PAGED_TYPE = { INIT: 0x00, DATA: 0x01 } as const;

/** FILE PLAYBACK actions. */
export const TE_FILE_PLAYBACK = { START: 0x01, STOP: 0x02 } as const;

/** FILE INIT flag: subscribe to unsolicited file events. The only documented INIT flag. */
export const TE_FILE_INIT_FLAG_SUBSCRIBE = 0x01;

/** TE's default FILE INIT max response length (4 MiB); also what our OP-XY probe sent. */
export const TE_FILE_DEFAULT_MAX_RESPONSE_LENGTH = 4 * 1024 * 1024;

/** FILE node flags (LIST, INFO and GET replies; PUT requests). */
export const TE_FILE_NODE_FLAG = {
	FILE: 0x01,
	DIR: 0x02,
	READ: 0x04,
	WRITE: 0x08,
	DELETE: 0x10,
	MOVE: 0x20,
	PLAYBACK: 0x40
} as const;

/** FILE event types (first data byte of an unsolicited FILE frame; EP devices, never seen on the OP-XY). */
export const TE_FILE_EVENT = {
	METADATA_UPDATED: 3,
	FILE_ADDED: 8,
	FILE_UPDATED: 9,
	FILE_DELETED: 10,
	FILE_MOVED: 13
} as const;

/** SETTINGS (0x06) sub-commands. The OP-XY answers "command not found" (status 2) on OS 1.1.33. */
export const TE_SETTINGS = { INIT: 0x01, GET_ALL: 0x02, SET: 0x03 } as const;

/** DFU (0x03) sub-commands: documented so they can be recognised in logs and refused, never used. */
export const TE_DFU = { ENTER: 0x01, BEGIN: 0x02, CHUNK: 0x03, PERFORM: 0x04, EXIT: 0x05 } as const;

/** The OP-XY's SysEx device id (identity reply byte 2), echoed into byte 4 of every TE frame. */
export const OPXY_DEVICE_ID = 0x21;

/** The OP-XY's TE SKU, derived from its identity reply. */
export const OPXY_SKU = 'TE033AS001';
