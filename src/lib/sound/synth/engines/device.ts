/**
 * How our engines' levels relate to the OP-XY's, for engines modelled on measured levels.
 *
 * The device's USB audio plays an engine this many dB below ours: simple's saw (shape 0) measures
 * −18.9 dBFS there on A2 and A4 (2026-09-27, `docs/research/90-device-probe.md`), and −12.7 dBFS
 * from our simple. An engine built from levels measured on the device plays them this much louder,
 * so every engine keeps the device's loudness against the others.
 */
export const DEVICE_GAIN_DB = 6.2;
