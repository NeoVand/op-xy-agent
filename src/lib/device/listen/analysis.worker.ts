/**
 * The listening analysis in a worker, so hearing a recording (about half a second for 30 s) never
 * blocks the page, whose replica schedules its notes 100 ms ahead. One request, one reply, matched
 * by id.
 */
import { analyzeAudio } from '../../core/listen';
import type { AnalysisReply, AnalysisRequest } from './analyzer';

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
	const { id, channels, sampleRate, options } = event.data;
	let reply: AnalysisReply;
	try {
		reply = { id, analysis: analyzeAudio(channels, sampleRate, options) };
	} catch (error) {
		reply = { id, error: error instanceof Error ? error.message : String(error) };
	}
	self.postMessage(reply);
};
