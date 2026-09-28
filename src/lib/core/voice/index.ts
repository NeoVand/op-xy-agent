/**
 * Voice (M8), the pure part: OpenAI's realtime protocol as the voice front end speaks it (events,
 * the session it asks for, its three tools, the state machine that turns events into what the UI
 * shows) plus picking a microphone that is not the OP-XY. The browser side is `$lib/voice`.
 * See docs/research/71-voice.md.
 */
export * from './approval';
export * from './config';
export * from './errors';
export * from './events';
export * from './machine';
export * from './mic';
export * from './tools';
