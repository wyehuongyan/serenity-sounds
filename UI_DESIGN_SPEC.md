# UI Design Spec — Serenity Sounds

## Critical Design Philosophy

This is NOT a web app. This is a full-screen immersive art installation that happens to live in a browser. There are NO cards, NO panels, NO two-column layouts, NO containers, NO boxes, NO sections. The entire viewport is one continuous canvas. UI elements float over the scene like ghostly overlays — minimal, translucent, almost reluctant to be there.

Think: a museum projection room where you walk up to a single glowing prompt on the wall.

## Global Rules

- **Full viewport.** Every phase uses 100vw × 100vh. No scrolling. No page structure.
- **NO cards or containers.** Nothing has a background box, border, or card wrapper. UI elements exist directly on the canvas with no enclosure.
- **NO gradients.** Not in CSS, not anywhere. Flat colors, ink effects, and opacity only.
- **NO beige/cream/warm-neutral backgrounds.** The base is dark — near-black (`#0a0a0a` to `#121210`) with a very subtle warm undertone, like ink-saturated paper. This is wet ink on dark handmade paper, not a wellness blog.
- **NO script/cursive/italic body fonts.** Typography is quiet and modern. Use a refined sans-serif with character — something like "DM Sans", "Satoshi", "General Sans", or "Outfit". Light weight (300-400) for body, medium (500) for emphasis. The font should feel calm and precise, not decorative.
- **Heading font:** "Serenity Sounds" title can use a distinctive serif or display font — something with ink-brush energy but still clean. Consider "Fraunces", "Playfair Display", or "Cormorant Garamond" in a light weight. NOT heavy/black weight. Light and airy.
- **Text color:** Off-white (`#e8e4df`) for primary text, muted warm grey (`#8a8580`) for secondary/supporting text. Never pure white.
- **Accent color:** A single muted ink tone — desaturated indigo (`#4a4560`) or warm charcoal (`#3d3832`). Used sparingly for interactive elements.
- **Opacity and blur are your primary tools** for creating hierarchy and depth — not boxes, borders, or background colors.
- **Transitions between phases** should be smooth fades/morphs, never hard page swaps.

## Phase 1: Landing

### What the user sees:
A nearly empty dark screen. Vast negative space. The product name and a single entry point.

### Layout:
- Full viewport, dark background.
- **"Serenity Sounds"** — positioned upper-left area, but not crammed into the corner. Give it room. Large display font, light weight, off-white. Subtle letter-spacing. This is the only large text on screen.
- **Tagline** — directly below the title, in the secondary muted grey color, small size. Something like "Transform chaos into calm." One line. No paragraph of explanation.
- **"Begin" button** — centered in the viewport, vertically and horizontally. This is the focal point of the entire screen. It should be understated: just the word "Begin" in off-white, perhaps with a subtle circle outline around it, or just the text alone with a gentle pulse animation (opacity 0.5 → 1.0, slow cycle, ~3 seconds). No filled button, no dark background rectangle, no heavy styling. When hovered, a subtle expansion or brightness increase.
- **"Sign up" link** — bottom-right corner, very small, muted grey. Almost invisible unless you look for it. Just text, no input field on this screen. Clicking opens a minimal modal overlay (see below).
- **Nothing else.** No description paragraph, no feature list, no cards, no sections. The emptiness IS the design. It signals that something immersive is about to happen.

### Sign-up modal (if clicked):
- Dark semi-transparent overlay (`rgba(10,10,10,0.85)`) with backdrop blur.
- Centered: a single email input field (no box — just a bottom border line, off-white, with placeholder text "your@email.com") and a small "Submit" text button next to it.
- Small "×" to close. That's it.

### Transition to Phase 2:
- On clicking "Begin", the title and tagline fade out (opacity → 0, ~600ms).
- The "Begin" button morphs into the input bar (expands horizontally, slight upward drift to center-screen position).
- Seamless. No page navigation, no flash of new content.

## Phase 2: Input (Mashing)

### What the user sees:
An almost empty dark screen with a single floating input bar in the center. An invitation to let loose.

### Layout:
- Full viewport, same dark background. The Three.js canvas is already initialized but showing nothing yet (or an extremely subtle particle drift — like dust motes barely visible, hinting at the space being alive).
- **Input bar** — horizontally centered, vertically centered (or slightly above center, ~40% from top). It's a single text input:
  - Width: ~500-600px max. Not full-width. Not cramped.
  - No border, no box. Just a thin bottom line (1px, off-white at ~30% opacity).
  - Placeholder text: "Let it out..." in muted grey, light weight.
  - Text input color: off-white.
  - Font: same body sans-serif, regular weight, ~18-20px.
  - The input bar has a very subtle ambient glow beneath it — not a shadow, more like a faint light emission (a radial bit of warmth, very low opacity, using a pseudo-element or soft box-shadow with large spread and near-zero opacity).
- **Image upload** — a small icon to the right of the input bar. Just a minimal line icon (a small "+" or camera outline), muted grey, ~16px. On hover, brightens to off-white. Clicking opens file picker. When a photo is uploaded, the icon changes to a tiny thumbnail (24×24px circle-clipped preview) replacing the icon.
- **"Generate" button** — does NOT exist initially. After ≥10 keystrokes, a small text appears below the input bar: "Generate →" in off-white, fading in (opacity 0 → 1 over 400ms). Just text, right-aligned under the input bar. Clicking triggers processing. Alternatively, it could appear as a subtle arrow icon at the right end of the input bar itself.
- **Keystroke counter** — very subtle, bottom-center of viewport, tiny muted text showing count. Like "47 keystrokes" in very small type, ~12px, at 40% opacity. Optional — only if it doesn't clutter.
- **No title visible.** No "Express yourself" heading, no "Input" label, no instructions paragraph. The placeholder text is the only instruction. If we must provide guidance, a single line of tiny muted text below the input bar on first load: "type freely — rhythm matters, words don't" that fades out after the first keypress.

### Real-time mashing feedback:
- As the user types, the bottom line of the input bar could subtly pulse in brightness with each keypress.
- Very faint ink-like particles could emit from the cursor position within the input bar — tiny dots that drift downward and fade. Like ink dripping from a pen. Keep this extremely subtle.
- The background dust motes (if present) could very slightly increase in activity/speed as more keys are pressed, hinting at energy building.

### Transition to Phase 3 (Processing):
- Input bar content fades out (the typed text dissolves).
- The input bar itself dims slightly.
- A very subtle pulsing animation on the bar indicates processing (~1-3 seconds).
- Then transitions into the environment build-up.

## Phase 3-4: Environment Build-Up

### What the user sees:
The input bar is still visible (dimmed) as voxel clusters begin materializing in the 3D space around it.

### Layout:
- The Three.js canvas fills the entire viewport (it always did — it was just empty before).
- The input bar remains in its centered position but dims to ~30% opacity, becoming part of the background. It will transform into the player later.
- Voxel clusters animate into existence in the 3D space surrounding the input bar's screen position. The bar is conceptually the "origin" — clusters appear around it as if the typed energy is radiating outward.
- No other UI elements are visible during build-up. Let the 3D animation be the entire focus.

## Phase 5: Interaction + Player

### What the user sees:
The 3D environment is fully built. Voxel clusters float in space. The input bar has transformed into a player.

### Player UI:
- The input bar morphs into a player: the bottom line remains, but the text content is replaced with playback controls.
- **Layout of player:** same position, same width as the input bar. Horizontally centered.
  - Left side: a play/pause icon (minimal line icon, ▶ / ❚❚, off-white).
  - Center: a thin progress line (same style as the input bar bottom line) that fills left-to-right as the track plays. Filled portion in off-white at 60% opacity, unfilled at 20% opacity.
  - Right side: elapsed time in tiny muted text (e.g., "0:34 / 1:12").
- The player should feel like it IS the input bar, just in a different state. Same position, same line, same weight. The transformation should be so smooth it feels like the bar evolved rather than being replaced.
- **No box around the player.** No card. No background. Just the line, the icon, and the time. Floating.

### Cursor interaction:
- As the user moves their cursor, ink-styled vector lines connect nearby clusters to the cursor.
- No additional UI is needed — this is all happening in the Three.js scene.

### History access:
- A very small icon in the bottom-left corner — maybe three horizontal lines or a small clock icon, ~14px, muted grey at 40% opacity. Barely visible.
- On hover: brightens. On click: history drawer slides in from the left.

## Phase 6: Playback

### What the user sees:
Music playing. The scene is alive. Ink bleeding. Voxels breathing.

### UI behavior during playback:
- The player progress line fills as the track plays.
- All other UI fades to near-invisible (the history icon, any remaining text) — just the player and the 3D scene.
- The background shifts through the ink bleed effect (handled by Three.js shaders, not CSS).
- On track end: the play icon becomes a "↻" replay icon. A small "New" text link appears to the right of the player to start a fresh session. The "Generate" flow resets.

## History Drawer

### What the user sees:
A minimal overlay from the left edge showing past sessions.

### Layout:
- **NOT a card panel.** A semi-transparent dark overlay (`rgba(10,10,10,0.9)`) with backdrop blur, sliding in from the left edge. Width: ~300px.
- **No border on the right edge.** The overlay just fades or bleeds into the scene.
- Each past session is a row:
  - A horizontal strip of 3-4 small color swatches (12×12px circles or squares) representing the session's derived color palette.
  - Timestamp text next to it: "2 hours ago" or "Mar 26" in muted grey, small.
  - On hover: the row brightens slightly.
  - On click: regenerates that session (close drawer, rebuild scene).
- Sessions listed vertically, most recent at top.
- Small "×" at top-right of drawer to close.
- **No titles, no headers, no "History" label.** The context is obvious.

## Responsive / Sizing Notes

- Input bar and player max-width ~500-600px, centered. On narrow screens, add horizontal padding (24px each side) and let it shrink.
- Voxel clusters should be distributed within the camera frustum regardless of viewport size.
- The experience is designed for desktop (mouse cursor interaction is core). On mobile, cursor interaction can be replaced with touch-drag or simply disabled. The core experience (mashing, generation, playback) still works.
- Player controls should be touch-friendly on mobile (larger tap targets, ~44px minimum).

## What This Should NOT Look Like

- NOT a SaaS landing page with hero sections and feature grids.
- NOT a music player app with sidebar navigation.
- NOT a form with labels, descriptions, and submit buttons in cards.
- NOT a wellness/meditation app with soft pastels and rounded everything.
- NOT a portfolio site with sections and scroll.

## What This SHOULD Feel Like

- A dark room where a single point of light invites you forward.
- A museum installation — immersive, minimal, spatial.
- The UI disappears the moment the art begins.
- Every element earns its place by being essential. If you can remove it without losing function, remove it.
