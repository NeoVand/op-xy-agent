<!--
@component
Shared paint servers for the replica: gradients for the anodised body, tiles, keycaps, knobs, LED
glows and the screen glass (the finish's grain is a pixel layer over the SVG: grain.ts). Light
comes from the back edge, so shadows fall toward the player. Only gradients keep repaints of a
pressed key cheap. Ids are prefixed `rx-`.
-->
<svelte:options namespace="svg" />

<defs>
	<!-- anodised slab, lit from the back edge: the tiles' and caps' black (TE's top-down photo shows
	     one material), the outer body a shade darker than the tiles (the owner) -->
	<linearGradient id="rx-body" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#212225" />
		<stop offset="0.45" stop-color="#1e1f22" />
		<stop offset="1" stop-color="#1b1c1f" />
	</linearGradient>
	<!-- the machined chamfer round the slab: bare aluminium catching the light all the way round,
	     brightest along the back (TE's photo: about 2.5 times the body's light on every side) -->
	<linearGradient id="rx-rim" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.26" />
		<stop offset="0.06" stop-color="#ffffff" stop-opacity="0.16" />
		<stop offset="0.94" stop-color="#ffffff" stop-opacity="0.15" />
		<stop offset="1" stop-color="#ffffff" stop-opacity="0.18" />
	</linearGradient>
	<!-- satin sheen: anodised aluminium mirrors a little of the room's light, so the whole top is
	     brighter toward the back and the middle and falls off toward the front corners (TE's photo:
	     tiles about 62 on the top rows, 40 on the bottom one). Laid over everything in soft-light,
	     which leaves pure white (lit LEDs) and pure black (the gaps) as they are -->
	<radialGradient id="rx-sheen" gradientUnits="userSpaceOnUse" cx="115" cy="-60" r="190">
		<stop offset="0.3" stop-color="#9a9a9a" />
		<stop offset="0.55" stop-color="#8a8a8a" />
		<stop offset="0.75" stop-color="#7c7c7c" />
		<stop offset="1" stop-color="#6a6a6a" />
	</radialGradient>
	<!-- the well the tiles sit in: darkest under the back wall -->
	<linearGradient id="rx-well-shade" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#000000" stop-opacity="0.7" />
		<stop offset="0.02" stop-color="#000000" stop-opacity="0" />
	</linearGradient>

	<!-- tiles: anodised satin, a soft sheen toward the lit back and shade toward the front, the
	     chamfer catching the light along the back edge -->
	<linearGradient id="rx-tile-shade" x1="0" y1="0" x2="0.35" y2="1">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.035" />
		<stop offset="0.4" stop-color="#ffffff" stop-opacity="0" />
		<stop offset="0.7" stop-color="#000000" stop-opacity="0" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.18" />
	</linearGradient>
	<!-- each tile's edge: light on its back and left chamfers, dark on its front and right ones
	     (TE's photo: a tile's left edge 84 against its face's 70, its back edge 159 against 126) -->
	<linearGradient id="rx-tile-rim" x1="0" y1="0" x2="1" y2="1">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.16" />
		<stop offset="0.25" stop-color="#ffffff" stop-opacity="0.12" />
		<stop offset="0.45" stop-color="#ffffff" stop-opacity="0.03" />
		<stop offset="0.55" stop-color="#000000" stop-opacity="0.06" />
		<stop offset="0.75" stop-color="#000000" stop-opacity="0.36" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.55" />
	</linearGradient>

	<!-- keycaps: a flat disc standing 2 mm proud of its tile. TE's top-down photo: the shadow drops
	     sharply at the cap's edge (to a quarter of the tile's light below a black cap) and fades out
	     about 2 mm in front, 1.5 mm at the sides, hardly at all behind. The circle is r + 1.3 mm,
	     set 0.7 mm toward the front; the cap covers its inner 0.78 -->
	<radialGradient id="rx-cap-shadow" cx="0.5" cy="0.5" r="0.5">
		<stop offset="0.78" stop-color="#000000" stop-opacity="0.8" />
		<stop offset="0.86" stop-color="#000000" stop-opacity="0.5" />
		<stop offset="0.93" stop-color="#000000" stop-opacity="0.2" />
		<stop offset="1" stop-color="#000000" stop-opacity="0" />
	</radialGradient>
	<radialGradient id="rx-cap-shadow-light" cx="0.5" cy="0.5" r="0.5">
		<stop offset="0.78" stop-color="#000000" stop-opacity="0.55" />
		<stop offset="0.86" stop-color="#000000" stop-opacity="0.34" />
		<stop offset="0.93" stop-color="#000000" stop-opacity="0.12" />
		<stop offset="1" stop-color="#000000" stop-opacity="0" />
	</radialGradient>
	<!-- the tile's collar round the cap, bright behind it (photo, above a black cap: dark just past
	     its edge, twice the tile's light at 6.4 mm, back to the tile's at its edge). One band on a
	     circle of r + 2.4 mm, kept to the back by a mask that fades it out a third of the way down -->
	<radialGradient id="rx-collar" cx="0.5" cy="0.5" r="0.5">
		<stop offset="0.8" stop-color="#ffffff" stop-opacity="0" />
		<stop offset="0.87" stop-color="#ffffff" stop-opacity="0.07" />
		<stop offset="0.92" stop-color="#ffffff" stop-opacity="0.13" />
		<stop offset="0.96" stop-color="#ffffff" stop-opacity="0.09" />
		<stop offset="1" stop-color="#ffffff" stop-opacity="0" />
	</radialGradient>
	<radialGradient id="rx-collar-light" cx="0.5" cy="0.5" r="0.5">
		<stop offset="0.8" stop-color="#ffffff" stop-opacity="0" />
		<stop offset="0.87" stop-color="#ffffff" stop-opacity="0.14" />
		<stop offset="0.92" stop-color="#ffffff" stop-opacity="0.24" />
		<stop offset="0.96" stop-color="#ffffff" stop-opacity="0.16" />
		<stop offset="1" stop-color="#ffffff" stop-opacity="0" />
	</radialGradient>
	<linearGradient id="rx-back-fade" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#ffffff" />
		<stop offset="0.38" stop-color="#000000" />
	</linearGradient>
	<mask id="rx-back" maskContentUnits="objectBoundingBox">
		<rect width="1" height="1" fill="url(#rx-back-fade)" />
	</mask>
	<!-- its twin for the front: nothing above the middle, all at the bottom -->
	<linearGradient id="rx-front-fade" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0.5" stop-color="#000000" />
		<stop offset="1" stop-color="#ffffff" />
	</linearGradient>
	<mask id="rx-front" maskContentUnits="objectBoundingBox">
		<rect width="1" height="1" fill="url(#rx-front-fade)" />
	</mask>
	<!-- the cap's face: the tile's anodised satin, a soft sheen from the lit back side and a little
	     shade at its front edge; flat, so it never reads as a soft pillow -->
	<radialGradient id="rx-cap-shade" cx="0.42" cy="0.3" r="0.78">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.07" />
		<stop offset="0.55" stop-color="#ffffff" stop-opacity="0.012" />
		<stop offset="0.85" stop-color="#000000" stop-opacity="0.06" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.16" />
	</radialGradient>
	<radialGradient id="rx-cap-shade-light" cx="0.42" cy="0.3" r="0.78">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.12" />
		<stop offset="0.55" stop-color="#ffffff" stop-opacity="0.02" />
		<stop offset="0.85" stop-color="#000000" stop-opacity="0.04" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.1" />
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

	<!-- encoders, as TE's top-down photo shows them: a flat dish floor with a crisp groove, the knob's
	     shadow pooling toward the front, its chamfered side lit at the back and dark at the front
	     (photo: 128 at the back, 33 at the front, against a floor of 63), and the coloured cap a flat
	     disc over its whole top -->
	<linearGradient id="rx-enc-catch" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.07" />
		<stop offset="0.4" stop-color="#ffffff" stop-opacity="0" />
	</linearGradient>
	<radialGradient id="rx-enc-shadow" cx="0.5" cy="0.5" r="0.5">
		<stop offset="0.76" stop-color="#000000" stop-opacity="0.72" />
		<stop offset="0.86" stop-color="#000000" stop-opacity="0.42" />
		<stop offset="0.95" stop-color="#000000" stop-opacity="0.12" />
		<stop offset="1" stop-color="#000000" stop-opacity="0" />
	</radialGradient>
	<linearGradient id="rx-enc-side" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.24" />
		<stop offset="0.3" stop-color="#ffffff" stop-opacity="0.04" />
		<stop offset="0.6" stop-color="#000000" stop-opacity="0.1" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.42" />
	</linearGradient>
	<!-- the volume pot's side: the body's own anodised grey (the owner: it only looks bright in the
	     photo), a little light at the back and shade at the front -->
	<linearGradient id="rx-vol-side" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.05" />
		<stop offset="0.3" stop-color="#ffffff" stop-opacity="0" />
		<stop offset="0.6" stop-color="#000000" stop-opacity="0.06" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.4" />
	</linearGradient>
	<!-- a knob's rounded shoulder, round the outer fifth of its top: brightest just short of the
	     edge, where the curve turns toward the light (photo, at the back of every knob), then
	     rolling away; masked to the back -->
	<radialGradient id="rx-roll" cx="0.5" cy="0.5" r="0.5">
		<stop offset="0.8" stop-color="#ffffff" stop-opacity="0" />
		<stop offset="0.9" stop-color="#ffffff" stop-opacity="0.08" />
		<stop offset="0.955" stop-color="#ffffff" stop-opacity="0.2" />
		<stop offset="1" stop-color="#ffffff" stop-opacity="0.02" />
	</radialGradient>
	<linearGradient id="rx-enc-face" x1="0" y1="0" x2="0" y2="1">
		<stop offset="0" stop-color="#ffffff" stop-opacity="0.05" />
		<stop offset="0.55" stop-color="#ffffff" stop-opacity="0" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.1" />
	</linearGradient>
	<!-- a flat face's rounded edge, about half a millimetre wide (photo: every cap brightens toward
	     its back edge and falls into shade toward its front one over the outer eighth): light
	     masked to the back, shade masked to the front, and a little roll-off all round -->
	<radialGradient id="rx-fillet-light" cx="0.5" cy="0.5" r="0.5">
		<stop offset="0.8" stop-color="#ffffff" stop-opacity="0" />
		<stop offset="0.93" stop-color="#ffffff" stop-opacity="0.3" />
		<stop offset="1" stop-color="#ffffff" stop-opacity="0.1" />
	</radialGradient>
	<radialGradient id="rx-fillet-dark" cx="0.5" cy="0.5" r="0.5">
		<stop offset="0.78" stop-color="#000000" stop-opacity="0" />
		<stop offset="0.92" stop-color="#000000" stop-opacity="0.24" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.58" />
	</radialGradient>
	<radialGradient id="rx-fillet-edge" cx="0.5" cy="0.5" r="0.5">
		<stop offset="0.88" stop-color="#000000" stop-opacity="0" />
		<stop offset="1" stop-color="#000000" stop-opacity="0.22" />
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
</defs>
