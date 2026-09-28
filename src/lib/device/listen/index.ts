// Listening in the browser (M9): records the OP-XY's USB audio or the replica's sound through an
// AudioWorklet and hears it in a worker. The browser wiring (`browser.ts`) is imported on its own,
// by the agent's lazily loaded chunk, because it pulls in the worklet and the worker.
export * from './capture.svelte';
export * from './protocol';
export { analyzeHere, workerAnalyzer, type AnalysisReply, type AnalysisRequest } from './analyzer';
