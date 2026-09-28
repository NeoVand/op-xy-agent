<!--
@component
Shared paint servers for the replica: gradients for the anodised body, tiles, keycaps, knobs, LED
glows and the screen glass, plus a barely-there satin grain. Light comes from the back edge, so
shadows fall toward the player. Only gradients and one noise tile (rendered once per pattern
tile, not per element) keep repaints of a pressed key cheap. Ids are prefixed `rx-`.
-->
<svelte:options namespace="svg" />

<defs>
	<!-- anodised slab, lit from the back edge -->
	<linearGradient id="rx-body" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#1e1f22" />
		<stop offset="0.45" stop-color="#1a1b1e" />
		<stop offset="1" stop-color="#161719" />
	</linearGradient>
	<!-- chamfered rim: bright along the back, a faint catch-light along the front -->
	<linearGradient id="rx-rim" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.13" />
		<stop offset="0.1" stop-color="#ffffff" stop-opacity="0.035" />
		<stop offset="0.9" stop-color="#ffffff" stop-opacity="0.015" />
		<stop offset="1" stop-color="#ffffff" stop-opacity="0.08" />
	</linearGradient>
	<!-- the well the tiles sit in: darkest under the back wall -->
	<linearGradient id="rx-well-shade" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#000000" stop-opacity="0.7" />
		<stop offset="0.02" stop-color="#000000" stop-opacity="0" />
	</linearGradient>

	<!-- tiles: a little light on the back edge, a little shade toward the front -->
	<linearGradient id="rx-tile-shade" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.02" />
		<stop offset="0.3" stop-color="#ffffff" stop-opacity="0" />
		<stop offset="0.7" stop-color="#000000" stop-opacity="0" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.2" />
	</linearGradient>
	<linearGradient id="rx-tile-rim" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.1" />
		<stop offset="0.06" stop-color="#ffffff" stop-opacity="0.02" />
		<stop offset="0.94" stop-color="#000000" stop-opacity="0.1" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.5" />
	</linearGradient>

	<!-- keycaps -->
	<radialGradient id="rx-cap-shadow" cx="0.5" cy="0.5" r="0.5">
		<stop offset="0.68" stop-color="#000000" stop-opacity="0.78" />
		<stop offset="0.82" stop-color="#000000" stop-opacity="0.3" />
		<stop offset="1" stop-color="#000000" stop-opacity="0" />
	</radialGradient>
	<radialGradient id="rx-cap-shadow-light" cx="0.5" cy="0.5" r="0.5">
		<stop offset="0.7" stop-color="#000000" stop-opacity="0.26" />
		<stop offset="0.86" stop-color="#000000" stop-opacity="0.08" />
		<stop offset="1" stop-color="#000000" stop-opacity="0" />
	</radialGradient>
	<radialGradient id="rx-cap-shade" cx="0.5" cy="0.34" r="0.7">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.035" />
		<stop offset="0.5" stop-color="#000000" stop-opacity="0.08" />
		<stop offset="0.82" stop-color="#000000" stop-opacity="0.26" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.46" />
	</radialGradient>
	<radialGradient id="rx-cap-shade-light" cx="0.5" cy="0.34" r="0.68">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.1" />
		<stop offset="0.68" stop-color="#000000" stop-opacity="0" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.16" />
	</radialGradient>
	<linearGradient id="rx-cap-rim" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.26" />
		<stop offset="0.2" stop-color="#ffffff" stop-opacity="0.05" />
		<stop offset="0.42" stop-color="#000000" stop-opacity="0.18" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.62" />
	</linearGradient>
	<linearGradient id="rx-cap-rim-light" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.6" />
		<stop offset="0.28" stop-color="#ffffff" stop-opacity="0.08" />
		<stop offset="0.5" stop-color="#000000" stop-opacity="0.08" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.32" />
	</linearGradient>

	<!-- LED light: a hot core, a halo and a faint spill onto the cap -->
	<radialGradient id="rx-glow-white" cx="0.5" cy="0.5" r="0.5">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.95" />
		<stop offset="0.26" stop-color="#ffffff" stop-opacity="0.5" />
		<stop offset="0.55" stop-color="#ffffff" stop-opacity="0.12" />
		<stop offset="1" stop-color="#ffffff" stop-opacity="0" />
	</radialGradient>
	<radialGradient id="rx-glow-red" cx="0.5" cy="0.5" r="0.5">
		<stop offset="0" stop-color="#ff7a3d" stop-opacity="1" />
		<stop offset="0.26" stop-color="#ff4d00" stop-opacity="0.6" />
		<stop offset="0.55" stop-color="#ff4d00" stop-opacity="0.16" />
		<stop offset="1" stop-color="#ff4d00" stop-opacity="0" />
	</radialGradient>

	<!-- encoders and the volume pot -->
	<radialGradient id="rx-dish" cx="0.5" cy="0.6" r="0.55">
		<stop offset="0" stop-color="#000000" stop-opacity="0" />
		<stop offset="0.9" stop-color="#000000" stop-opacity="0.08" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.3" />
	</radialGradient>
	<linearGradient id="rx-dish-lip" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#000000" stop-opacity="0.75" />
		<stop offset="0.5" stop-color="#000000" stop-opacity="0.5" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.35" />
	</linearGradient>
	<linearGradient id="rx-dish-catch" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0" />
		<stop offset="0.6" stop-color="#ffffff" stop-opacity="0.02" />
		<stop offset="1" stop-color="#ffffff" stop-opacity="0.2" />
	</linearGradient>
	<radialGradient id="rx-knob-shadow" cx="0.5" cy="0.5" r="0.5">
		<stop offset="0.62" stop-color="#000000" stop-opacity="0.8" />
		<stop offset="0.8" stop-color="#000000" stop-opacity="0.3" />
		<stop offset="1" stop-color="#000000" stop-opacity="0" />
	</radialGradient>
	<radialGradient id="rx-knob-shade" cx="0.5" cy="0.3" r="0.72">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.08" />
		<stop offset="0.6" stop-color="#ffffff" stop-opacity="0" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.45" />
	</radialGradient>
	<radialGradient id="rx-knob-top" cx="0.5" cy="0.3" r="0.75">
		<stop offset="0" stop-color="#3b3d42" />
		<stop offset="1" stop-color="#1b1c1f" />
	</radialGradient>
	<linearGradient id="rx-knob-rim" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.28" />
		<stop offset="0.35" stop-color="#ffffff" stop-opacity="0.04" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.4" />
	</linearGradient>
	<radialGradient id="rx-enc-cap-shade" cx="0.45" cy="0.32" r="0.7">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.22" />
		<stop offset="0.55" stop-color="#ffffff" stop-opacity="0" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.26" />
	</radialGradient>

	<!-- screen glass: black, with a soft diagonal sheen -->
	<linearGradient id="rx-glass" x1="0" y1="0" x2="0.7" y2="1">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.07" />
		<stop offset="0.35" stop-color="#ffffff" stop-opacity="0.015" />
		<stop offset="1" stop-color="#ffffff" stop-opacity="0" />
	</linearGradient>

	<!-- the pitch-bend pill: dark rubber catching light on its top edge -->
	<linearGradient id="rx-rubber" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#58606c" />
		<stop offset="0.35" stop-color="#363c45" />
		<stop offset="1" stop-color="#1c1f24" />
	</linearGradient>
	<linearGradient id="rx-switch" x1="0" y1="0" x2="1" y2="0">
		<stop offset="0" stop-color="#9c9a97" />
		<stop offset="0.35" stop-color="#d9d7d4" />
		<stop offset="1" stop-color="#b3b1ae" />
	</linearGradient>

	<!-- satin grain: very fine, very low-contrast light and dark specks from one stitched noise
	     tile. Anodised aluminium reads smooth; depth comes from the gradients, not from this. -->
	<filter id="rx-grain-noise" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
		<feTurbulence
			type="fractalNoise"
			baseFrequency="6"
			numOctaves="2"
			seed="11"
			stitchTiles="stitch"
			result="noise"
		/>
		<feColorMatrix
			in="noise"
			type="matrix"
			values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.4 0 0 0 -0.2"
			result="light"
		/>
		<feColorMatrix
			in="noise"
			type="matrix"
			values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.8 0 0 0 0.4"
			result="dark"
		/>
		<feMerge>
			<feMergeNode in="dark" />
			<feMergeNode in="light" />
		</feMerge>
	</filter>
	<pattern id="rx-grain" width="12" height="12" patternUnits="userSpaceOnUse">
		<rect width="12" height="12" filter="url(#rx-grain-noise)" />
	</pattern>
</defs>
