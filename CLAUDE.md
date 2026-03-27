# CLAUDE.md — Serenity Sounds

## Project Overview

Serenity Sounds is a browser-based experience that transforms chaotic keyboard input and optional image uploads into generative calming music and an immersive 3D ink-on-paper visual environment. Built as a product design challenge submission for Airfoil.

**Core Concept:** User externalizes chaotic energy through keyboard mashing → the product transforms that chaos into serenity through generative music and visuals. Tension-then-release.

## Tech Stack

- **Three.js** — 3D scene, voxel geometry, raycaster for cursor interaction, line geometry
- **Custom GLSL Shaders** — Ink-on-paper aesthetic for all surfaces (voxels, lines, background)
- **TensorFlow.js + MobileNet** — In-browser image classification (~1000 categories)
- **Canvas API** — Pixel-level image analysis (dominant color, brightness, color variance, warm/cool)
- **Tone.js** — Generative music synthesis, sequencing, effects, FFT data for visual reactivity
- **localStorage** — History persistence (parameter sets saved for deterministic replay)
- **No backend. No API calls. Entirely client-side.**

## Visual Language

**Unified ink-on-paper / sumi-e aesthetic across ALL elements.** This is the single most important design directive. Everything — voxels, connecting lines, background, bleed effects — must feel like ink on paper expressed through 3D geometry and shaders.

### Key Visual Principles

- **NO GRADIENTS.** Anywhere. Ever. Color transitions happen through ink bleed, particle density, and shader noise — never CSS or linear/radial gradients.
- Matte, flat, paper-like background (off-white / warm grey). The background itself should have a subtle procedural paper texture via shader (grain, fiber patterns).
- Futuristic because it's generative and 3D. Serene because it's sumi-e.
- Voxel cube surfaces: noise-displaced edges, bristle-like texture, ink-density opacity variation via fragment shader.
- Shadows should be soft, ink-wash style — not hard 3D shadows.
- Connecting lines: slightly wobbly with varying thickness, like a pen stroke drawn quickly. Noise-displaced line geometry.

### References for Shader Direction

- Noise-based surface effects on hard geometry: see offscreencanvas.com/issues/threejs-rocks-demo-explained (GLSL noise for organic surfaces on cubes, edge detection postprocessing)
- Sumi-e ink aesthetic in Three.js: see christophersmith.io/case-studies/sumivibe (custom GLSL shaders for bristle simulation, ink depletion, procedural paper background)
- The goal is the intersection: geometric voxel forms with ink-shader surfaces.

### Typography

- Ink-brushed, slightly rough, hand-drawn feel for key labels on voxel faces.
- UI elements (input bar, player, sign up) should use a clean but distinctive font — not generic sans-serif. Something elegant and minimal that complements the sumi-e aesthetic.

### Color

- UI chrome: neutral, muted, understated.
- All expressive color comes from the algorithm output — voxel cluster colors, ink bleed colors, connecting line colors are all derived from the image analysis and keyboard mapping.
- If no image is uploaded, derive color from keyboard data (e.g., key position mapping to hue range).

## User Flow — 7 Phases

### Phase 1: Landing Page

- Minimal landing page for Serenity Sounds.
- **"Try Demo"** button — drops user directly into the experience. No gating.
- **"Sign Up"** option — email input or simple modal. Present but non-blocking. Can be a free trial framing.
- Brief tagline explaining the product concept.
- Design decision rationale: the demo IS the product. Letting users experience it immediately is the strongest pitch.

### Phase 2: Input — The Mashing Phase

- Clean, minimal screen. Centered input bar (similar to a search bar aesthetic).
- Subtle prompt text like "Express yourself" or "Let it out" — inviting the user to mash.
- **Keyboard mashing capture:** When the user starts typing into the input bar, capture:
  - `totalDuration` — time from first keypress to last keypress (ms)
  - `keyCount` — total number of keys pressed
  - `keys[]` — array of { key: string, timestamp: number } for each press
  - `velocities[]` — time deltas between consecutive presses (ms)
  - `averageVelocity` — mean of velocities
  - `rhythmVariance` — statistical variance of velocities (even vs erratic)
  - `keyPositions[]` — map each key to its physical keyboard position (left/right, top/bottom row) for potential spatial mapping
- **Real-time feedback during mashing:** The input bar should pulse, shake slightly, or otherwise react to the typing. Keep it subtle but responsive so the user knows the system is listening.
- **Photo upload:** A small upload button (camera icon or "+") near the input bar. Optional. Max 1 photo. When uploaded, show a small thumbnail preview.
- **Submit/Generate button:** Appears after sufficient input (e.g., minimum 10 keypresses). Triggers processing.

### Phase 3: Processing

- Brief analysis moment (1-3 seconds).
- Run simultaneously:
  - **Image analysis** (if photo uploaded):
    - MobileNet classification → top category label (e.g., "ocean", "forest", "sunset", "dog")
    - Canvas API pixel analysis → dominant color (hue, saturation, lightness), overall brightness (0-1), color variance (low = monotone, high = colorful), warm vs cool ratio
  - **Keyboard data crunching:**
    - Cluster detection: group keypresses by temporal proximity. Keys pressed within ~200ms of each other belong to the same cluster. Gap > 200ms starts a new cluster.
    - Calculate per-cluster stats: size, internal velocity, position in overall sequence.
- Output: a unified `MoodParameters` object (see Mapping Algorithm section below).
- UI during processing: subtle loading state. Could be the background paper texture subtly shifting, or ink dots beginning to appear.

### Phase 4: Environment Build-Up Animation

**This must be a dramatic, fanciful build-up. Not instant.**

- Voxel clusters animate into the 3D scene one cluster at a time.
- Within each cluster, cubes appear one by one (or in rapid succession) as if being built or stamped into existence.
- Each cube is a small `BoxGeometry` with the ink shader material applied.
- **Key labels on cubes:** Each cube displays its corresponding key character (letter, number, symbol) on its faces. Render via canvas texture per unique key character, cached and reused for duplicates. Character style: ink-brushed, hand-drawn. Apply to all faces so label is visible from any angle.
- **Cluster spatial layout:** Cubes within a cluster float loosely near each other with gaps — NOT tightly packed grid. Slight random offset in x/y/z. Cluster position in the scene can be somewhat random but distributed across the viewport.
- **Photo cluster:** Appears LAST. Visually distinct — instead of key labels, the cubes display fragments of the uploaded image mapped as textures (image sliced into tiles, each tile = one cube face). Fixed size cluster (e.g., 3x3 or 4x4 = 9-16 cubes) regardless of other input. The photo gets broken into a mosaic across the cluster.
- **Timing:** Stagger the cluster appearances. Maybe 300-500ms between each cluster. Total build-up: 2-5 seconds depending on cluster count.
- **After all clusters are placed:** Cursor interaction activates.

### Phase 5: Cursor Interaction

- **Raycaster-based proximity detection:** As the user moves their cursor, detect which voxel clusters are within a radius.
- **Vector lines connect nearby clusters to cursor position.** Lines are ink-styled:
  - Noise-displaced (slightly wobbly, not perfectly straight)
  - Varying thickness based on mood parameters — heavier mood = thicker lines, lighter = thinner
  - Line style can also vary: wavy, jittery, smooth — driven by the algorithm
  - Ink-shader applied to lines as well (opacity variation, bristle-like edges)
- Lines appear/disappear smoothly as cursor moves in/out of range.
- This phase is exploratory — the user can move around and see their input visualized before playing music.

### Phase 6: Playback

- **Input bar transforms into a music player.** Smooth transition animation. Player has: play/pause button, progress indicator, maybe a simple waveform or timeline.
- **Press play → Tone.js generates music** from the `MoodParameters`.
- **Audio-reactive visuals:** Tone.js FFT/amplitude data drives subtle pulsing of voxel cubes — slight scale oscillation, slight position drift, or opacity breathing. Keep it SUBTLE, not dramatic. The cubes gently breathe with the music.
- **Ink bleed effect during playback:** This is the climax of the visual experience.
  - The voxels themselves begin to bleed outward. Their edges soften via the shader (increase noise displacement, reduce opacity at edges).
  - Color spreads from each cluster into the background plane — like ink dropped in water. Organic, unpredictable edges.
  - Each cluster bleeds its own color (derived from mood parameters).
  - Over the duration of the track, the bleeds overlap and the entire scene shifts tone.
  - The bleed is implemented as a shader effect on the background plane, with the voxel cluster positions as origin points.
  - As cubes bleed, key label characters fade — like ink washing away.
- **Background atmosphere shift:** The paper texture background subtly changes — not via gradient, but through the ink bleed spreading across it. The procedural paper grain may shift in character (finer, softer). The overall scene transitions from structured (distinct cubes, clear labels) to atmospheric (soft ink washes, dissolved forms).

### Phase 7: History

- After generation completes (music finishes or user stops), save the full parameter set to localStorage:
  - `MoodParameters` object
  - Keyboard raw data (keys[], timestamps)
  - Image analysis results (if applicable)
  - Timestamp
  - Optional: a derived color palette thumbnail (just the 3-4 dominant colors)
- **History panel:** A small side panel or bottom drawer accessible via an icon/button.
  - Shows past sessions as cards.
  - Each card: color palette thumbnail + timestamp + maybe cluster count.
  - Click a card → regenerate that session. Since all parameters are saved, Tone.js and Three.js reproduce the same output deterministically.
- Keep it simple. localStorage, no pagination needed for an MVP.

## Mapping Algorithm

This is the brain of the product. Two input streams merge into one `MoodParameters` object.

### Keyboard Data → Structure Parameters

| Keyboard Metric | Maps To | Logic |
|---|---|---|
| `totalDuration` | Track length | Longer mash = longer track (e.g., 2s mash → 30s track, 10s mash → 90s track). Clamp to min 20s, max 120s. |
| `keyCount` | Note density | More keys = more notes per bar. Map to a range like 2-12 notes per bar. |
| `averageVelocity` | Tempo / BPM | Faster mashing = slightly faster tempo. But keep it calm — map to range 50-90 BPM. Even frantic mashing shouldn't produce fast music. The transformation from chaos to calm is the point. |
| `rhythmVariance` | Rhythmic regularity | Low variance (even mashing) = steady, regular note timing. High variance (erratic) = more syncopated, irregular patterns. Both can sound good. |
| `keyPositions` | Stereo panning / pitch range | Left-side keyboard keys → notes panned left / lower pitch. Right-side → panned right / higher pitch. Top row → higher octave. Bottom row → lower. |
| Cluster count | Number of musical "layers" or voices | Each cluster could map to a distinct voice/instrument layer in Tone.js. More clusters = richer arrangement. |
| Cluster sizes | Layer prominence | Bigger clusters = louder/more prominent voice. Small clusters or single keys = quiet, background texture. |

### Image Data → Character Parameters

| Image Metric | Maps To | Logic |
|---|---|---|
| MobileNet classification | Scale / mood preset | Build a lookup table mapping common categories to musical moods. "ocean"/"beach" → Mixolydian, watery reverb. "forest"/"tree" → Major pentatonic, organic delay. "sunset"/"sunrise" → Lydian, warm pad. "city"/"building" → Minor, shorter notes. "dog"/"cat"/"animal" → Playful major, staccato. Default/unknown → Pentatonic (safe, always pleasant). |
| Dominant hue | Instrument timbre | Warm hues (reds, oranges, yellows: 0-60°, 300-360°) → warm sine wave pads, soft FM synth. Cool hues (blues, greens: 120-260°) → crystalline triangle wave, bell-like tones. Neutral (low saturation) → simple sine, very clean. |
| Brightness (0-1) | Reverb amount | Dark images (brightness < 0.3) → heavy reverb, spacious, distant. Mid (0.3-0.7) → moderate reverb. Bright (> 0.7) → dry, present, intimate. |
| Color variance | Harmonic complexity | Low variance (monotone image) → stay on fewer notes (3-4 note patterns). High variance (colorful) → wider intervals, use more of the scale, more chord variation. |
| Warm/cool ratio | Major vs minor leaning | Predominantly warm → lean major / bright modes. Predominantly cool → lean minor / darker modes. Balanced → use modes that sit in between (Dorian, Mixolydian). |

### No Image Fallback

If no photo is uploaded, derive character parameters from keyboard data:
- Use `averageVelocity` for timbre (fast = bright, crystalline / slow = warm, padded)
- Use `keyCount` for harmonic complexity (more keys = more complex)
- Use `rhythmVariance` for major/minor leaning (steady = major, erratic = minor)
- Default to pentatonic scale (always sounds good)
- Default color palette: monochrome ink tones (black, dark grey, warm grey)

### The MoodParameters Object

```typescript
interface MoodParameters {
  // Structure (from keyboard)
  trackLengthSeconds: number;       // 20-120
  noteDensity: number;              // 2-12 notes per bar
  bpm: number;                      // 50-90
  rhythmRegularity: number;         // 0 (erratic) to 1 (steady)
  stereoPanBias: number;            // -1 (left) to 1 (right)
  pitchRange: [number, number];     // MIDI note range
  clusterLayers: ClusterLayer[];    // per-cluster musical config

  // Character (from image or keyboard fallback)
  scale: string;                    // e.g., "pentatonic_major", "mixolydian", "lydian"
  timbre: string;                   // e.g., "sine_pad", "triangle_bell", "fm_warm"
  reverbWet: number;                // 0-1
  harmonicComplexity: number;       // 0 (simple) to 1 (complex)
  moodValence: number;              // -1 (dark/minor) to 1 (bright/major)

  // Visual (derived from both)
  colorPalette: string[];           // hex colors for voxels, ink bleed, lines
  inkWeight: number;                // line thickness base
  inkStyle: 'smooth' | 'wavy' | 'jittery';
  bleedIntensity: number;           // how dramatically the ink bleeds during playback
}

interface ClusterLayer {
  clusterIndex: number;
  noteCount: number;
  velocity: number;
  prominence: number;               // 0-1, maps to volume
  panPosition: number;              // -1 to 1
}
```

## Tone.js Music Generation

### Approach

The music generation should produce genuinely calming, pleasant audio. Key constraints:

- **Always use pentatonic-safe scales** as the foundation. Even when using modes like Lydian or Mixolydian, constrain note selection to intervals that resolve pleasantly.
- **Long sustained notes with overlap** — not staccato blips. Each note should ring and decay naturally.
- **Heavy reverb and delay** — creates spaciousness and the "calming" quality.
- **Slow attack, slow release** on all synth envelopes.
- **Layered voices:** Each cluster maps to a musical voice/layer. Voices play overlapping patterns at different rates, creating generative ambient texture.
- **Controlled randomness:** Notes are selected from the scale with weighted probability (favor root, fifth, octave). Timing has slight human-feel variation (±20ms). Each generation from the same parameters should sound similar but not identical — unless we want deterministic replay for history, in which case seed the randomness.

### Deterministic Replay

For history to work, the random note selection must be seedable. Use a seeded PRNG (e.g., Mulberry32) initialized from a hash of the raw keyboard + image data. Same seed → same sequence of "random" choices → same music.

### FFT for Visual Reactivity

During playback, use `Tone.FFT` or `Tone.Waveform` to get real-time frequency/amplitude data. Pass this to the Three.js render loop to drive subtle voxel pulsing:
- Overall amplitude → slight uniform scale pulse on all cubes (e.g., scale 1.0 → 1.05 on beats)
- Low frequency energy → slow positional drift of clusters
- Keep it SUBTLE. The cubes should breathe, not bounce.

## Three.js Scene Architecture

### Scene Setup

- **Camera:** Fixed perspective camera. No OrbitControls. Subtle automatic drift (slow rotation or position sway) to keep the scene feeling alive. Camera should frame all clusters comfortably with some padding.
- **Lighting:** Soft ambient light + one directional light for subtle depth. No harsh shadows. Shadows should be ink-wash style (soft, diffused) or disabled entirely if the ink shader handles depth perception.
- **Background plane:** A large plane behind the voxels with the procedural paper texture shader. This plane also receives the ink bleed effect during playback.
- **Renderer:** `THREE.WebGLRenderer` with antialiasing. Transparent background off (the paper shader IS the background).

### Voxel Cubes

- Geometry: `THREE.BoxGeometry` — small, uniform size (e.g., 0.3-0.5 units).
- Material: `THREE.ShaderMaterial` with custom vertex + fragment shaders for the ink aesthetic.
  - Vertex shader: slight noise displacement on vertices for organic edges.
  - Fragment shader: ink-density opacity variation, bristle-like texture via noise, color from MoodParameters.
- Key label texture: Generated via offscreen canvas per unique key. Cached in a texture atlas or map. Applied as a texture map blended with the ink shader. Character style should look hand-drawn / ink-brushed. Consider using a font like "Caveat", "Patrick Hand", or similar hand-drawn web font rendered onto the canvas.
- During playback bleed: animate shader uniforms to increase noise displacement, decrease opacity, spread color outward.

### Clusters

- Each cluster is a `THREE.Group` containing its voxel cubes.
- Cubes within a group: positioned with random offset from cluster center (x: ±1, y: ±1, z: ±0.5). Loose, floating, not grid-aligned.
- Cluster positions: distributed across the viewport. Use a simple force-directed or random placement with minimum distance between clusters to avoid overlap.
- Photo cluster: same structure but cube face textures are image tile fragments instead of key labels. Image sliced into N tiles (where N = number of cubes in photo cluster, e.g., 9-16). Each tile mapped to one cube's faces.

### Connecting Lines (Cursor Interaction)

- Use `THREE.Raycaster` from camera through mouse position.
- Detect clusters within a radius of the cursor's projected world position.
- For each nearby cluster, draw a line from cluster center to cursor position.
- Line geometry: `THREE.BufferGeometry` with multiple points along the path. Apply noise displacement to intermediate points for the wobbly ink-stroke effect. Update every frame.
- Line material: `THREE.ShaderMaterial` or `THREE.LineBasicMaterial` with varying opacity. For thickness variation, may need `THREE.MeshLine` (or a tube geometry / custom shader) since native Three.js lines have limited width control.
- Line weight: driven by `inkWeight` from MoodParameters. Heavier mood = thicker. Lighter = thinner.
- Line style (wavy, jittery, smooth): driven by `inkStyle` from MoodParameters. Control the noise frequency/amplitude on the displacement.

### Ink Bleed Effect (Playback)

This is the climax visual effect. Implementation approach:

- **Background plane shader** receives uniform data about cluster positions and colors.
- On playback start, animate a "spread" uniform that grows over time.
- For each cluster origin point, the shader calculates distance and draws ink-bleed patterns using noise functions. The bleed edge is organic (fractal noise boundary, not circular).
- Multiple cluster bleeds overlap and blend where they meet.
- Animate over the duration of the track — slow spread, reaching near-full coverage by track end.
- The voxel cubes' own shaders simultaneously soften: increase noise displacement, reduce opacity, fade key labels.

### Build-Up Animation

- Start with empty scene (just background paper plane).
- Clusters appear one at a time, staggered by 300-500ms.
- Within each cluster, cubes animate in rapidly (50-100ms between each cube).
- Cube entrance: could scale from 0 → 1, or fade in from 0 opacity, or drop in from above with slight bounce (pick one, keep it clean).
- Photo cluster appears LAST with a slightly more dramatic entrance.
- After all clusters placed, pause briefly (500ms), then enable cursor interaction (lines activate on mouse move).
- Total build-up: roughly 2-5 seconds.

### Playback Visual Sync

- On play: input bar morphs into player (CSS/DOM transition).
- Start ink bleed animation (shader uniforms).
- Start FFT-driven voxel pulsing.
- Cubes gently breathe: `cube.scale.setScalar(1 + amplitude * 0.05)` per frame.
- Optional: slow cluster position drift synced to low-frequency energy.
- On track end: ink bleed holds at final state. Cubes remain in dissolved state. Player shows "replay" or allows navigating to history.

## Project Structure

```
serenity-sounds/
├── index.html                  # Entry point
├── src/
│   ├── main.js                 # App initialization, phase management
│   ├── config.js               # Constants, thresholds, scale definitions
│   │
│   ├── input/
│   │   ├── KeyboardCapture.js  # Mashing detection, raw data collection
│   │   ├── ImageUpload.js      # File upload handling, thumbnail preview
│   │   └── InputAnalyzer.js    # Process raw keyboard data → cluster detection
│   │
│   ├── analysis/
│   │   ├── ImageAnalyzer.js    # MobileNet classification + pixel analysis
│   │   ├── MoodMapper.js       # Merge keyboard + image data → MoodParameters
│   │   └── ScaleLookup.js      # Category → musical scale/mood mapping table
│   │
│   ├── audio/
│   │   ├── MusicGenerator.js   # Tone.js setup, voice creation, sequencing
│   │   ├── AudioReactive.js    # FFT analysis, amplitude extraction for visuals
│   │   └── SeededRandom.js     # Mulberry32 PRNG for deterministic replay
│   │
│   ├── visual/
│   │   ├── SceneManager.js     # Three.js scene, camera, renderer, lights
│   │   ├── VoxelCluster.js     # Cluster group creation, cube placement
│   │   ├── VoxelCube.js        # Individual cube: geometry, shader material, label texture
│   │   ├── PhotoCluster.js     # Photo-specific cluster: image tiling, texture mapping
│   │   ├── CursorInteraction.js # Raycaster, line drawing, proximity detection
│   │   ├── InkBleed.js         # Background plane shader, bleed animation
│   │   ├── BuildUpAnimator.js  # Staggered cluster/cube entrance animations
│   │   └── PlaybackAnimator.js # FFT-driven pulsing, bleed progression, dissolve
│   │
│   ├── shaders/
│   │   ├── inkVoxel.vert       # Vertex shader: noise displacement on cube vertices
│   │   ├── inkVoxel.frag       # Fragment shader: ink texture, bristle, opacity
│   │   ├── paperBackground.vert
│   │   ├── paperBackground.frag # Procedural paper texture + ink bleed receiver
│   │   ├── inkLine.vert
│   │   └── inkLine.frag        # Wobbly ink-stroke lines
│   │
│   ├── ui/
│   │   ├── LandingPage.js      # Landing page DOM: tagline, Try Demo, Sign Up
│   │   ├── InputBar.js         # Input bar DOM + transform to player
│   │   ├── Player.js           # Play/pause, progress, controls
│   │   └── HistoryPanel.js     # Side panel / drawer, session cards, replay trigger
│   │
│   └── utils/
│       ├── colorUtils.js       # Dominant color extraction, hue analysis, warm/cool
│       ├── textureCache.js     # Canvas-rendered key label textures, cached per character
│       └── localStorage.js     # Save/load MoodParameters + session data
│
├── assets/
│   └── fonts/                  # Hand-drawn web font for key labels
│
├── styles/
│   └── main.css                # Minimal CSS for DOM UI elements (landing, input bar, player, history)
```

## Implementation Priority

Given the 5-hour budget, prioritize in this order:

### Must Have (Core Experience)
1. Landing page with "Try Demo" entry
2. Keyboard mashing capture + cluster detection
3. Basic MoodParameters mapping (even simplified)
4. Three.js scene with voxel cubes + key labels in clusters
5. Build-up animation (clusters appearing)
6. Tone.js music generation from parameters (even basic ambient loops)
7. Player UI (play/pause)

### Should Have (Polish)
8. Image upload + MobileNet analysis + pixel analysis
9. Photo cluster with image tile textures
10. Cursor interaction with connecting ink lines
11. Ink bleed effect during playback
12. FFT-driven subtle voxel pulsing
13. History (localStorage save + replay)

### Nice to Have (If Time Permits)
14. Full ink shader on voxel surfaces (noise displacement, bristle texture)
15. Procedural paper background shader
16. Advanced line styles (wavy, jittery based on mood)
17. Polished transitions between all phases
18. Sign up modal

## Key Design Decisions (For Video Walkthrough)

These are the intentional product/design choices to articulate in the Loom video:

1. **Keyboard mashing as input reinterpretation.** The brief says "text input" — we deliberately reinterpret this. The product cares about the *physical act* of typing (rhythm, velocity, duration), not the semantic content. This is a design decision: the chaos of mashing becomes the raw material for serenity.

2. **Demo-first, no gating.** The demo IS the product. Letting users experience it immediately is more compelling than any signup wall. Sign up is available but never required.

3. **Unified ink-on-paper visual language.** Rather than mixing visual styles (3D cubes + separate ink effects), everything shares one aesthetic language. Voxels ARE ink. Lines ARE brush strokes. The bleed isn't added on top — it's the cubes themselves dissolving.

4. **Browser-only, no APIs.** The entire experience runs client-side. This is a scalability choice — zero server costs, instant generation, works offline. In a production roadmap, API-based music generation (Suno, MusicGen) could replace Tone.js for higher quality output.

5. **Chaos-to-serenity narrative arc.** The UX phases mirror an emotional journey: chaotic input → structured visualization → serene dissolution. The product doesn't just generate music — it transforms the user's energy.

6. **Deterministic replay via seeded PRNG.** History works because the same parameters always produce the same output. No need to store audio files — just the parameter set.

## Development Notes

- No build tool. Plain HTML + ES modules. Serve locally with `npx serve` or `python3 -m http.server`.
- Import all libraries via CDN using ES module imports in a `<script type="module">`:
  - Three.js: `import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'` or use unpkg/esm.sh for ES module build: `import * as THREE from 'https://esm.sh/three@0.160.0'`
  - Tone.js: `import * as Tone from 'https://esm.sh/tone@14.7.77'`
  - TensorFlow.js + MobileNet: `import * as tf from 'https://esm.sh/@tensorflow/tfjs'` and `import * as mobilenet from 'https://esm.sh/@tensorflow-models/mobilenet'`
- GLSL shaders can be inlined as template literal strings in JS files, or loaded via fetch from separate .glsl/.vert/.frag files.
- MobileNet model loads async — show loading indicator on first use. Consider preloading after landing page renders.
- Test with various image types: landscapes, objects, abstract, dark, bright, colorful, monotone.
- Test with various mashing styles: fast bursts, slow deliberate, mixed rhythms, very short, very long.
- The pentatonic scale is the safety net — if all else fails, pentatonic + slow tempo + heavy reverb = calming music guaranteed.
- For the ink shader, start simple (basic noise-based opacity variation) and layer complexity if time permits.
- The GLSL shaders are the hardest part to get right aesthetically. Budget time for iteration.
