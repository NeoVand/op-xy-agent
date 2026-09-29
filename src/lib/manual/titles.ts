/**
 * A unit's title as the manual's pages show it: a recipe loses its "Recipe — " prefix (the page
 * already says where it is) and starts with a capital. Kept apart from the manual's data so a page
 * can use it without bundling the manual.
 */
export function unitTitle(title: string): string {
	const bare = title.replace(/^Recipe — /, '');
	return bare.charAt(0).toUpperCase() + bare.slice(1);
}
