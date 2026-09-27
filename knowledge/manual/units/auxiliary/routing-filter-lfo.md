---
id: auxiliary.routing-filter-lfo
title: Aux routing, filter and LFO pages
aliases: [aux routing, aux filter, aux lfo, aux sends]
area: auxiliary
order: 80
context:
  modes: [auxiliary]
  screens: [M2, M3, M4]
summary: Pages shared by several aux tracks — M2 routes instrument tracks in, M3 is a high-pass and low-pass filter with sends on its shift layer, and M4 is an LFO aimed at one of the track's own parameters.
status: current
firmware:
  min: '1.0.9'
  changed_in: ['1.1.32']
  guide_version: '1.1.15'
  verified_on: null
facts:
  - id: routing-where
    text: The brain, external audio, tape and both FX tracks have a routing page on M2.
    source: https://teenage.engineering/guides/op-xy/auxiliary
  - id: routing-use
    text: On a routing page, an encoder click toggles the page between tracks 1–4 and tracks 5–8; turning a track's encoder adds or removes it, and on tape and external audio sets how much goes in.
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
  - id: which-tracks
    text: External audio, tape and both FX tracks have the filter on M3; those four plus external MIDI have the LFO on M4.
    source: https://teenage.engineering/guides/op-xy/auxiliary
  - id: lfo-fix
    text: OS 1.1.32 fixed aux track LFOs failing to affect the page parameters.
    source: https://teenage.engineering/downloads/op-xy#1.1.32
    firmware_min: '1.1.32'
  - id: ccs
    text: Community charts put the filter on CC32 (high-pass) and CC35 (low-pass), the sends on CC37–39 and the LFO on CC40–43 of the aux track's channel.
    source: docs/research/20-midi-control.md#35-auxiliary-tracks-916
    confidence: community
parameters:
  - screen: M3
    encoder: E1
    layer: base
    name: high-pass cutoff
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
  - screen: M3
    encoder: E4
    layer: base
    name: low-pass cutoff
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
  - screen: M3
    encoder: E2
    layer: shift
    name: tape send
    note: external audio only
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-audio
  - screen: M3
    encoder: E3
    layer: shift
    name: FX I send
    note: external audio and tape
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-audio
  - screen: M3
    encoder: E4
    layer: shift
    name: FX II send
    note: external audio, tape, and FX I (into FX II)
    source: https://teenage.engineering/guides/op-xy/auxiliary#external-audio
  - screen: M4
    encoder: E1
    layer: base
    name: LFO speed
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
  - screen: M4
    encoder: E2
    layer: base
    name: LFO amount
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
  - screen: M4
    encoder: E3
    layer: base
    name: destination
    note: the page to modulate
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
  - screen: M4
    encoder: E4
    layer: base
    name: parameter
    note: the encoder on that page
    source: https://teenage.engineering/guides/op-xy/auxiliary#tape
related: [auxiliary.overview, auxiliary.external-audio, auxiliary.tape, auxiliary.fx-sends]
---

These pages behave alike on every aux track that has them. The filter trims the lows and highs of
what the track outputs, keeping a reverb return clean; the LFO moves one of the track's own settings.
