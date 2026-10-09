# BRIEF - Reco layer system (owner: Pavan, branch pavan/layer-library)

## A. Layers
1. "+ Add Layer" must offer Text, Image, Audio, Video, Shape. Video must work reliably in preview and export. Video layers get every setting that image and audio layers have.
   - Video can be added in two ways: as an overlay layer, or appended as a continuation after the existing video on the main track.
   - **Status:** Partially implemented (Text, Image, Shape, and Audio present in dropdown; Video overlay layer and main-track continuation not started).
2. Each layer type has a pre-loaded library users can insert and edit: text styles with attractive fonts; stickers/meme-style images; audio effects (pops, bangs, whooshes); video clips/animated overlays; more shapes (triangle, circle, oval, ellipse, star, polygon, heart, line).
   - **Status:** Not started.
3. Library asset licensing rules: CC0, public domain, or OFL fonts only. No Giphy, Tenor, scraped memes, logos or celebrities. No Pixabay/Pexels videos. Memes must be original or CC0 stickers. Every asset needs a manifest entry (file, source URL, author, licence, licence URL, attribution required, date checked). Ask me before downloading anything. Keep OFL text beside fonts, and test that fonts render in the export.
   - **Status:** Not started (licensing & manifest rules established).

## B. Editing controls (all visual layers)
4. Opacity, shadow, border, rotation, flip, blend mode, corner radius, entrance/exit animation, hide, lock, and layer blur. Every property must work in BOTH the live preview and the export.
   - **Status:** Not started (planned for Phase 2).
5. Text-only: line spacing, letter spacing, word spacing, text case, gradient fill, stroke, glow, plus everything professional editors offer.
   - **Status:** Not started (planned for Phase 2b).
6. Image: crop (after upload and later) and real-time filters (brightness, contrast, saturation, blur, grayscale and similar).
   - **Status:** Not started.
7. Audio: volume, fade, speed, mute and TRIM (both edges, with the sound actually starting from the trimmed point). Settings box must open when an audio layer is selected.
   - **Status:** Partially implemented (settings box opening and volume control exist; fade, speed, mute, and true source offset trimming not started).
8. Color pickers everywhere: saturation/brightness area, hue bar, alpha bar, eyedropper, hex/RGB inputs, saved swatches. Eyedropper: use the browser EyeDropper API where supported (Chrome/Edge) and a fallback that samples the preview canvas elsewhere.
   - **Status:** Not started (planned for Phase 3).

## C. Panel behavior and look
9. Annotation settings panel: narrower but easily readable, X close button in the top corner, stays open when a layer is selected from the timeline, reopens on every selection.
   - **Status:** Committed, not visually verified.
10. Tooltips on every control.
   - **Status:** Committed, not visually verified (existing controls covered; all new controls must include tooltips).
11. The panels currently look clumsy. They should look like a professional editor: collapsible sections, compact icon toggles, one consistent spacing scale, aligned labels and controls, sticky header. The tool panels should feel authentic and professional, not clumsy.
   - **Status:** Not started.

## D. Timeline visuals & professional feel
12. Timeline visuals should look professional: filmstrip thumbnails on video clips, audio waveform, track labels with mute/lock/hide, snapping guides, a zoom slider, a clear ruler, a visible playhead handle, obvious trim handles.
   - **Status:** Partially implemented (audio waveform on audio regions, basic ruler ticks, and playhead handle exist; filmstrip thumbnails, track labels with mute/lock/hide, snapping guides, zoom slider, and obvious trim handles are missing/partial).

## E. Process rules
13. One phase at a time. After each, give exact click steps and wait. Say "not visually verified" until I confirm. Commit each fix separately with explicit paths. Do not push unless I say so. Do not change package.json without asking. New visual properties must load safely from old project files and templates.
   - **Status:** Active / In progress (governing workflow rule).
14. Status of Phase 1 items (width, X, tooltips, selection fix, whitelist) = committed, not visually verified.
   - **Status:** Committed, not visually verified.
