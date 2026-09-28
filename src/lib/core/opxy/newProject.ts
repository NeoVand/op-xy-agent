/**
 * A new project's sounds as the OP-XY stores them (`knowledge/presets/new-project.json`), validated
 * at import. Kept apart from `data.ts` because its schema names the engines `tracks.ts` defines.
 */
import newProjectJson from '$knowledge/presets/new-project.json';
import { parseKnowledge } from './common.schema';
import { NewProjectFileSchema, type NewProjectFile } from './newProject.schema';

/** Where the file lives. */
export const NEW_PROJECT_FILE = 'knowledge/presets/new-project.json';

/** `knowledge/presets/new-project.json`, validated. */
export const newProjectFile: NewProjectFile = parseKnowledge(
	NewProjectFileSchema,
	newProjectJson,
	NEW_PROJECT_FILE
);
