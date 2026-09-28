/**
 * MTP (PTP over USB) codes the OP-XY speaks in MTP mode (`com → M4`), as logged on OS 1.1.33
 * (docs/research/90-device-probe.md, session 1: re-enumerates as PID 0x0021 with one vendor-class
 * interface, bulk IN 0x89, bulk OUT 0x0A, interrupt IN 0x83).
 */

/** The OP-XY's USB ids in MTP mode (its MIDI ports are gone while it is there). */
export const OPXY_MTP_USB = { vendorId: 0x2367, productId: 0x0021 } as const;

/** Container types. */
export const CONTAINER = { command: 1, data: 2, response: 3, event: 4 } as const;

/** The container header: length u32, type u16, code u16, transaction id u32. */
export const HEADER_BYTES = 12;

/** Operation codes (PTP 15740 and the MTP 1.1 object-property extension). */
export const OP = {
	getDeviceInfo: 0x1001,
	openSession: 0x1002,
	closeSession: 0x1003,
	getStorageIds: 0x1004,
	getStorageInfo: 0x1005,
	getNumObjects: 0x1006,
	getObjectHandles: 0x1007,
	getObjectInfo: 0x1008,
	getObject: 0x1009,
	getThumb: 0x100a,
	deleteObject: 0x100b,
	sendObjectInfo: 0x100c,
	sendObject: 0x100d,
	initiateCapture: 0x100e,
	formatStore: 0x100f,
	resetDevice: 0x1010,
	selfTest: 0x1011,
	setObjectProtection: 0x1012,
	powerDown: 0x1013,
	getDevicePropDesc: 0x1014,
	getDevicePropValue: 0x1015,
	setDevicePropValue: 0x1016,
	resetDevicePropValue: 0x1017,
	terminateOpenCapture: 0x1018,
	moveObject: 0x1019,
	copyObject: 0x101a,
	getPartialObject: 0x101b,
	initiateOpenCapture: 0x101c,
	getObjectPropsSupported: 0x9801,
	getObjectPropDesc: 0x9802,
	getObjectPropValue: 0x9803,
	setObjectPropValue: 0x9804,
	getObjectPropList: 0x9805
} as const;

/** Response codes, with a few words each for errors. */
export const RESPONSE = {
	ok: 0x2001,
	generalError: 0x2002,
	sessionNotOpen: 0x2003,
	invalidTransactionId: 0x2004,
	operationNotSupported: 0x2005,
	parameterNotSupported: 0x2006,
	incompleteTransfer: 0x2007,
	invalidStorageId: 0x2008,
	invalidObjectHandle: 0x2009,
	storeFull: 0x200c,
	storeReadOnly: 0x200e,
	accessDenied: 0x200f,
	deviceBusy: 0x2019,
	invalidParentObject: 0x201a,
	invalidParameter: 0x201d,
	sessionAlreadyOpen: 0x201e,
	transactionCancelled: 0x201f
} as const;

const RESPONSE_TEXT: Record<number, string> = {
	[RESPONSE.generalError]: 'general error',
	[RESPONSE.sessionNotOpen]: 'session not open',
	[RESPONSE.invalidTransactionId]: 'invalid transaction id',
	[RESPONSE.operationNotSupported]: 'operation not supported',
	[RESPONSE.parameterNotSupported]: 'parameter not supported',
	[RESPONSE.incompleteTransfer]: 'incomplete transfer',
	[RESPONSE.invalidStorageId]: 'invalid storage',
	[RESPONSE.invalidObjectHandle]: 'no such object',
	[RESPONSE.storeFull]: 'storage full',
	[RESPONSE.storeReadOnly]: 'storage is read-only',
	[RESPONSE.accessDenied]: 'access denied',
	[RESPONSE.deviceBusy]: 'device busy',
	[RESPONSE.invalidParentObject]: 'invalid parent folder',
	[RESPONSE.invalidParameter]: 'invalid parameter',
	[RESPONSE.sessionAlreadyOpen]: 'session already open',
	[RESPONSE.transactionCancelled]: 'transaction cancelled'
};

/** A response code in words, e.g. `0x2009 (no such object)`. */
export const responseText = (code: number): string =>
	`0x${code.toString(16).padStart(4, '0')}${RESPONSE_TEXT[code] ? ` (${RESPONSE_TEXT[code]})` : ''}`;

/** Object formats. A folder is an association of the generic-folder type. */
export const FORMAT = { undefined: 0x3000, association: 0x3001, text: 0x3004 } as const;
export const GENERIC_FOLDER = 0x0001;

/** The parent handle of objects at a storage's top level, and "all storages / formats". */
export const ROOT = 0xffffffff;
export const ALL = 0;
