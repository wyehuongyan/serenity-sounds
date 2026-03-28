import * as THREE from 'https://esm.sh/three@0.160.0';

// ─── Settings ────────────────────────────────────────────────────────────────

const CUBE_SPACING = 3.5;
const MINI_SCALE    = 0.055;
const HOVER_RADIUS = 3.35;
const BRANCH_HOVER_RADIUS = 1.45;
const BRANCH_KINTSUGI_COLOR = "#c9a35a";
const LINE_SEGMENTS = 48; // Higher res for smooth braiding
const CURSOR_TRAIL_SEGMENTS = 96;
const GRAPH_THREAD_SEGMENTS = 36;
const GRAPH_THREAD_WIDTH = 0.048;
const GRAPH_THREAD_AUDIO_WIDTH = 0.008;
const GRAPH_THREAD_BASE_OPACITY = 0.085;
const LINE_RADIUS   = 3.2;
const LINE_RELEASE_RADIUS = 4.0;
const CURSOR_RELAXATION = 0.12;
const RIBBON_TIP_RELAXATION = 0.26;
const TRAIL_SHOULDER_INDEX = 4;
const TRAIL_BRANCH_ANCHOR_BLEND = 0.76;
const TRAIL_BRANCH_BACKSTEP = 2.6;
const TRAIL_BRANCH_SOURCE_SPREAD = 0.12;
const TRAIL_HEAD_PULL = 0.34;
const TRAIL_FADE_PULL = 0.08;
const STROKE_POINT_LIFETIME = 26.0;
const STROKE_RENDER_LIFETIME = 6.5;
const STROKE_MIN_SAMPLE_DIST = 0.09;
const STROKE_MAX_POINTS = 260;
const STROKE_IDLE_SAMPLE_DIST = 0.026;
const STROKE_IDLE_SAMPLE_INTERVAL = 0.12;
const IDLE_HEAD_WAVE_RADIUS = 0.12;
const IDLE_HEAD_WAVE_LIFT = 0.024;
const IDLE_HEAD_PULL = 0.09;
const IDLE_TRAIL_SWAY = 0.08;
const STONE_CARESS_RADIUS = 2.3;
const STONE_CARESS_PULL = 0.075;
const STONE_CARESS_SWIRL = 0.11;
const BRANCH_ORBIT_RADIUS = 0.62;
const BRANCH_ORBIT_LIFT = 0.22;
const BRANCH_LINGER_DECAY = 0.006;
const BRANCH_RESIDUAL_PULL = 0.05;
const BRANCH_ROOT_PULL = 0.3;
const BRANCH_ACTIVE_PULL = 0.03;
const BRANCH_RELEASE_PULL_SOFT = 0.022;
const BRANCH_REACH_PULL = 0.028;
const BRANCH_RELEASE_REACH = 0.008;
const BRANCH_SWITCH_BIAS = 0.42;
const BRANCH_ACQUIRE_RADIUS = 2.7;
const BRANCH_SWITCH_RADIUS = 2.25;
const BRANCH_RELEASE_RADIUS = 3.45;
const BRANCH_HARD_RELEASE_RADIUS = 4.6;
const BRANCH_SWITCH_ADVANTAGE = 0.16;
const BRANCH_MAX_CLAIMS = 4;
const BRANCH_MIN_HOLD_TIME = 0.85;
const BRANCH_DRAW_PULL = 0.04;
const BRANCH_DRAW_RELEASE = 0.018;
const FILAMENT_GROW_SPEED = 0.34;
const FILAMENT_WRAP_SPEED = 0.3;
const FILAMENT_UNWIND_SPEED = 0.22;
const FILAMENT_LINGER_TIME = 2.5;
const FILAMENT_IDLE_HOLD_TIME = 4.2;
const FILAMENT_LINGER_SWAY = 0.2;
const FILAMENT_COOLDOWN_TIME = 0.18;
const FILAMENT_SURFACE_ARC = 1.55;
const MOBILE_GRAPH_GEOMETRY_INTERVAL = 1 / 24;

// ─── Shared Shaders ─────────────────────────────────────────────────────────

const GLSL_NOISE = /* glsl */`
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float noise2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0,0.0)), f.x),
             mix(hash21(i + vec2(0.0,1.0)), hash21(i + vec2(1.0,1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise2(p); p *= 2.1; a *= 0.5; }
  return v;
}

float hash31(vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
}
float noise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
        mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
        mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float v = 0.0; float a = 0.45;
  for (int i = 0; i < 3; i++) { v += a * noise3(p); p *= 2.2; a *= 0.5; }
  return v;
}
`;

const PAPER_VERT = /* glsl */`
  uniform float uTime;
  uniform float uPlayback;
  varying vec2  vUv;
  varying float vHeight;

  float clothWave(vec2 p, float t) {
    return sin(p.x * 0.35 + t * 0.22) * 0.85
         + cos(p.y * 0.28 + t * 0.18) * 0.65
         + sin(p.x * 0.72 + p.y * 0.35 + t * 0.42) * 0.22
         + cos(p.x * 0.58 - p.y * 0.62 + t * 0.35) * 0.15;
  }

  void main() {
    vUv = uv; vHeight = 0.0;
    vec3 pos = position;
    if (uPlayback > 0.005) {
      float wave = clothWave(pos.xy, uTime);
      pos.z += wave * 0.45 * uPlayback;
      vHeight = wave;
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const PAPER_FRAG = /* glsl */`
  varying vec2  vUv;
  varying float vHeight;
  uniform float uPlayback;
  uniform float uTime;
  uniform float uTheme;
  uniform vec2  uRippleOrigin;
  uniform float uRippleAge;
  uniform float uHover;    // 0 -> 1 dramatic hover intensity
  uniform vec2  uCursorPos; // Cursor UV for hover halo
  
  uniform float uLandingRipple;
  uniform float uLandingHover;
  uniform float uLandingTap;
  uniform vec2  uLandingOrigin;
  ${GLSL_NOISE}

  void main() {
    vec3 baseColD = vec3(0.015, 0.016, 0.018); 
    vec3 skyColD  = vec3(0.06, 0.08, 0.12);
    vec3 baseColL = vec3(0.96, 0.95, 0.91); 
    vec3 skyColL  = vec3(0.7, 0.8, 0.9);

    vec3 baseCol = mix(baseColD, baseColL, uTheme);
    vec3 skyCol  = mix(skyColD,  skyColL,  uTheme);
    
    float grain = hash21(vUv * 500.0) * 0.04;
    float mottle = fbm(vUv * 3.5) * 0.1;
    float swirl = fbm(vUv * 2.0 + uTime * 0.01);
    vec3 inkSwirlD = mix(vec3(0.03, 0.035, 0.045), baseColD, swirl);
    vec3 inkSwirlL = mix(vec3(0.9, 0.88, 0.82), baseColL, swirl);
    vec3 inkSwirl  = mix(inkSwirlD, inkSwirlL, uTheme);
    
    float fresnel = pow(1.2 - max(0.0, 1.0 - abs(vHeight * 0.15)), 5.0);
    float sheen = smoothstep(-0.2, 0.8, vHeight) * 0.02 * (0.2 + uPlayback);

    vec3 col = mix(baseCol, inkSwirl, 0.3) + mix(grain, -grain, uTheme) - mottle * 0.25;
    col = mix(col, skyCol, fresnel * 0.04 * (0.2 + uPlayback)) + sheen;

    if (uLandingRipple > 0.0) {
      vec2 center = uLandingOrigin;
      float dist = length(vUv - center) * 100.0;
      
      // Continuous, visible tiny droplets (magnetic liquid feel)
      float p1 = dist * 1.8 - uTime * 2.0; 
      float p2 = dist * 2.5 - uTime * 3.1; // Secondary harmonic
      
      float baseD = cos(p1) * 0.7 + cos(p2) * 0.3; // Complex Specular derivative
      float envelope = exp(-dist * 0.06); // Let ripples travel further before fading
      
      // Hover deepens the 3D displacement
      float hoverAmp = mix(0.7, 1.8, uLandingHover); // Stronger base amplitude
      float finalD = baseD * envelope * hoverAmp;
      
      // Tap causes a single, massive Gaussian swell (Soliton)
      float tapD = 0.0;
      if (uLandingTap >= 0.0) {
        float ringRad = uLandingTap * 15.0; // Expand gently at 15 units/sec
        float tapDist = dist - ringRad;
        
        // Gaussian envelope isolates a single intense crest and trough
        float tapWave = sin(tapDist * 0.25); 
        float tapEnvelope = exp(-tapDist * tapDist * 0.015) * exp(-uLandingTap * 0.3);
        tapD = tapWave * tapEnvelope * 4.5; // Significant depth and weight
      }
      
      finalD += tapD;

      // Realistic 3D water highlight and deep shadow based on slope
      float spec = max(0.0, finalD) * 0.18; // Much stronger highlight for visibility
      float shadow = max(0.0, -finalD) * 0.12; // Deeper shading
      
      vec3 lightGloss = vec3(0.95, 0.98, 1.0);  // Brilliant sheen
      vec3 darkGloss  = vec3(0.25, 0.35, 0.5);  // Deep bioluminescent sheen
      vec3 gloss = mix(darkGloss, lightGloss, uTheme);
      vec3 shade = mix(vec3(0.01), vec3(0.06), uTheme); // Dense shadow basin
      
      col += gloss * spec * uLandingRipple;
      col -= shade * shadow * uLandingRipple;
    }

    // ── Dramatic Hover Bleed ──
    if (uHover > 0.01) {
      float hDist = length(vUv - uCursorPos);
      float hBleed = smoothstep(0.18 * uHover, 0.0, hDist);
      float hEdge  = fbm(vUv * 15.0 + uTime * 0.1) * 0.15;
      float finalHalo = smoothstep(0.5, 0.2, hDist / (0.12 + hEdge)) * uHover * 0.12;
      col = mix(col, mix(col, vec3(0.02), 0.4), finalHalo);
    }

    if (uRippleAge >= 0.0) {
      float dist = length(vUv - uRippleOrigin) * 100.0;
      float ringRad = uRippleAge * 15.0;
      float tapDist = dist - ringRad;
      
      float tapWave = sin(tapDist * 0.35); 
      float tapEnvelope = exp(-tapDist * tapDist * 0.02) * exp(-uRippleAge * 0.45);
      
      float spec = max(0.0, tapWave * tapEnvelope * 3.5) * 0.12;
      float shadow = max(0.0, -tapWave * tapEnvelope * 3.5) * 0.08;

      vec3 gloss = mix(vec3(0.2, 0.3, 0.5), vec3(0.85, 0.9, 1.0), uTheme);
      col += gloss * spec;
      col -= vec3(1.0) * shadow;
    }
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }
`;

const BEGIN_CUBE_VERT = /* glsl */`
  uniform float uTime;
  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vPos;
  varying vec3  vWorldPos;
  ${GLSL_NOISE}
  
  void main() {
    vUv = uv; 
    vPos = position;
    
    // Intense, slow breathing liquid displacement
    float time = uTime * 0.3;
    float bump1 = fbm(vec2(position.x * 2.5 + time, position.y * 3.0 - time));
    float bump2 = fbm(vec2(position.y * 2.0 - time*1.2, position.z * 2.8 + time*0.8));
    float bump3 = fbm(vec2(position.z * 3.2 + time*0.5, position.x * 1.8 - time*1.5));
    
    float totalBump = (bump1 + bump2 + bump3) / 3.0 - 0.5;
    
    // Exaggerate displacement for "Zero-G Droplet" look
    vec3 displaced = position + normal * totalBump * 0.22;
    
    // Recalculate procedural normals for perfectly smooth dielectric gloss
    float nx = fbm(vec2(position.y * 4.0 + time, position.x * 5.0));
    float ny = fbm(vec2(position.z * 5.0 - time, position.y * 4.0));
    vec3 pertNormal = normalize(normal + vec3(nx - 0.5, ny - 0.5, 0.0) * 0.9);
    
    vNormal = normalize(normalMatrix * pertNormal);
    vec4 worldPos = modelMatrix * vec4(displaced, 1.0);
    vWorldPos = worldPos.xyz;
    
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const BEGIN_CUBE_FRAG = /* glsl */`
  uniform vec3  uInkColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uTheme;
  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vPos;
  varying vec3  vWorldPos;
  ${GLSL_NOISE}

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(cameraPosition - vWorldPos); 
    float NdotV = max(0.0, dot(N, V));
    
    // Liquid Glass enveloping a rotating trapped star/nebula
    vec3 p3 = vPos * 2.2; 
    
    // The Core: Violent internal nebula
    float swirl = fbm(vec2(fbm(p3.xy + uTime * 0.15), fbm(p3.yz - uTime * 0.2)) * 3.0 + uTime * 0.12);
    float dist = length(vPos);
    
    // Super dense glowing core
    float coreGlow = pow(max(0.0, 1.0 - dist * 2.4), 3.0) * 2.5; 
    
    // Light Mode: Serene Opal core (subtle peach, ivory, and pale cyan instead of full rainbow)
    vec3 opalCol = vec3(
      sin(swirl * 4.0 + uTime) * 0.1 + 0.9,       // Soft Peach/Ivory
      sin(swirl * 4.0 + uTime + 1.5) * 0.15 + 0.85, // Pale Green-white
      sin(swirl * 4.0 + uTime + 3.0) * 0.2 + 0.8  // Gentle Cyan
    );
    vec3 coreL = mix(vec3(0.5, 0.6, 0.7), opalCol, 0.85) * coreGlow * 1.6;
    
    // Dark mode: Refined deep gold
    vec3 goldCol = mix(vec3(0.8, 0.2, 0.0), vec3(1.0, 0.8, 0.2), swirl);
    vec3 coreD = goldCol * coreGlow * 1.8;
    
    vec3 activeCore = mix(coreD, coreL, uTheme);
    
    // The Surface: Flawless liquid glass
    // Refract dark/light surroundings for visibility without overpowering
    float edgeDarkening = pow(1.0 - NdotV, 2.5);
    vec3 lightGlass = mix(vec3(0.98, 0.99, 1.0), vec3(0.15, 0.2, 0.25), edgeDarkening);
    vec3 glassTint = mix(vec3(0.015, 0.02, 0.03), lightGlass, uTheme);
    
    // Subtle Chromatic Aberration Rim (Muted lead-crystal dispersion, not neon bubbles)
    float rimHalo = pow(1.0 - NdotV, mix(4.0, 2.8, uTheme));
    float caPhase = NdotV * 5.0 + uTime * 0.4;
    vec3 chromAb = vec3(
      sin(caPhase) * 0.1 + 0.9,         // Warm edge
      sin(caPhase + 2.0) * 0.1 + 0.9,   // Neutral edge
      sin(caPhase + 4.0) * 0.1 + 0.9    // Cool edge
    ) * rimHalo * mix(0.8, 0.5, uTheme); // Greatly reduced multiplier
    
    // Extreme Specular Glint (Dielectric reflection) to ensure it looks like solid glass
    vec3 L = normalize(vec3(0.8, 1.0, 0.5));
    float spec1 = pow(max(0.0, dot(N, L)), 256.0) * mix(4.0, 2.5, uTheme); 
    float spec2 = pow(max(0.0, dot(N, normalize(vec3(-0.6, 0.4, 0.8)))), 128.0) * mix(1.8, 1.2, uTheme);
    vec3 glint = vec3(1.0, 0.98, 0.96) * (spec1 + spec2);
    
    // Floating star dust embedded in the glass (subtle)
    float dust = pow(fbm(vPos.xyz * 15.0 + uTime * 0.06), 14.0) * mix(4.0, 2.0, uTheme);
    vec3 dustCol = mix(vec3(1.0, 0.8, 0.3), vec3(0.8, 0.9, 1.0), uTheme);

    // Final Glass composition
    vec3 finalCol = glassTint;
    
    // Core glow penetrating the solid glass
    finalCol += activeCore * mix(0.7, 0.8, uTheme); 
    
    // Add realistic subtle rims and sharp glints
    finalCol += chromAb;
    finalCol += glint;
    finalCol += dustCol * dust;

    gl_FragColor = vec4(clamp(finalCol, 0.0, 1.0), uOpacity);
  }
`;

const CUBE_VERT = /* glsl */`
  uniform float uTime;
  uniform float uSeed;
  varying vec2  vUv;
  varying vec3  vNormal;
  varying vec3  vPos;
  ${GLSL_NOISE}
  void main() {
    vUv = uv; vPos = position;
    float bump = fbm(vec2(position.x * 4.5 + uSeed, position.y * 5.2 + uSeed));
    float rawDisplace = pow(abs(bump - 0.5), 0.8) * 0.45;
    vec3 displaced = position + normal * rawDisplace;
    float nx = fbm(vec2(position.y * 12.0 + uSeed, position.x * 8.0));
    float ny = fbm(vec2(position.z * 10.0 + uSeed, position.y * 11.0));
    vec3 pertNormal = normalize(normal + vec3(nx - 0.5, ny - 0.5, 0.0) * 0.4);
    vNormal = normalize(normalMatrix * pertNormal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
  }
`;

const CUBE_FRAG = /* glsl */`
  uniform vec3  uInkColor;
  uniform vec3  uAccentColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uAudio;
  uniform float uSeed;
  uniform float uTheme;
  uniform float uResonance;
  uniform float uHover;
  uniform float uClusterAura;
  varying vec3  vNormal;
  varying vec3  vPos;
  ${GLSL_NOISE}

  void main() {
    vec3 N = normalize(vNormal); 
    vec3 V = normalize(vec3(0.0, 0.0, 1.0));
    vec3 L = normalize(vec3(0.6, 1.0, 0.8));
    float NdotV = max(0.0, dot(N, V));
    float NdotL = max(0.0, dot(N, L));
    
    // --- Zen Garden Raw Stone ---
    float rockNoise = fbm(vPos.xyz * (3.8 + (1.0 - uTheme) * 1.2) + uSeed);
    float isGem = smoothstep(mix(0.40, 0.42, uTheme), mix(0.45, 0.58, uTheme), rockNoise); 
    
    vec3 rockCol = mix(vec3(0.06, 0.055, 0.05), vec3(0.78, 0.75, 0.70), uTheme);
    vec3 gemBase = mix(mix(vec3(0.02, 0.015, 0.03), uInkColor, 0.85), vec3(0.82, 0.80, 0.76), uTheme);
    
    // Apply heavy paper-like grain
    float grain = fbm(vPos.xyz * 8.0 + uSeed * 3.0) * 0.08;
    rockCol += mix(grain * 1.1, grain, uTheme); 
    gemBase += mix(grain * 0.4, grain * 0.8, uTheme);
    
    float irid = fbm(vPos.xyz * 4.5 + uTime * 0.08);
    vec3 gemCol = mix(gemBase, mix(vec3(0.2, 0.4, 0.6), vec3(0.88, 0.86, 0.82), uTheme) * max(0.3, uAudio), irid * mix(0.35, 0.15, uTheme));
    
    float fracture = step(0.72, fbm(vec2(vPos.x * 12.0, vPos.z * 10.0))) * mix(0.35, 0.12, uTheme);
    vec3 crysD = uInkColor * (1.8 + uAudio * 2.5);
    vec3 crysL = vec3(0.7, 0.68, 0.65) * (1.0 + uAudio * 0.3);
    
    vec3 internalGlow = mix(rockCol, mix(gemCol, mix(crysD, crysL, uTheme), pow(1.0 - NdotV, 2.8) + fracture), isGem);
    internalGlow *= mix(1.1, NdotL * 0.5 + 0.5, uTheme * 0.6); // Soft clay/stone diffuse wrapping
    
    float porcelainBloom = pow(max(0.0, dot(N, normalize(vec3(0.15, 0.95, 0.55)))), 2.4) * uTheme;
    float subsurface = pow(1.0 - NdotV, 1.9) * uTheme;
    internalGlow += vec3(0.12, 0.095, 0.06) * porcelainBloom * 0.55;
    internalGlow += vec3(0.22, 0.19, 0.14) * subsurface * 0.18;
    
    // Matte stone glint (not sharp glass)
    float glint1 = pow(max(0.0, NdotL), 64.0);
    float glint2 = pow(max(0.0, dot(N, normalize(vec3(-0.8, 0.4, 0.2)))), 48.0);
    vec3 reflection = (glint1 + glint2 * 0.5) * vec3(1.0, 0.98, 0.95) * (0.2 + step(0.45, fbm(vNormal.xy * 4.2 + uSeed)) * isGem * 0.8) * mix(1.0, 0.3, uTheme);
    
    // --- Audio-Reactive Kintsugi Veins (Fireflies) ---
    float veinNoise = fbm(vPos.xyz * 7.5 + uTime * 0.05);
    float vein = smoothstep(mix(0.68, 0.62, uTheme), mix(0.72, 0.66, uTheme), veinNoise);
    float speckleThresh = mix(0.55, 0.65, uTheme);
    float speckles = smoothstep(speckleThresh, speckleThresh + 0.04, fbm(vPos.xyz * 7.0 + uSeed * 3.0 + uTime * 0.3));
    vein = max(vein, speckles * (1.2 + uResonance * 4.0));
    float accentThresh = mix(0.46, 0.52, uTheme);
    float accentNoise = fbm(vPos.xyz * 4.4 - uSeed * 1.6 + vec3(2.1, 0.6, 1.4) + uTime * 0.08);
    float accentSpeckles = smoothstep(accentThresh, accentThresh + 0.032, accentNoise);
    float accentDust = smoothstep(accentThresh + 0.035, accentThresh + 0.075, fbm(vPos.xyz * 6.4 + uSeed * 2.1 - uTime * 0.05));
    float accentEdgeBreak = smoothstep(0.48, 0.62, fbm(vPos.xyz * 10.8 + uSeed * 5.3 + uTime * 0.04));
    accentSpeckles *= accentEdgeBreak;
    accentDust *= mix(0.86, 1.0, accentEdgeBreak);
    
    vec3 goldInk = vec3(1.0, 0.88, 0.55);
    vec3 accentInk = mix(uAccentColor * 0.8 + vec3(0.03, 0.035, 0.04), uAccentColor * 1.08 + vec3(0.07, 0.05, 0.02), uTheme);
    vec3 finalGlow = mix(internalGlow, goldInk * (1.2 + uTheme * 0.3 + uResonance * 1.8), vein * mix(0.9, 0.85, uTheme)) + goldInk * uResonance * 0.08;
    finalGlow += accentInk * accentSpeckles * (0.72 + uResonance * 0.5) * mix(1.0, 0.9, uTheme);
    finalGlow += accentInk * accentDust * (0.34 + uAudio * 0.1 + uResonance * 0.18);
    
    vec3 skyRef = mix(vec3(0.06, 0.08, 0.12), vec3(0.85, 0.88, 0.92), uTheme);
    float rimHalo = pow(1.0 - NdotV, mix(4.6, 3.0, uTheme));
    vec3 pearlRim = vec3(0.96, 0.93, 0.88) * rimHalo * uTheme * 0.16;
    
    vec3 accentGlow = mix(uAccentColor * 0.7 + vec3(0.08, 0.1, 0.14), uAccentColor * 1.05 + vec3(0.06, 0.04, 0.0), uTheme);
    vec3 hoverTint = mix(mix(vec3(0.28, 0.38, 0.56), accentGlow, 0.45), mix(vec3(0.96, 0.86, 0.58), accentGlow, 0.55), uTheme);
    vec3 hoverGlow = hoverTint * rimHalo * uHover * mix(0.22, 0.34, uTheme);
    vec3 clusterAuraBase = mix(mix(vec3(0.34, 0.46, 0.66), accentGlow, 0.42), mix(vec3(0.96, 0.86, 0.66), accentGlow, 0.62), uTheme);
    vec3 clusterAura = clusterAuraBase * rimHalo * uClusterAura * mix(0.18, 0.28, uTheme);
    
    gl_FragColor = vec4(
      clamp(mix(finalGlow, skyRef * 0.15, pow(1.0 - NdotV, mix(6.5, 3.5, uTheme)) * mix(0.4, 0.2, uTheme))
      + reflection
      + pearlRim
      + clusterAura
      + hoverGlow, 0.0, 1.0),
      uOpacity
    );
  }
`;

// --- FOCUS RESIDUE SHADERS ---
const RESIDUE_CORE_VERT = /* glsl */`
  varying vec3 vNormal;
  varying vec3 vPos;
  void main() {
    vNormal = normal;
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const RESIDUE_CORE_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uAudio;
  uniform float uFocusEase;
  uniform float uMotif;
  varying vec3 vNormal;
  varying vec3 vPos;
  ${GLSL_NOISE}

  void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(vec3(0.0, 0.0, 1.0));
    float rim = pow(1.0 - max(0.0, dot(N, V)), 2.2);

    float tSpeed = mix(0.1, 0.6, smoothstep(0.0, 5.0, uMotif) + uAudio * 0.5);
    float t = uTime * tSpeed;
    
    float n1 = fbm(vPos * 4.5 + t);
    float n2 = fbm(vPos * 8.2 - t * 1.5) * 0.5;
    float dust = n1 + n2;

    vec3 cDark = vec3(0.12, 0.08, 0.04);
    vec3 cGold = vec3(0.9, 0.75, 0.3);
    
    if (uMotif < 0.5) { cGold = vec3(1.0, 0.8, 0.35); } // restless
    else if (uMotif < 1.5) { cGold = vec3(0.85, 0.68, 0.45); cDark = vec3(0.15, 0.1, 0.05); } // hesitation 
    else if (uMotif < 2.5) { cGold = vec3(0.88, 0.72, 0.38); } // settling
    else if (uMotif < 3.5) { cGold = vec3(1.0, 0.85, 0.5); } // aftershock
    else if (uMotif < 4.5) { cGold = vec3(0.95, 0.55, 0.15); cDark = vec3(0.2, 0.04, 0.0); } // tension
    else { cGold = vec3(0.85, 0.78, 0.6); } // scatter

    vec3 coreColor = mix(cDark, cGold, smoothstep(0.3, 0.8, dust));
    coreColor += cGold * rim * uFocusEase * (0.5 + uAudio);
    coreColor *= (1.0 + uAudio * 0.8);
    
    float alpha = smoothstep(0.05, 0.55, dust) * uFocusEase * mix(0.6, 0.85, uAudio);
    
    gl_FragColor = vec4(coreColor, alpha);
  }
`;

const RESIDUE_SWARM_VERT = /* glsl */`
  uniform float uTime;
  uniform float uAudio;
  uniform float uFocusEase;
  uniform float uMotif;
  attribute float aPhase;
  attribute float aSize;
  attribute vec3 aAxis;
  varying float vAlpha;
  varying vec3 vColor;
  ${GLSL_NOISE}

  void main() {
    float speed = 0.5;
    float expand = 1.0;
    vec3 cGold = vec3(0.9, 0.75, 0.3);

    if (uMotif < 0.5) { speed = 0.8; expand = 1.1; cGold = vec3(1.0, 0.8, 0.35); }
    else if (uMotif < 1.5) { speed = 0.3; expand = 0.6; cGold = vec3(0.85, 0.68, 0.45); }
    else if (uMotif < 2.5) { speed = 0.4; expand = 0.8; cGold = vec3(0.88, 0.72, 0.38); }
    else if (uMotif < 3.5) { speed = 1.2; expand = 1.3; cGold = vec3(1.0, 0.85, 0.5); }
    else if (uMotif < 4.5) { speed = 1.5; expand = 0.55; cGold = vec3(0.95, 0.55, 0.15); }
    else { speed = 0.9; expand = 1.7; cGold = vec3(0.85, 0.78, 0.6); }

    speed *= (1.0 + uAudio * 1.8);
    float t = uTime * speed * 0.4 + aPhase;
    
    vec3 pos = position;
    float r = length(pos) * expand * uFocusEase * 0.45;
    
    float angle = t;
    vec3 q = cross(aAxis, pos);
    vec3 rotPos = pos * cos(angle) + q * sin(angle) + aAxis * dot(aAxis, pos) * (1.0 - cos(angle));
    
    vec3 curl = vec3(
      fbm(rotPos * 4.0 + t),
      fbm(rotPos * 4.0 + t + 10.0),
      fbm(rotPos * 4.0 + t + 20.0)
    ) * 2.0 - 1.0;

    vec3 finalPos = normalize(rotPos + curl * 0.4) * r * mix(0.6, 1.4, fbm(rotPos * 2.0 - t));

    gl_Position = projectionMatrix * modelViewMatrix * vec4(finalPos, 1.0);
    
    float camDist = length(gl_Position.xyz);
    float pointScale = aSize * mix(0.5, 2.0, fbm(vec3(aPhase, t * 2.0, 0.0)));
    gl_PointSize = pointScale * (1.0 + uAudio * 2.0) * uFocusEase * (10.0 / camDist);
    
    vAlpha = smoothstep(0.0, 0.4, uFocusEase) * 0.85;
    vColor = cGold * (1.0 + uAudio);
  }
`;

const RESIDUE_SWARM_FRAG = /* glsl */`
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float dist = length(gl_PointCoord.xy - vec2(0.5));
    float alpha = smoothstep(0.5, 0.1, dist) * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

const RIBBON_VERT = /* glsl */`
  varying vec2 vUv;
  uniform float uTime;
  uniform float uAudio;
  void main() {
    vUv = uv;
    vec3 pos = position;
    // Add subtle vertex-level vibration for "aliveness"
    pos.y += sin(uv.x * 12.0 + uTime * 4.0) * 0.005 * uAudio;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const RIBBON_FRAG = /* glsl */`
  varying vec2  vUv;
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uAudio;
  uniform float uSpawnTime;
  uniform float uTheme; // 0=Dark, 1=Light
  uniform float uSeed;  // Per-bristle unique seed
  uniform float uGold;  // 0 -> 1 gold ink intensity (Light mode only)
  ${GLSL_NOISE}

  void main() {
    float age = max(0.0, uTime - uSpawnTime);
    float across = (vUv.y - 0.5) * 2.0;

    // Audio-Reactive "Wet Bleed" Physics (massively boosted)
    float wetLevel = uAudio * 8.0;

    // ── High-Contrast "Tear" System ──
    // Create sharp, jagged bristle edges
    float noiseEdge = fbm(vec2(vUv.x * 8.0 + uSeed, vUv.y * 12.0)) * 0.25;
    // Bleed edge outwards when audio hits
    float bristleMask = smoothstep(0.95 + noiseEdge - wetLevel * 0.15, 0.85 + noiseEdge + wetLevel * 0.05, abs(across));
    
    // Internal "Paper Gaps" (Dry Brush)
    float scratchNoise = fbm(vec2(vUv.x * 12.0 + uSeed, vUv.y * 35.0));
    float depletion = smoothstep(0.4, 1.2, vUv.x + scratchNoise * 0.3);
    
    // Flood dry gaps with ink when audio hits
    float inkBreak = step(0.7 - depletion * 0.3 + wetLevel * 0.4, scratchNoise);
    
    float finalDensity = bristleMask * (1.0 - inkBreak * 0.85);

    // Calligraphic taper at extreme ends
    float taper = smoothstep(0.0, 0.02, vUv.x) * smoothstep(1.0, 0.98, vUv.x);
    float pressIn = smoothstep(0.0, 0.05, vUv.x);
    finalDensity *= taper * pressIn;

    // Alpha logic
    float alpha = finalDensity * uOpacity * 0.99;
    
    // Deep carbon blacks with texture-based richness
    vec3 inkColD = mix(uColor * 0.05, uColor * 0.7, finalDensity);
    vec3 inkColL = vec3(0.015, 0.012, 0.01); 
    
    // ── Gold Ink for Light Mode ──
    vec3 goldCol = vec3(0.95, 0.82, 0.45); // Rich Kintsugi Gold
    inkColL = mix(inkColL, goldCol, uGold * 0.9);

    vec3 inkCol  = mix(inkColD, inkColL, uTheme);
    
    // ── Specular Mica / Gold Flakes (UV-based, guaranteed visible) ──
    float flakeNoise = fbm(vec2(vUv.x * 30.0 + uSeed, vUv.y * 20.0 + uSeed * 2.0));
    float flakeMask = smoothstep(0.64, 0.78, flakeNoise); // Tuned threshold
    
    // Animated twinkling — flakes blink in and out over time
    float twinkle = sin(uTime * 10.0 + flakeNoise * 50.0 + uSeed * 7.0);
    float flakeIntensity = flakeMask * max(0.0, twinkle) * (6.0 + uAudio * 15.0);
    
    // Silver in dark mode, rich gold in light mode
    vec3 flakeColor = mix(vec3(1.0, 1.0, 1.1), vec3(1.4, 1.15, 0.65), uTheme);
    inkCol += flakeColor * flakeIntensity * finalDensity;
    
    // ── Drifting Dust Motes (deterministic grid) ──
    // Create a grid of cells; each cell spawns one bright dot that drifts over time
    vec2 driftUv = vUv * vec2(18.0, 6.0) + vec2(-uTime * 0.4, -uTime * 0.6) + uSeed;
    vec2 cell = floor(driftUv);
    vec2 local = fract(driftUv);
    
    // Hash function for pseudo-random per-cell values
    float cellHash = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
    float cellHash2 = fract(sin(dot(cell, vec2(269.5, 183.3))) * 43758.5453);
    
    // Each cell has a dot at a random position within it
    vec2 dotPos = vec2(cellHash, cellHash2);
    float dotDist = length(local - dotPos);
    
    // Sharp bright pinpoint (radius ~0.08 in cell space)
    float dotMask = smoothstep(0.1, 0.02, dotDist);
    
    // Lifecycle: each dot fades in and out over time
    float dotPhase = fract(cellHash * 7.0 + uTime * 0.4);
    float dotLife = smoothstep(0.0, 0.15, dotPhase) * smoothstep(1.0, 0.7, dotPhase);
    
    float mote = dotMask * dotLife * step(0.1, finalDensity);
    
    // Bright white/gold that fully overrides the dark ink
    vec3 moteColor = mix(vec3(1.0, 1.0, 1.05), vec3(1.0, 0.92, 0.6), uTheme);
    inkCol = mix(inkCol, moteColor, clamp(mote, 0.0, 1.0));

    if (alpha < 0.05) discard;
    gl_FragColor = vec4(inkCol, alpha);
  }
`;

const THREAD_VERT = /* glsl */`
  varying vec2 vUv;
  uniform float uTime;
  uniform float uPlayback;
  uniform float uSeed;
  void main() {
    vUv = uv;
    vec3 pos = position;
    
    // 3D Z-Axis Arcing: Bow the threads outward into a beautiful deep web
    float arc = sin(uv.x * 3.14159);
    pos.z += arc * 0.8 * uPlayback + sin(uv.x * 6.28 + uTime + uSeed) * 0.08 * uPlayback;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const THREAD_FRAG = /* glsl */`
  varying vec2 vUv;
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uTheme;
  uniform float uAudio;
  uniform float uSeed;
  uniform float uPlayback;
  ${GLSL_NOISE}

  void main() {
    float across = abs((vUv.y - 0.5) * 2.0);
    float core = smoothstep(1.0, 0.18, across);
    float edgeGlow = smoothstep(1.0, 0.55, across) * 0.35;
    float taper = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.95, vUv.x);
    
    // Ambient liquid light flow
    float flow = fbm(vec3(vUv.x * 6.0 - uTime * 2.5, uSeed * 10.0, uTime * 0.5));
    
    // High-velocity bioluminescent energy pulses (directional transfer!)
    float energyRaw = sin(vUv.x * 20.0 - uTime * 12.0 + uSeed * 15.0);
    float energyPulse = smoothstep(0.85, 1.0, energyRaw) * (2.0 + uAudio * 12.0); // Decoupled from uPlayback so it pulses while idle
    
    float pulse = smoothstep(0.2, 0.6, flow) * uPlayback + energyPulse;
    
    float breathe = 0.94 + sin(uTime * 0.55 + uSeed * 5.7 + vUv.x * 4.2) * 0.06 * mix(1.0, uPlayback, 0.5);
    
    float alpha = (core * 0.85 + edgeGlow) * taper * breathe * uOpacity;
    alpha *= (0.4 + pulse * 2.5 + uAudio * 1.5);
    
    vec3 darkThread = vec3(0.72, 0.69, 0.64);
    vec3 lightThread = uColor;
    vec3 col = mix(darkThread, lightThread, uTheme);
    col += vec3(0.08, 0.06, 0.02) * edgeGlow * (0.3 + uTheme * 0.7);
    
    // Add pulsing liquid gold/ink bioluminescence
    vec3 pulseCol = mix(vec3(0.3, 0.15, 0.1), vec3(1.5, 1.1, 0.6), uTheme);
    col += pulseCol * pulse * 8.0 * uOpacity;

    if (alpha < 0.015) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

// ─── Ink splatter shader ──────────────────────────────────────────────────

const SPLATTER_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const SPLATTER_FRAG = /* glsl */`
  varying vec2  vUv;
  uniform vec3  uColor;
  uniform float uOpacity;
  uniform float uSeed;
  uniform float uTime;
  uniform float uTheme; // 0=Dark, 1=Light
  uniform float uGold;  // 0 -> 1 gold ink intensity (Light mode only)
  ${GLSL_NOISE}

  void main() {
    vec2 p = vUv - 0.5;
    float d = length(p);
    
    // Crisp ink drop shape with organic noise
    float n = fbm(vUv * 4.0 + uSeed);
    float n2 = fbm(vUv * 18.0 + uSeed * 3.0);
    float edge = d + n * 0.18 + n2 * 0.05;
    
    // Hard-edged ink shape (tight smoothstep = crisp boundary)
    float shape = smoothstep(0.48, 0.44, edge);
    // Satellite micro-droplets around the main drop
    float satellite = smoothstep(0.56, 0.53, edge) * step(0.72, n2);
    shape = max(shape, satellite * 0.7);
    
    if (shape < 0.01) discard;
    
    // 3D Normal for the wet droplet surface tension
    vec3 N = normalize(vec3(p.x * 3.0, p.y * 3.0, 0.5 - d));
    vec3 L = normalize(vec3(0.5, 0.8, 1.0));
    float NdotL = max(0.0, dot(N, L));
    
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 H = normalize(L + V);
    float spec = pow(max(0.0, dot(N, H)), 120.0) * 2.0;
    
    // Deep carbon ink with subtle depth
    float depth = 1.0 - d * 2.0;
    vec3 baseColD = uColor * (0.5 + depth * 0.5 + NdotL * 0.3);
    vec3 baseColL = vec3(0.04, 0.03, 0.02);
    
    // ── Gold Ink for Light Mode ──
    vec3 goldCol = vec3(0.95, 0.82, 0.45) * (0.8 + NdotL * 0.4); 
    baseColL = mix(baseColL, goldCol, uGold * 0.95);

    vec3 baseCol  = mix(baseColD, baseColL, uTheme);
    
    // Add sharp specular glint for the wet look
    baseCol += vec3(1.0, 0.98, 0.95) * spec * mix(0.4, 1.2, uGold); 
    
    // Crisp, full-opacity alpha (no soft bleed)
    float alpha = shape * uOpacity;
    
    gl_FragColor = vec4(baseCol, alpha);
  }

`;

// ─── JS cloth wave ──────────────────────────────────────────────────────────
// Overlapping sine waves at different frequencies and directions.
// No noise = no jitter. Smooth, majestic, fabric-like.

function clothWave(x, y, t) {
  return Math.sin(x * 0.35 + t * 0.22) * 0.85
       + Math.cos(y * 0.28 + t * 0.18) * 0.65
       + Math.sin(x * 0.72 + y * 0.35 + t * 0.42) * 0.22
       + Math.cos(x * 0.58 - y * 0.62 + t * 0.35) * 0.15;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function seededVal(seed) {
  let s = seed >>> 0;
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
  return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
}

function sunflowerPosition(i, spacing, seed) {
  if (i === 0) return new THREE.Vector3(
    (seededVal(seed+1)-0.5)*spacing*0.4,
    (seededVal(seed+2)-0.5)*spacing*0.4,
    (seededVal(seed+3)-0.5)*spacing*0.8,
  );
  const goldenAngle = Math.PI*(3-Math.sqrt(5));
  // More sparse radial distribution
  const r = spacing * Math.pow(i, 0.62); 
  const theta = i * goldenAngle;
  return new THREE.Vector3(
    Math.cos(theta)*r + (seededVal(seed+4)-0.5)*spacing*0.25,
    Math.sin(theta)*r + (seededVal(seed+5)-0.5)*spacing*0.25,
    (seededVal(seed+6)-0.5)*spacing*0.85, // More Z-depth variation
  );
}

function createCubeShaderMaterial(inkColor, opacity, seed = 0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime:     { value: 0 },
      uAudio:    { value: 0 }, // Added uAudio
      uSeed:     { value: seed },
      uInkColor: { value: new THREE.Color(inkColor) },
      uAccentColor: { value: new THREE.Color(inkColor) },
      uOpacity:  { value: opacity },
      uTheme:    { value: 0 },
      uResonance: { value: 0 },
      uHover:    { value: 0 },
      uClusterAura: { value: 0 },
    },
    vertexShader:   CUBE_VERT,
    fragmentShader: CUBE_FRAG,
    transparent: true,
    side: THREE.FrontSide,
  });
}

function createFocusResidueVisual() {
  const group = new THREE.Group();
  group.visible = false;
  group.renderOrder = 12;

  // 1. Volumetric Nebula Core
  const coreGeo = new THREE.IcosahedronGeometry(0.06, 4); // Smoother core
  const coreMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAudio: { value: 0 },
      uFocusEase: { value: 0 },
      uMotif: { value: 0 }
    },
    vertexShader: RESIDUE_CORE_VERT,
    fragmentShader: RESIDUE_CORE_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });
  const core = new THREE.Mesh(coreGeo, coreMat);
  group.add(core);

  // 2. Kintsugi Firefly Swarm
  const particleCount = 200;
  const swarmGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const phases = new Float32Array(particleCount);
  const sizes = new Float32Array(particleCount);
  const axes = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount; i++) {
    // Random point on sphere
    const u = seededVal(1000 + i * 3);
    const v = seededVal(2000 + i * 7);
    const theta = u * 2.0 * Math.PI;
    const phi = Math.acos(2.0 * v - 1.0);
    const sinPhi = Math.sin(phi);
    
    positions[i * 3 + 0] = sinPhi * Math.cos(theta);
    positions[i * 3 + 1] = sinPhi * Math.sin(theta);
    positions[i * 3 + 2] = Math.cos(phi);

    phases[i] = seededVal(3000 + i * 11) * Math.PI * 2.0;
    sizes[i] = 0.5 + seededVal(4000 + i * 13) * 1.5;

    // Random orbit axis
    const ax = new THREE.Vector3(
      seededVal(5000 + i)-0.5, 
      seededVal(6000 + i)-0.5, 
      seededVal(7000 + i)-0.5
    ).normalize();
    axes[i * 3 + 0] = ax.x;
    axes[i * 3 + 1] = ax.y;
    axes[i * 3 + 2] = ax.z;
  }

  swarmGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  swarmGeo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  swarmGeo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  swarmGeo.setAttribute('aAxis', new THREE.BufferAttribute(axes, 3));

  const swarmMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAudio: { value: 0 },
      uFocusEase: { value: 0 },
      uMotif: { value: 0 }
    },
    vertexShader: RESIDUE_SWARM_VERT,
    fragmentShader: RESIDUE_SWARM_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  });

  const swarm = new THREE.Points(swarmGeo, swarmMat);
  group.add(swarm);

  return { group, core, swarm, coreMat, swarmMat };
}

// Build a ribbon BufferGeometry for N path points (2 verts per point)
function createRibbonGeometry(N) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N*2*3), 3));
  geo.setAttribute("uv",       new THREE.BufferAttribute(new Float32Array(N*2*2), 2));
  const idx = [];
  for (let i = 0; i < N-1; i++) {
    const b = i*2;
    idx.push(b, b+1, b+2, b+1, b+3, b+2);
  }
  geo.setIndex(idx);
  return geo;
}

const _v3 = new THREE.Vector3();
function updateRibbon(geo, points, maxWidth) {
  const posAttr = geo.attributes.position;
  const uvAttr  = geo.attributes.uv;
  const N = points.length;
  for (let i = 0; i < N; i++) {
    const t = i / (N-1);
    const halfW = maxWidth * Math.sin(t * Math.PI) * 0.5;
    const prev = points[Math.max(0, i-1)];
    const next = points[Math.min(N-1, i+1)];
    const dx = next.x - prev.x, dy = next.y - prev.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const px = (-dy/len) * halfW, py = (dx/len) * halfW;
    const p = points[i];
    posAttr.setXYZ(i*2,   p.x+px, p.y+py, p.z+0.01);
    posAttr.setXYZ(i*2+1, p.x-px, p.y-py, p.z+0.01);
    uvAttr.setXY(i*2,   t, 0);
    uvAttr.setXY(i*2+1, t, 1);
  }
  posAttr.needsUpdate = true;
  uvAttr.needsUpdate  = true;
  geo.computeBoundingSphere();
}

function computeWobblyPath(from, to, time, N, pathSeed = 0) {
  const points = [];
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.sqrt(dx*dx+dy*dy) || 1;
  const perpX = -dy/len, perpY = dx/len;

  // Keep the stroke character stable as the cursor moves so the ribbon glides
  // instead of re-randomizing its phase on every tiny position change.
  const seed = pathSeed * 17.13 + 0.37;

  for (let i = 0; i < N; i++) {
    const t = i/(N-1);

    const envelope = Math.pow(Math.sin(t * Math.PI), 1.15);
    const swell = envelope * Math.cos(time * 0.18 + seed) * 0.045;
    const sCurve = envelope * Math.sin(t * Math.PI * 2.0 + seed * 1.35 - time * 0.22) * 0.018;
    const fig8 = envelope * Math.sin(t * Math.PI * 3.0 + seed * 2.1 + time * 0.32) * 0.008;
    const totalWobble = swell + sCurve + fig8;

    points.push(new THREE.Vector3(
      from.x + dx*t + perpX * totalWobble,
      from.y + dy*t + perpY * totalWobble,
      THREE.MathUtils.lerp(from.z, to.z, t) + envelope * Math.cos(t * Math.PI + seed + time * 0.18) * 0.04,
    ));
  }
  return points;
}

function computeSilkThreadPath(from, to, time, N, pathSeed = 0) {
  const span = from.distanceTo(to);
  if (span < 0.001) {
    return [from.clone(), to.clone()];
  }

  const dir = to.clone().sub(from).normalize();
  const perp = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
  const seedA = seededVal(Math.floor(pathSeed * 101 + 17));
  const seedB = seededVal(Math.floor(pathSeed * 131 + 43));
  const arcSide = seedA > 0.5 ? 1 : -1;
  const arcAmp = Math.min(0.34, 0.08 + span * 0.055) * (0.9 + seedB * 0.35);
  const drift = Math.sin(time * 0.16 + pathSeed * 4.7) * arcAmp * 0.18;
  const lift = Math.min(0.16, 0.02 + span * 0.012);

  const c1 = new THREE.Vector3().lerpVectors(from, to, 0.32)
    .addScaledVector(perp, arcSide * (arcAmp * 0.78 + drift))
    .setZ(THREE.MathUtils.lerp(from.z, to.z, 0.32) + lift * 0.45);
  const c2 = new THREE.Vector3().lerpVectors(from, to, 0.68)
    .addScaledVector(perp, arcSide * (arcAmp * 0.52 - drift * 0.7))
    .setZ(THREE.MathUtils.lerp(from.z, to.z, 0.68) + lift);

  const curve = new THREE.CatmullRomCurve3(
    [from.clone(), c1, c2, to.clone()],
    false,
    "centripetal",
    0.5,
  );

  return relaxPathPoints(curve.getPoints(Math.max(N - 1, 1)), 1, 0.28);
}

function createStrokeSample(position, velocity = 0) {
  return {
    position: position.clone(),
    velocity,
    age: 0,
    pressure: THREE.MathUtils.clamp(velocity / 8.0, 0.18, 1.0),
  };
}

function buildStrokePathSamples(history, headPoint, segments) {
  if (!history.length) return [];

  const controls = history.map(sample => sample.position.clone());
  if (!controls.length || controls[controls.length - 1].distanceToSquared(headPoint) > 1e-5) {
    controls.push(headPoint.clone());
  } else {
    controls[controls.length - 1].copy(headPoint);
  }

  if (controls.length < 2) return [];
  if (controls[0].distanceToSquared(controls[controls.length - 1]) < 0.0025) return [];

  if (controls.length === 2) {
    return Array.from({ length: segments }, (_, index) => {
      const t = index / Math.max(segments - 1, 1);
      return new THREE.Vector3().lerpVectors(controls[0], controls[1], t);
    });
  }

  const curve = new THREE.CatmullRomCurve3(controls, false, "centripetal", 0.5);
  return relaxPathPoints(curve.getPoints(Math.max(segments - 1, 1)), 2, 0.58);
}

function relaxPathPoints(points, passes = 1, strength = 0.5) {
  if (points.length < 3) return points.map(point => point.clone());

  let current = points.map(point => point.clone());
  for (let pass = 0; pass < passes; pass++) {
    const next = current.map(point => point.clone());
    for (let i = 1; i < current.length - 1; i++) {
      const prev = current[i - 1];
      const point = current[i];
      const nxt = current[i + 1];
      const target = new THREE.Vector3()
        .copy(prev)
        .add(point.clone().multiplyScalar(2.0))
        .add(nxt)
        .multiplyScalar(0.25);
      next[i].lerp(target, strength);
    }
    current = next;
  }
  return current;
}

function rotateAroundZ(vec, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new THREE.Vector3(
    vec.x * c - vec.y * s,
    vec.x * s + vec.y * c,
    vec.z,
  );
}

function enforceForwardProgress(points, from, to) {
  if (points.length < 3) return points.map(point => point.clone());

  const dir = new THREE.Vector3().subVectors(to, from);
  const total = Math.max(dir.length(), 1e-5);
  dir.normalize();

  const adjusted = points.map(point => point.clone());
  let prevProj = 0;

  for (let i = 1; i < adjusted.length - 1; i++) {
    const point = adjusted[i];
    const proj = new THREE.Vector3().subVectors(point, from).dot(dir);
    const minProj = Math.min(total, prevProj + total / Math.max(adjusted.length - 1, 1) * 0.35);
    const maxProj = total - (adjusted.length - 1 - i) * total / Math.max(adjusted.length - 1, 1) * 0.18;
    const clampedProj = THREE.MathUtils.clamp(proj, minProj, Math.max(minProj, maxProj));
    point.addScaledVector(dir, clampedProj - proj);
    prevProj = clampedProj;
  }

  adjusted[0].copy(from);
  adjusted[adjusted.length - 1].copy(to);
  return adjusted;
}

function buildBranchPathSamples(from, to, stonePos, stoneRadius, time, seed, segments, reachFactor, lingerFactor = 0, wrapFactor = 1.0, wrapSign = 1.0) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = Math.max(dir.length(), 0.001);
  dir.normalize();

  const tangent = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
  const life = Math.max(reachFactor, lingerFactor);
  const arcLift = 0.22 + life * 0.36;
  const sweep = Math.sin(time * 0.3 + seed * 1.17) * (0.2 + life * 0.18);
  const curl = Math.cos(time * 0.38 + seed * 0.93) * (0.18 + life * 0.16);
  const arcBase = Math.max(len * (0.12 + life * 0.05), 0.24 + life * 0.12);
  const bodyCurl = Math.max(len * 0.1, 0.24) * (0.72 + life * 0.36);
  const tailCurl = Math.max(len * 0.06, 0.16) * (0.64 + lingerFactor * 0.34);

  const rootA = new THREE.Vector3().lerpVectors(from, to, 0.18)
    .addScaledVector(tangent, arcBase * (0.72 + sweep * 0.22))
    .add(new THREE.Vector3(0, 0, arcLift * 0.08));

  const midA = new THREE.Vector3().lerpVectors(from, to, 0.42)
    .addScaledVector(tangent, bodyCurl * (0.54 + sweep * 0.16))
    .add(new THREE.Vector3(0, 0, arcLift * 0.13));

  const midB = new THREE.Vector3().lerpVectors(from, to, 0.7)
    .addScaledVector(tangent, tailCurl * (0.3 + curl * 0.22))
    .add(new THREE.Vector3(0, 0, arcLift * 0.16));

  let controls;
  if (stonePos && wrapFactor > 0.01) {
    const wrapRadius = Math.max(stoneRadius * (1.14 + life * 0.34 + wrapFactor * 0.08), 0.18);
    const toDir = to.clone().sub(stonePos).normalize();
    const fromDir = from.clone().sub(stonePos).normalize();
    const fallbackDir = dir.clone().multiplyScalar(-1);
    if (!isFinite(fromDir.x)) fromDir.copy(fallbackDir);
    if (!isFinite(toDir.x)) toDir.copy(dir);

    const stoneTangent = new THREE.Vector3(-toDir.y, toDir.x, 0).normalize().multiplyScalar(wrapSign);
    const orbitA = rotateAroundZ(fromDir, wrapSign * (0.18 + wrapFactor * 0.14)).normalize();
    const orbitB = rotateAroundZ(fromDir, wrapSign * (0.42 + wrapFactor * 0.2)).normalize();
    const orbitC = rotateAroundZ(fromDir, wrapSign * (0.68 + wrapFactor * 0.28)).normalize();

    const preWrap = stonePos.clone()
      .addScaledVector(fromDir, wrapRadius * 1.02)
      .addScaledVector(stoneTangent, wrapRadius * 0.1)
      .add(new THREE.Vector3(0, 0, arcLift * 0.08));

    const wrapA = stonePos.clone()
      .addScaledVector(orbitA, wrapRadius * 0.98)
      .addScaledVector(stoneTangent, wrapRadius * (0.08 + life * 0.06))
      .add(new THREE.Vector3(0, 0, BRANCH_ORBIT_LIFT * (0.16 + life * 0.14)));

    const wrapB = stonePos.clone()
      .addScaledVector(orbitB, wrapRadius * 0.99)
      .addScaledVector(stoneTangent, wrapRadius * (0.04 + lingerFactor * 0.08))
      .add(new THREE.Vector3(0, 0, BRANCH_ORBIT_LIFT * (0.1 + life * 0.1)));

    const wrapC = stonePos.clone()
      .addScaledVector(orbitC, wrapRadius * 1.01)
      .addScaledVector(stoneTangent, -wrapRadius * (0.04 + lingerFactor * 0.06))
      .add(new THREE.Vector3(0, 0, BRANCH_ORBIT_LIFT * (0.08 + life * 0.12)));

    const postWrap = to.clone()
      .addScaledVector(stoneTangent, wrapRadius * (0.08 + life * 0.07))
      .add(new THREE.Vector3(0, 0, BRANCH_ORBIT_LIFT * 0.06 * (0.45 + life)));

    const w = THREE.MathUtils.clamp(wrapFactor, 0.0, 1.0);
    controls = [
      from.clone(),
      rootA.clone(),
      midA.clone().lerp(preWrap, w * 0.62),
      midB.clone().lerp(wrapA, w * 0.86),
      new THREE.Vector3().lerpVectors(wrapA, wrapB, w * 0.74),
      new THREE.Vector3().lerpVectors(wrapB, wrapC, w * 0.8),
      new THREE.Vector3().lerpVectors(wrapC, postWrap, w * 0.62)
        .addScaledVector(tangent, tailCurl * 0.12),
      to.clone(),
    ];
  } else {
    controls = [
      from.clone(),
      rootA,
      midA,
      midB,
      to.clone(),
    ];
  }

  const curve = new THREE.CatmullRomCurve3(controls, false, "centripetal", 0.5);
  const sampled = curve.getPoints(Math.max(segments - 1, 1));
  return relaxPathPoints(enforceForwardProgress(sampled, from, to), 1, 0.22);
}

function samplePathProgress(points, progress, segments) {
  if (!points.length) return [];
  if (points.length === 1) return [points[0].clone()];

  const clamped = THREE.MathUtils.clamp(progress, 0, 1);
  if (clamped <= 0.001) return [];

  const distances = [0];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += points[i - 1].distanceTo(points[i]);
    distances.push(total);
  }

  if (total <= 1e-5) return [];

  const targetLength = total * clamped;
  const trimmed = [points[0].clone()];

  for (let i = 1; i < points.length; i++) {
    if (distances[i] < targetLength) {
      trimmed.push(points[i].clone());
      continue;
    }

    const prevDistance = distances[i - 1];
    const segLength = Math.max(distances[i] - prevDistance, 1e-5);
    const alpha = THREE.MathUtils.clamp((targetLength - prevDistance) / segLength, 0, 1);
    trimmed.push(new THREE.Vector3().lerpVectors(points[i - 1], points[i], alpha));
    break;
  }

  if (trimmed.length < 2) {
    trimmed.push(points[0].clone().lerp(points[points.length - 1], clamped));
  }

  const out = [];
  const trimmedDistances = [0];
  let trimmedTotal = 0;
  for (let i = 1; i < trimmed.length; i++) {
    trimmedTotal += trimmed[i - 1].distanceTo(trimmed[i]);
    trimmedDistances.push(trimmedTotal);
  }

  for (let i = 0; i < segments; i++) {
    const target = (i / Math.max(segments - 1, 1)) * trimmedTotal;
    let segIndex = 1;
    while (segIndex < trimmedDistances.length && trimmedDistances[segIndex] < target) segIndex++;
    const p0 = trimmed[Math.max(0, segIndex - 1)];
    const p1 = trimmed[Math.min(trimmed.length - 1, segIndex)];
    const d0 = trimmedDistances[Math.max(0, segIndex - 1)];
    const d1 = trimmedDistances[Math.min(trimmedDistances.length - 1, segIndex)];
    const alpha = d1 > d0 ? (target - d0) / (d1 - d0) : 0;
    out.push(new THREE.Vector3().lerpVectors(p0, p1, alpha));
  }

  return out;
}

function samplePathPoint(points, indexFloat) {
  if (!points.length) return new THREE.Vector3();
  if (points.length === 1) return points[0].clone();

  const clamped = THREE.MathUtils.clamp(indexFloat, 0, points.length - 1);
  const i0 = Math.floor(clamped);
  const i1 = Math.min(points.length - 1, i0 + 1);
  const alpha = clamped - i0;
  return new THREE.Vector3().lerpVectors(points[i0], points[i1], alpha);
}

function computeClusterPosition(index, total) {
  if (total === 1) return new THREE.Vector3(0, 0.4, 0);
  const goldenAngle = Math.PI*(3-Math.sqrt(5));
  const angle  = index * goldenAngle + (seededVal(index*123)*0.5); // Add asymmetry
  const radius = 2.2 + (index/Math.max(total-1,1)) * (total > 6 ? 4.2 : 3.0);
  const vSpread = total > 4 ? 0.45 : 0.32;
  return new THREE.Vector3(
    Math.cos(angle)*radius,
    Math.sin(angle)*radius*vSpread,
    (seededVal(index*456)-0.5) * 1.2, // More varied depth per cluster
  );
}

function createInkParticles() {
  const group = new THREE.Group();
  const rng = (() => { let s=1337; return ()=>{ s^=s<<13;s^=s>>17;s^=s<<5;return(s>>>0)/4294967296;};})();
  [
    {count:130, size:0.035, opacity:0.38},
    {count:50,  size:0.07,  opacity:0.28},
    {count:18,  size:0.13,  opacity:0.2},
  ].forEach(({count,size,opacity}) => {
    const pos = new Float32Array(count*3);
    for (let i=0; i<count; i++) {
      pos[i*3]=(rng()-0.5)*26; pos[i*3+1]=(rng()-0.5)*15; pos[i*3+2]=-4.7+rng()*0.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos,3));
    group.add(new THREE.Points(geo, new THREE.PointsMaterial({
      color:"#1e1c18", size, sizeAttenuation:true, transparent:true, opacity,
    })));
  });
  return group;
}

// ─── SceneManager ─────────────────────────────────────────────────────────────

export class SceneManager {
  constructor(container) {
    this.container = container;
    this.scene  = new THREE.Scene();
    this.scene.background = new THREE.Color("#000000"); // Absolute black fallback
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
    this.camera.position.set(0, 0, 30); // Start far for entrance
    this.targetCameraZ = 10;
    this.isMobileRuntime = window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(this.getTargetPixelRatio());
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();

    // ── Paper background with procedural grain + cloth shader ──
    this.paperPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100, 10, 10), // Massive plane to ensure coverage
      new THREE.ShaderMaterial({
        uniforms: {
          uTime:     { value: 0 },
          uPlayback: { value: 0 },
          uAudio:    { value: 0 },
          uTheme:    { value: 0 },
          uRippleOrigin: { value: new THREE.Vector2(0.5, 0.5) },
          uRippleAge:    { value: -1.0 },
          uHover:        { value: 0 },
          uCursorPos:    { value: new THREE.Vector2(0.5, 0.5) },
          uLandingRipple:{ value: 0.0 }, // Hidden by default (Tap to Begin Gate)
          uLandingHover: { value: 0.0 },
          uLandingTap:   { value: -1.0 },
          uLandingOrigin:{ value: new THREE.Vector2(0.5, 0.5) },
        },
        vertexShader:   PAPER_VERT,
        fragmentShader: PAPER_FRAG,
        side: THREE.DoubleSide, // Ensure visibility from all angles
      }),
    );
    this.paperPlane.position.set(0, 0, -5);
    this.scene.add(this.paperPlane);

    // ── Ink splatter group ──
    this.splatters = []; // { mesh, birthTime, duration }
    this.splatterRoot = new THREE.Group();
    this.scene.add(this.splatterRoot);

    // ── Lights (subtle for the twilight abyss) ──
    this.scene.add(new THREE.AmbientLight("#444", 0.18));

    // ── Shared Geometries ──
    this.gemGeo = new THREE.IcosahedronGeometry(1, 1); // Shared, low-poly (20 faces)
    this.focusResidue = createFocusResidueVisual();
    
    // ── Cluster root ──
    this.clusterRoot = new THREE.Group();
    this.scene.add(this.clusterRoot);

    // ── Mouse / cursor ──
    this.mouse        = new THREE.Vector2(-999, -999);
    this.cursorWorld        = new THREE.Vector3(0, 0, 0);
    this.cursorWorldSmooth  = new THREE.Vector3(0, 0, 0);
    this.cursorActive = false;
    this.raycaster    = new THREE.Raycaster();
    this.cursorPlane  = new THREE.Plane(new THREE.Vector3(0, 0, 1), -0.5);

    // ── State ──
    this.cubes         = [];
    this.groupAnchors  = [];
    this.inkStrokes    = [];    // array of Stroke Bundle objects
    this.cursorTrail   = null;
    this.dustParticles = null;  // lightweight flying dust emitter
    this.buildStartAt  = 0;
    this.buildDuration  = 0;
    this.graphRibbons = []; // network layer
    this.audioLevel     = 0;
    this.smoothAudio    = 0;  // very slowly smoothed — for cloth only
    this.isPlaying      = false;
    this.playbackBlend  = 0;

    this.hoveredStoneLabel = null;
    this.hoveredStones = [];
    this.hoveredBranchStones = [];

    // ── Solo Focus Mode ──
    this.focusedStone     = null;   // reference to the focused cube entry
    this.releasingStone   = null;
    this.focusBlend       = 0;     // 0→1 smooth transition into focus
    this.focusOriginWorld = new THREE.Vector3(); // stone's original world position
    this.rippleAge        = -1;    // age of paper ripple (-1 = inactive)
    this.landingTapAge    = -1;
    this.rippleOrigin     = new THREE.Vector2(0.5, 0.5); // UV-space origin
    this.resonancePulses  = [];    // [{ clusterIndex, age }]
    this.ignoreNextStoneClick = false;
    this.focusReading = null;
    this.onBeginPress = null;
    this.onFocusEnter = null;
    this.onBranchTouch = null;

    this._onStoneClick = () => {
      if (this.ignoreNextStoneClick) {
        this.ignoreNextStoneClick = false;
        return;
      }
      if (this.beginCube) return; // Don't interfere with begin cube
      if (this.cubes.length === 0) return;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const meshes = this.cubes.map(c => c.mesh);
      const hits = this.raycaster.intersectObjects(meshes, false);

      if (hits.length > 0) {
        const hitMesh = hits[0].object;
        const entry = this.cubes.find(c => c.mesh === hitMesh);

        if (entry && entry === this.focusedStone) {
          this._exitFocus();
        } else if (entry) {
          this._enterFocus(entry);
        }
      } else if (this.focusedStone) {
        this._exitFocus();
      }
    };
    window.addEventListener("click", this._onStoneClick);

    // Begin cube
    this.beginCube         = null;
    this.beginCubeEntrance = 0;    // 0→1 entrance scale
    this.beginCubeDisp     = 0;    // hover display scale
    this.beginCubeExiting  = false;
    this.beginCubeHovered  = false;
    this._beginCallback    = null;

    this._onBeginClick = () => {
      if (!this.beginCube || this.beginCubeExiting || !this.beginCubeHovered) return;
      this.onBeginPress?.();
      this.dismissBeginCube();
    };
    window.addEventListener("click", this._onBeginClick);

    this.onResize   = this.onResize.bind(this);
    window.addEventListener("resize", this.onResize);
    this.onResize();

    this.themeTarget = 0.0;
    this.themeBlend  = 0.0;
    this._graphGeometryTimer = 0;

    this.animate();
  }

  setTheme(target) {
    this.themeTarget = target;
  }

  suppressStoneClickOnce() {
    this.ignoreNextStoneClick = true;
  }

  triggerLandingRipple() {
    this.landingTapAge = 0;
  }

  _enterFocus(entry) {
    this.releasingStone = null;
    this.focusedStone = entry;
    this.onFocusEnter?.(entry);
    const wp = new THREE.Vector3();
    entry.mesh.getWorldPosition(wp);
    this.focusOriginWorld.copy(wp);
    this.rippleOrigin.set((wp.x + 50) / 100, (wp.y + 50) / 100);
    this.rippleAge = 0;
    this.resonancePulses.push({ clusterIndex: entry.clusterIndex, age: 0 });

    // Burst of ink on focus
    const wp2 = new THREE.Vector3();
    entry.mesh.getWorldPosition(wp2);
    for (let i = 0; i < 4; i++) {
      const isGold = this.themeTarget > 0.5 && Math.random() > 0.4;
      this.addSplatter(wp2.x, wp2.y, entry.mesh.material.uniforms.uInkColor.value.getHex(), isGold);
    }
  }

  _exitFocus() {
    if (this.focusedStone) {
      this.releasingStone = this.focusedStone;
    }
    this.focusedStone = null;
  }

  onMouseMove(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((e.clientX - r.left) / r.width)  *  2 - 1;
    this.mouse.y = ((e.clientY - r.top)  / r.height) * -2 + 1;
    this.cursorActive = true;
  }

  updateCursor(x, y) {
    this.mouse.set(x, y);
    this.cursorActive = true;
  }

  clearScene() {
    this.focusedStone = null;
    this.releasingStone = null;
    this.focusBlend = 0;
    this.focusReading = null;
    if (this.focusResidue.group.parent) {
      this.focusResidue.group.parent.remove(this.focusResidue.group);
    }
    this.focusResidue.group.visible = false;

    this.cubes.forEach(({mesh}) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    this.inkStrokes.forEach(bundle => {
      bundle.ribbons.forEach(r => {
        r.geo.dispose();
        r.mat.dispose();
        this.scene.remove(r.mesh);
      });
    });
    const wp = new THREE.Vector3();

    if (this.cursorTrail) {
      this.cursorTrail.ribbons.forEach(r => {
        r.geo.dispose();
        r.mat.dispose();
        this.scene.remove(r.mesh);
      });
    }
    while (this.clusterRoot.children.length) {
      this.clusterRoot.remove(this.clusterRoot.children[0]);
    }
    this.cubes = [];
    this.groupAnchors = [];
    this.inkStrokes   = [];
    this.cursorTrail  = null;
    if (this.dustParticles) {
      this.dustParticles.geo.dispose();
      this.dustParticles.mat.dispose();
      this.scene.remove(this.dustParticles.mesh);
      this.dustParticles = null;
    }
    this.graphRibbons.forEach(bundle => {
      bundle.ribbons.forEach(r => {
        r.geo.dispose();
        r.mat.dispose();
        this.scene.remove(r.mesh);
      });
    });
    this.graphRibbons = [];
    this.splatters.forEach((s) => {
      this.splatterRoot.remove(s.mesh);
      s.mesh.geometry.dispose();
      s.mesh.material.dispose();
    });
    this.splatters = [];
    this._graphGeometryTimer = 0;
  }

  destroy() {
    if (this._req) {
      cancelAnimationFrame(this._req);
      this._req = null;
    }

    window.removeEventListener("click", this._onStoneClick);
    window.removeEventListener("click", this._onBeginClick);
    window.removeEventListener("resize", this.onResize);

    this.clearScene();

    if (this.beginCube) {
      this.beginCube.geometry.dispose();
      this.beginCube.material.dispose();
      this.scene.remove(this.beginCube);
      this.beginCube = null;
    }

    const residue = this.focusResidue;
    residue.group.parent?.remove(residue.group);
    residue.arcs.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    residue.shards.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    residue.motes.forEach((mesh) => {
      mesh.geometry.dispose();
      mesh.material.dispose();
    });
    residue.core.geometry.dispose();
    residue.core.material.dispose();

    this.gemGeo.dispose();
    this.paperPlane.geometry.dispose();
    this.paperPlane.material.dispose();
    this.renderer.dispose();
  }

  buildComposition(analysis, moodParameters) {
    this.clearScene();
    this.buildStartAt = this.clock.getElapsedTime();

    const clusters = analysis.clusters || [];
    const palette  = moodParameters.colorPalette;
    const imagePalette = moodParameters.imagePalette || palette;
    const trailColor = palette[0] || "#6e685d";

    const cursorTrailRibbons = [];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor:     { value: new THREE.Color(trailColor) },
          uOpacity:   { value: 0 },
          uTime:      { value: 0 },
          uAudio:     { value: 0 },
          uSpawnTime: { value: this.clock.getElapsedTime() },
          uTheme:     { value: this.themeBlend },
          uSeed:      { value: 100 + i * 13.0 },
          uGold:      { value: 0 },
        },
        vertexShader:   RIBBON_VERT,
        fragmentShader: RIBBON_FRAG,
        transparent: true,
        blending: THREE.NormalBlending,
        depthWrite: false,
      });

      const geo = createRibbonGeometry(CURSOR_TRAIL_SEGMENTS);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      cursorTrailRibbons.push({ mesh, geo, mat, seed: 20 + i * 2.7 });
    }

    this.cursorTrail = {
      ribbons: cursorTrailRibbons,
      history: [],
      headWorld: this.cursorWorldSmooth.clone(),
      pathPoints: [],
      motion: 0,
      visibility: 0,
      lastSamplePos: null,
      lastRenderableAge: 0,
      lastCursorWorld: this.cursorWorldSmooth.clone(),
      idleTime: 0,
      idleLife: 0,
      idleSampleTimer: 0,
    };

    clusters.forEach((cluster, ci) => {
      const group  = new THREE.Group();
      const anchor = computeClusterPosition(ci, clusters.length);
      group.position.copy(anchor);
      this.groupAnchors.push(anchor.clone());
      this.clusterRoot.add(group);

      const inkCol = palette[ci % palette.length];
      const accentCol = imagePalette[ci % imagePalette.length] || inkCol;

      (cluster.keys || []).forEach((entry, ki) => {
        const seed    = (ci * 100 + ki) * 37;
        const radius  = 0.12 + seededVal(seed+10) * 0.26;
        const opacity = 0.65 + seededVal(seed+20) * 0.28;

        const mat  = createCubeShaderMaterial(inkCol, opacity, seededVal(seed) * 10.0);
        mat.uniforms.uAccentColor.value.set(accentCol);
        const mesh = new THREE.Mesh(this.gemGeo, mat);

        const pos = sunflowerPosition(ki, CUBE_SPACING, seed);
        mesh.position.copy(pos);
        mesh.scale.setScalar(0.001); 

        this.cubes.push({
          mesh,
          key: entry.key || "•",
          baseScale: radius,
          baseOpacity: opacity,
          currentDisplayScale: 0,
          basePos: pos.clone(),
          clusterIndex: ci,
          localIndex: ki,
          clusterSize: (cluster.keys || []).length,
          appearAt: ci*0.36 + ki*0.055,
          driftOffset: seededVal(seed+40) * Math.PI * 2,
          swimPhaseA: seededVal(seed + 50) * Math.PI * 2,
          swimPhaseB: seededVal(seed + 60) * Math.PI * 2,
          swimRadius: 0.42 + seededVal(seed + 70) * 0.82,
          swimLift: 0.1 + seededVal(seed + 80) * 0.2,
          swimSpeed: 0.07 + seededVal(seed + 90) * 0.06,
        });
        group.add(mesh);
      });

      // ── "Stroke Bundle" Cursor Connection ──
      const bundleCount = this.isMobileRuntime ? 2 : 3;
      const ribbons = [];
      for (let i = 0; i < bundleCount; i++) {
        const mat = new THREE.ShaderMaterial({
          uniforms: {
            uColor:     { value: new THREE.Color(BRANCH_KINTSUGI_COLOR) },
            uOpacity:   { value: 0 },
            uTime:      { value: 0 },
            uAudio:     { value: 0 },
            uSpawnTime: { value: this.clock.getElapsedTime() },
            uTheme:     { value: 0 },
            uSeed:      { value: Math.random() * 100.0 },
            uGold:      { value: 0 },
          },
          vertexShader:   RIBBON_VERT,
          fragmentShader: RIBBON_FRAG,
          transparent: true,
          blending: THREE.NormalBlending,
          depthWrite: false,
        });

        const geo = createRibbonGeometry(LINE_SEGMENTS);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = false;
        this.scene.add(mesh);

        ribbons.push({ mesh, geo, mat, seed: i * 1.5 });
      }

      this.inkStrokes.push({
        ribbons,
        clusterIndex: ci,
        targetStone: null,
        reachFactor: 0,
        tipWorld: anchor.clone(),
        anchorWorld: anchor.clone(),
        wrapCenterWorld: anchor.clone(),
        residualStonePos: anchor.clone(),
        residualStoneRadius: 0.22,
        drawProgress: 0,
        wrapFactor: 0,
        surfaceProgress: 0,
        lingerFactor: 0,
        filamentState: "idle",
        stateTime: 0,
        cooldown: 0,
        targetHold: 0,
        lastStone: null,
        anchorBias: Math.random() * Math.PI * 2,
        wrapSign: Math.sin(ci * 1.73) >= 0 ? 1 : -1,
        orbitSeed: ci * 0.83 + Math.random() * Math.PI * 2,
      });
    });

    this.generateGraph(moodParameters.colorPalette, moodParameters.imagePalette || moodParameters.colorPalette);

    // ── Lightweight Dust Particle Emitter (single draw call) ──
    const DUST_COUNT = this.isMobileRuntime ? 120 : 200;
    const dustPositions = new Float32Array(DUST_COUNT * 3);
    const dustAlphas = new Float32Array(DUST_COUNT);
    const dustSizes = new Float32Array(DUST_COUNT);
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    dustGeo.setAttribute('alpha', new THREE.BufferAttribute(dustAlphas, 1));
    dustGeo.setAttribute('size', new THREE.BufferAttribute(dustSizes, 1));
    
    const dustMat = new THREE.ShaderMaterial({
      uniforms: {
        uTheme: { value: this.themeBlend },
      },
      vertexShader: /* glsl */`
        attribute float alpha;
        attribute float size;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (20.0 / -mvPos.z); // Boosted size factor
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: /* glsl */`
        varying float vAlpha;
        uniform float uTheme;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          float disc = smoothstep(0.5, 0.1, d); // Softer edge, brighter core
          vec3 col = mix(vec3(0.95, 0.98, 1.0), vec3(1.0, 0.95, 0.7), uTheme);
          gl_FragColor = vec4(col, disc * vAlpha * 1.5); // Boosted alpha
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const dustMesh = new THREE.Points(dustGeo, dustMat);
    dustMesh.frustumCulled = false;
    this.scene.add(dustMesh);
    
    this.dustParticles = {
      mesh: dustMesh,
      geo: dustGeo,
      mat: dustMat,
      count: DUST_COUNT,
      ages: new Float32Array(DUST_COUNT).fill(999), // start all expired
      velocities: new Array(DUST_COUNT).fill(null).map(() => new THREE.Vector3()),
      spawnTimer: 0,
    };

    this.buildDuration = this.cubes.length
      ? Math.max(...this.cubes.map(e => e.appearAt)) + 0.9
      : 0;
    return this.buildDuration;
  }

  initBeginCube(callback) {
    this._beginCallback = callback;
    this.beginCubeExiting = false;
    this.beginCubeEntrance = 0;
    this.beginCubeDisp = 0;
    this.beginCubeHovered = false;
    if (this.beginCube) {
      this.beginCube.geometry.dispose();
      this.beginCube.material.dispose();
      this.scene.remove(this.beginCube);
      this.beginCube = null;
    }
    const geo = new THREE.IcosahedronGeometry(0.38, 3);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:     { value: 0 },
        uInkColor: { value: new THREE.Color("#1e2a28") },
        uOpacity:  { value: 0 },
        uTheme:    { value: this.themeBlend || 0 },
      },
      vertexShader:   BEGIN_CUBE_VERT,
      fragmentShader: BEGIN_CUBE_FRAG,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.beginCube = new THREE.Mesh(geo, mat);
    this.beginCube.position.set(0, 0, 0);
    this.scene.add(this.beginCube);
  }

  dismissBeginCube() {
    if (!this.beginCube || this.beginCubeExiting) return;
    this.beginCubeExiting = true;
    setTimeout(() => {
      if (this.beginCube) {
        this.beginCube.geometry.dispose();
        this.beginCube.material.dispose();
        this.scene.remove(this.beginCube);
        this.beginCube = null;
      }
      this._beginCallback?.();
      this._beginCallback = null;
    }, 650);
  }

  setPlaybackState(isPlaying) { this.isPlaying = isPlaying; }

  setFocusReading(reading) {
    this.focusReading = reading;
  }

  getActiveFocusEntry() {
    return this.focusedStone || this.releasingStone || null;
  }
  setAudioLevel(level)        { this.audioLevel = level; }

  onResize() {
    const w = this.container.clientWidth  || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(this.getTargetPixelRatio());
    this.camera.aspect = w/h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  getTargetPixelRatio() {
    return this.isMobileRuntime
      ? Math.min(window.devicePixelRatio || 1, 1.35)
      : Math.min(window.devicePixelRatio || 1, 2);
  }

  animate() {
    this._req = requestAnimationFrame(() => this.animate());
    this.themeBlend = THREE.MathUtils.lerp(this.themeBlend, this.themeTarget, 0.06);
    const elapsed = this.clock.getElapsedTime();
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const buildTime = elapsed - this.buildStartAt;
    const wp = new THREE.Vector3();
    const shouldUpdateGraphGeometry = !this.isMobileRuntime || ((this._graphGeometryTimer += dt) >= MOBILE_GRAPH_GEOMETRY_INTERVAL);
    if (shouldUpdateGraphGeometry) this._graphGeometryTimer = 0;

    this.paperPlane.material.uniforms.uTheme.value = this.themeBlend;
    this.cubes.forEach(c => {
      if (c.mesh.material.uniforms.uTheme) c.mesh.material.uniforms.uTheme.value = this.themeBlend;
    });
    this.inkStrokes.forEach(bundle => {
      bundle.ribbons.forEach(r => {
        if (r.mat.uniforms.uTheme) r.mat.uniforms.uTheme.value = this.themeBlend;
      });
    });
    this.cursorTrail?.ribbons.forEach(r => {
      if (r.mat.uniforms.uTheme) r.mat.uniforms.uTheme.value = this.themeBlend;
    });
    this.splatters.forEach(s => {
      if (s.mesh.material.uniforms.uTheme) s.mesh.material.uniforms.uTheme.value = this.themeBlend;
    });
    if (this.beginCube?.material?.uniforms?.uTheme) {
      this.beginCube.material.uniforms.uTheme.value = this.themeBlend;
    }

    const focusTarget = this.focusedStone ? 1.0 : 0.0;
    this.focusBlend = THREE.MathUtils.lerp(
      this.focusBlend,
      focusTarget,
      this.focusedStone ? 0.028 : 0.022,
    );
    if (!this.focusedStone && this.focusBlend < 0.015) {
      this.releasingStone = null;
    }
    const focusEase = this.focusBlend * this.focusBlend * (3.0 - 2.0 * this.focusBlend);
    const activeFocusEntry = this.getActiveFocusEntry();

    if (activeFocusEntry && this.focusReading && this.focusBlend > 0.02) {
      const residue = this.focusResidue;
      if (residue.group.parent !== activeFocusEntry.mesh) {
        residue.group.parent?.remove(residue.group);
        activeFocusEntry.mesh.add(residue.group);
      }

      residue.group.visible = true;
      residue.group.position.set(0, 0, 0);
      residue.group.scale.setScalar(1.2 + focusEase * 0.4);
      residue.group.rotation.y += 0.004 + this.smoothAudio * 0.0022;
      residue.group.rotation.z = Math.sin(elapsed * 0.18) * 0.05 * focusEase;

      const motifStr = this.focusReading.motif || "restless";
      let uMotifVal = 0.0;
      if (motifStr === "hesitation") uMotifVal = 1.0;
      else if (motifStr === "settling") uMotifVal = 2.0;
      else if (motifStr === "aftershock") uMotifVal = 3.0;
      else if (motifStr === "tension") uMotifVal = 4.0;
      else if (motifStr === "scatter") uMotifVal = 5.0;

      residue.coreMat.uniforms.uTime.value = elapsed;
      residue.coreMat.uniforms.uAudio.value = this.smoothAudio;
      residue.coreMat.uniforms.uFocusEase.value = focusEase;
      residue.coreMat.uniforms.uMotif.value = uMotifVal;

      residue.swarmMat.uniforms.uTime.value = elapsed;
      residue.swarmMat.uniforms.uAudio.value = this.smoothAudio;
      residue.swarmMat.uniforms.uFocusEase.value = focusEase;
      residue.swarmMat.uniforms.uMotif.value = uMotifVal;

    } else {
      this.focusResidue.group.visible = false;
      if (this.focusResidue.group.parent && this.focusResidue.group.parent !== this.scene) {
        this.focusResidue.group.parent.remove(this.focusResidue.group);
      }
    }

    if (this.rippleAge >= 0) {
      this.rippleAge += 0.016;
      if (this.rippleAge > 6.0) this.rippleAge = -1;
    }
    this.paperPlane.material.uniforms.uRippleAge.value = this.rippleAge;
    this.paperPlane.material.uniforms.uRippleOrigin.value.copy(this.rippleOrigin);

    this.paperPlane.material.uniforms.uLandingRipple.value = THREE.MathUtils.lerp(
      this.paperPlane.material.uniforms.uLandingRipple.value,
      (this.beginCube && !this.beginCubeExiting) ? 1.0 : 0.0,
      0.03
    );
    this.paperPlane.material.uniforms.uLandingHover.value = THREE.MathUtils.lerp(
      this.paperPlane.material.uniforms.uLandingHover.value,
      this.beginCubeHovered && !this.beginCubeExiting ? 1.0 : 0.0,
      0.08
    );
    if (this.landingTapAge >= 0) {
      this.landingTapAge += 0.016;
      if (this.landingTapAge > 6.0) this.landingTapAge = -1;
    }
    this.paperPlane.material.uniforms.uLandingTap.value = this.landingTapAge;

    // Perspectively project the Begin Stone's world position onto the Paper Plane UVs
    if (this.beginCube && this.camera) {
      const stoneWorld = new THREE.Vector3();
      this.beginCube.getWorldPosition(stoneWorld);
      const rayDir = new THREE.Vector3().subVectors(stoneWorld, this.camera.position).normalize();
      if (Math.abs(rayDir.z) > 0.0001) {
        const t = (-5.0 - this.camera.position.z) / rayDir.z; // Paper plane is at z = -5
        const hitX = this.camera.position.x + rayDir.x * t;
        const hitY = this.camera.position.y + rayDir.y * t;
        this.paperPlane.material.uniforms.uLandingOrigin.value.set(
          (hitX / 100.0) + 0.5,
          (hitY / 100.0) + 0.5
        );
      }
    }

    this.resonancePulses = this.resonancePulses.filter(p => {
      p.age += 0.016;
      return p.age < 2.5;
    });
    this.cubes.forEach(c => {
      if (!c.mesh.material.uniforms.uResonance) return;
      const pulse = this.resonancePulses.find(p => p.clusterIndex === c.clusterIndex);
      const resonanceVal = pulse ? Math.exp(-pulse.age * 2.0) : 0;
      c.mesh.material.uniforms.uResonance.value = resonanceVal;
    });

    const dimFactor = 1.0 - this.focusBlend * 0.15;
    this.paperPlane.material.uniforms.uAudio.value = this.smoothAudio * dimFactor;

    this.playbackBlend = THREE.MathUtils.lerp(
      this.playbackBlend,
      this.isPlaying ? 1.0 : 0.0,
      0.012,
    );

    const pbFast = this.playbackBlend * this.playbackBlend * (3.0 - 2.0 * this.playbackBlend);

    // Unbind time from pbFast so the camera never rewinds backward on stop
    const camOrbitAngle = elapsed * 0.15;
    const camXRadius = 8.0 * pbFast;
    
    const baseCamX = Math.cos(elapsed * 0.3) * 0.1;
    const baseCamY = 0.8 + Math.sin(elapsed * 0.4) * 0.15;
    const baseCamZ = 10.0;
    
    const targetCamX = baseCamX * (1.0 - pbFast) + Math.sin(camOrbitAngle) * camXRadius;
    const targetCamZ = baseCamZ + (16.0 - baseCamZ) * pbFast + Math.cos(camOrbitAngle) * camXRadius * 0.3 * pbFast;
    const targetCamY = baseCamY + pbFast * 1.5;
    
    // Tight lerp to track the smooth pbFast curve identically across all axes
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetCamX, 0.08);
    this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, targetCamZ, 0.08);
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetCamY, 0.08);
    
    this.camera.lookAt(0, pbFast * 1.5, 0);

    this.smoothAudio = THREE.MathUtils.lerp(this.smoothAudio, this.audioLevel, 0.018);

    const pu = this.paperPlane.material.uniforms;
    pu.uTime.value     = elapsed;
    pu.uPlayback.value = this.playbackBlend;
    pu.uAudio.value    = this.smoothAudio;

    if (this.beginCube) {
      const bm = this.beginCube.material;
      bm.uniforms.uTime.value = elapsed;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const hits = this.raycaster.intersectObject(this.beginCube);
      this.beginCubeHovered = hits.length > 0 && !this.beginCubeExiting;
      if (!this.beginCubeExiting) {
        this.beginCubeEntrance = THREE.MathUtils.lerp(this.beginCubeEntrance, 1.0, 0.035);
        this.beginCubeDisp = THREE.MathUtils.lerp(this.beginCubeDisp, this.beginCubeHovered ? 1.22 : 1.0, 0.1);
        const breathe = 1 + Math.sin(elapsed * 1.05) * 0.022;
        this.beginCube.scale.setScalar(this.beginCubeEntrance * this.beginCubeDisp * breathe);
        bm.uniforms.uOpacity.value = Math.min(bm.uniforms.uOpacity.value + 0.018, 0.88);
        this.beginCube.rotation.x += Math.sin(elapsed * 0.31) * 0.008 + Math.cos(elapsed * 0.17) * 0.005;
        this.beginCube.rotation.y += Math.sin(elapsed * 0.19) * 0.009 + Math.cos(elapsed * 0.27) * 0.006;
        this.beginCube.rotation.z += Math.cos(elapsed * 0.23) * 0.006 + Math.sin(elapsed * 0.11) * 0.004;
        this.beginCube.position.x = 0;
        this.beginCube.position.y = Math.cos(elapsed * 0.18) * 0.11 + Math.sin(elapsed * 0.29) * 0.07;
      } else {
        this.beginCubeDisp = THREE.MathUtils.lerp(this.beginCubeDisp, 1.6, 0.07);
        this.beginCube.scale.setScalar(this.beginCubeDisp);
        bm.uniforms.uOpacity.value = Math.max(bm.uniforms.uOpacity.value - 0.035, 0);
        this.beginCube.rotation.y += 0.025;
      }
    }

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersectPoint = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(this.cursorPlane, intersectPoint)) {
      this.cursorWorld.copy(intersectPoint);
    }
    this.cursorWorldSmooth.lerp(this.cursorWorld, CURSOR_RELAXATION);

    if (this.cursorTrail) {
      const trailActive = this.cursorActive;
      const trail = this.cursorTrail;
      const previousHead = trail.headWorld.clone();
      const cursorFrameDelta = trail.lastCursorWorld.distanceTo(this.cursorWorldSmooth);
      trail.lastCursorWorld.copy(this.cursorWorldSmooth);
      trail.idleTime = trailActive && cursorFrameDelta < STROKE_MIN_SAMPLE_DIST * 0.28
        ? trail.idleTime + dt
        : 0;
      trail.idleLife = THREE.MathUtils.clamp(trail.idleTime / 1.4, 0, 1);
      trail.idleSampleTimer += dt;

      const headTarget = this.cursorWorldSmooth.clone();
      if (trailActive) {
        const idleLife = trail.idleLife;
        headTarget.x += Math.sin(elapsed * 0.26 + idleLife * 1.7) * IDLE_HEAD_WAVE_RADIUS * idleLife;
        headTarget.y += Math.cos(elapsed * 0.22 + 0.7 + idleLife * 1.3) * IDLE_HEAD_WAVE_RADIUS * 0.82 * idleLife;
        headTarget.z += Math.sin(elapsed * 0.18 + 1.1) * IDLE_HEAD_WAVE_LIFT * idleLife;

        let caressDist = Infinity;
        const caressStone = new THREE.Vector3();
        this.cubes.forEach(cube => {
          cube.mesh.getWorldPosition(wp);
          const d = wp.distanceTo(this.cursorWorldSmooth);
          if (d < STONE_CARESS_RADIUS && d < caressDist) {
            caressDist = d;
            caressStone.copy(wp);
          }
        });

        if (caressDist < Infinity) {
          const toStone = caressStone.clone().sub(headTarget);
          const distNorm = 1.0 - THREE.MathUtils.clamp(caressDist / STONE_CARESS_RADIUS, 0, 1);
          if (toStone.lengthSq() > 1e-5) {
            const inward = toStone.normalize();
            const tangent = new THREE.Vector3(-inward.y, inward.x, 0).normalize();
            const swirlPhase = Math.sin(elapsed * 0.36 + trail.idleTime * 0.45 + caressStone.x * 0.8 + caressStone.y * 0.5);
            headTarget.addScaledVector(inward, STONE_CARESS_PULL * distNorm * (0.25 + idleLife * 0.75));
            headTarget.addScaledVector(tangent, STONE_CARESS_SWIRL * swirlPhase * distNorm * (0.2 + idleLife * 0.8));
          }
        }
      }

      trail.headWorld.lerp(
        headTarget,
        trailActive
          ? THREE.MathUtils.lerp(TRAIL_HEAD_PULL, IDLE_HEAD_PULL, trail.idleLife)
          : TRAIL_FADE_PULL,
      );

      trail.history = trail.history
        .map(sample => ({ ...sample, age: sample.age + dt }))
        .filter(sample => sample.age < STROKE_POINT_LIFETIME);

      if (trailActive) {
        if (!trail.lastSamplePos) {
          const initialSample = createStrokeSample(trail.headWorld, 0);
          trail.history.push(initialSample);
          trail.lastSamplePos = trail.headWorld.clone();
        } else {
          const moveDist = trail.lastSamplePos.distanceTo(trail.headWorld);
          if (moveDist >= STROKE_MIN_SAMPLE_DIST) {
            const steps = Math.min(Math.ceil(moveDist / STROKE_MIN_SAMPLE_DIST), 8);
            const velocity = moveDist / Math.max(dt, 0.016);
            for (let step = 1; step <= steps; step++) {
              const alpha = step / steps;
              const pos = new THREE.Vector3().lerpVectors(trail.lastSamplePos, trail.headWorld, alpha);
              trail.history.push(createStrokeSample(pos, velocity));
            }
            trail.lastSamplePos.copy(trail.headWorld);
            trail.idleSampleTimer = 0;
          } else if (
            trail.idleLife > 0.08 &&
            trail.idleSampleTimer >= STROKE_IDLE_SAMPLE_INTERVAL &&
            trail.lastSamplePos.distanceTo(trail.headWorld) >= STROKE_IDLE_SAMPLE_DIST
          ) {
            trail.history.push(createStrokeSample(trail.headWorld, 1.2 + trail.idleLife * 1.6));
            trail.lastSamplePos.copy(trail.headWorld);
            trail.idleSampleTimer = 0;
          }
        }
      }

      if (trail.history.length > STROKE_MAX_POINTS) {
        trail.history.splice(0, trail.history.length - STROKE_MAX_POINTS);
      }

      const renderHistory = trail.history.filter(sample => sample.age <= STROKE_RENDER_LIFETIME);
      let pathBase = buildStrokePathSamples(renderHistory, trail.headWorld, CURSOR_TRAIL_SEGMENTS);

      if (pathBase.length >= 2 && trail.idleLife > 0.04) {
        let caressDist = Infinity;
        const caressStone = new THREE.Vector3();
        this.cubes.forEach(cube => {
          cube.mesh.getWorldPosition(wp);
          const d = wp.distanceTo(trail.headWorld);
          if (d < STONE_CARESS_RADIUS * 1.15 && d < caressDist) {
            caressDist = d;
            caressStone.copy(wp);
          }
        });

        pathBase = pathBase.map((point, index, arr) => {
          const t = index / Math.max(arr.length - 1, 1);
          const headEnvelope = Math.pow(t, 1.9) * trail.idleLife;
          const moved = point.clone().add(new THREE.Vector3(
            Math.sin(elapsed * 0.21 + t * 4.2) * IDLE_TRAIL_SWAY * headEnvelope,
            Math.cos(elapsed * 0.18 + t * 3.6 + 0.4) * IDLE_TRAIL_SWAY * 0.8 * headEnvelope,
            Math.sin(elapsed * 0.12 + t * 2.8) * IDLE_HEAD_WAVE_LIFT * 0.7 * headEnvelope,
          ));

          if (caressDist < Infinity) {
            const toStone = caressStone.clone().sub(moved);
            const dist = toStone.length();
            const influence = headEnvelope * (1.0 - THREE.MathUtils.clamp(dist / (STONE_CARESS_RADIUS * 0.95), 0, 1));
            if (influence > 0.001 && dist > 1e-5) {
              const inward = toStone.multiplyScalar(1 / dist);
              const tangent = new THREE.Vector3(-inward.y, inward.x, 0).normalize();
              const swirl = Math.sin(elapsed * 0.34 + t * 5.1 + caressStone.x * 0.3 + caressStone.y * 0.2);
              moved.addScaledVector(inward, STONE_CARESS_PULL * 0.7 * influence);
              moved.addScaledVector(tangent, STONE_CARESS_SWIRL * 0.55 * swirl * influence);
            }
          }

          return moved;
        });
      }

      trail.pathPoints = pathBase;

      const recentSamples = renderHistory.slice(-8);
      const motionTarget = recentSamples.length
        ? THREE.MathUtils.clamp(
            recentSamples.reduce((sum, sample) => sum + sample.pressure, 0) / recentSamples.length,
            0.08,
            1.0,
          )
        : 0.0;
      const hasRenderablePath = pathBase.length >= 2;

      trail.motion = THREE.MathUtils.lerp(trail.motion, motionTarget, trailActive ? 0.12 : 0.05);
      trail.lastRenderableAge = hasRenderablePath && renderHistory.length
        ? renderHistory[0].age / STROKE_RENDER_LIFETIME
        : 1.0;
      trail.visibility = THREE.MathUtils.lerp(trail.visibility, hasRenderablePath ? 1.0 : 0.0, hasRenderablePath ? 0.08 : 0.05);

      const headDelta = trail.headWorld.distanceTo(previousHead);
      const trailOpacity = trail.visibility * (0.12 + trail.motion * 0.28) * (1.0 - trail.lastRenderableAge * 0.2);
      const trailWidth = (0.17 + trail.motion * 0.14) * (0.98 + Math.min(headDelta, 0.2) * 0.35);

      trail.ribbons.forEach((r, idx) => {
        r.mat.uniforms.uTime.value = elapsed;
        r.mat.uniforms.uAudio.value = this.audioLevel;
        r.mat.uniforms.uOpacity.value = THREE.MathUtils.lerp(r.mat.uniforms.uOpacity.value, trailOpacity, 0.08);
        r.mat.uniforms.uGold.value = THREE.MathUtils.lerp(r.mat.uniforms.uGold.value, trail.motion * 0.25, 0.06);
        r.mesh.visible = r.mat.uniforms.uOpacity.value > 0.001;

        if (!r.mesh.visible || !hasRenderablePath) return;

        const drift = idx - (trail.ribbons.length - 1) * 0.5;
        const offsetAmp = 0.014 + trail.motion * 0.01;
        const points = pathBase.map((point, pointIndex, arr) => {
          const t = pointIndex / Math.max(arr.length - 1, 1);
          const envelope = Math.pow(Math.sin(t * Math.PI), 1.1);
          return new THREE.Vector3(
            point.x + Math.sin(elapsed * 0.18 + idx * 0.7 + t * 3.2) * offsetAmp * drift * envelope,
            point.y + Math.cos(elapsed * 0.15 + idx * 0.7 + t * 2.8) * offsetAmp * drift * envelope,
            point.z + drift * 0.003,
          );
        });

        updateRibbon(r.geo, points, trailWidth * (0.96 + idx * 0.1));
      });
    }

    // ── Dust Particle Emitter Update ──
    if (this.dustParticles && this.cursorTrail) {
      const dust = this.dustParticles;
      const posArr = dust.geo.attributes.position.array;
      const alphaArr = dust.geo.attributes.alpha.array;
      const sizeArr = dust.geo.attributes.size.array;
      const DUST_LIFETIME = 3.0;
      
      dust.mat.uniforms.uTheme.value = this.themeBlend;
      
      // Spawn new particles from the trail head
      dust.spawnTimer += dt;
      const spawnRate = this.cursorTrail.visibility > 0.1 ? 0.05 : 0.15; // Faster spawning
      if (dust.spawnTimer > spawnRate) {
        dust.spawnTimer = 0;
        // Spawn up to 3 at a time for more volume
        let spawnedThisFrame = 0;
        for (let i = 0; i < dust.count && spawnedThisFrame < 3; i++) {
          if (dust.ages[i] > DUST_LIFETIME) {
            const head = this.cursorTrail.headWorld;
            posArr[i * 3]     = head.x + (Math.random() - 0.5) * 0.5;
            posArr[i * 3 + 1] = head.y + (Math.random() - 0.5) * 0.4;
            posArr[i * 3 + 2] = head.z + Math.random() * 0.2;
            dust.ages[i] = 0;
            dust.velocities[i].set(
              (Math.random() - 0.5) * 0.25,
              0.12 + Math.random() * 0.2, // Faster upward drift
              0.04 + Math.random() * 0.08,
            );
            sizeArr[i] = (4.0 + Math.random() * 6.0) * (1.0 + this.audioLevel * 1.5); // Reactive size
            spawnedThisFrame++;
          }
        }
      }
      
      // Age and drift all particles
      for (let i = 0; i < dust.count; i++) {
        dust.ages[i] += dt;
        const life = dust.ages[i] / DUST_LIFETIME;
        if (life > 1.0) {
          alphaArr[i] = 0;
          continue;
        }
        // Drift
        posArr[i * 3]     += dust.velocities[i].x * dt;
        posArr[i * 3 + 1] += dust.velocities[i].y * dt;
        posArr[i * 3 + 2] += dust.velocities[i].z * dt;
        // Fade: quick in, slow out
        alphaArr[i] = Math.sin(life * Math.PI) * 0.7;
        // Shrink over lifetime
        sizeArr[i] *= (1.0 - dt * 0.3);
      }
      
      dust.geo.attributes.position.needsUpdate = true;
      dust.geo.attributes.alpha.needsUpdate = true;
      dust.geo.attributes.size.needsUpdate = true;
    }

    let _nearestDist = Infinity;
    let _nearestLabel = null;
    let _activeClusterIndex = this.focusedStone?.clusterIndex ?? this.releasingStone?.clusterIndex ?? null;
    const hoveredStones = [];
    const hoveredBranchStones = [];

    this.cubes.forEach(entry => {
      const {mesh} = entry;
      const isFocused = entry === this.focusedStone || entry === this.releasingStone;
      entry.hoverProximity = 0;
      mesh.material.uniforms.uTime.value = elapsed;
      mesh.material.uniforms.uAudio.value = this.smoothAudio;
      const prog = THREE.MathUtils.clamp((buildTime - entry.appearAt)/0.5, 0, 1);
      const isBuilt = prog >= 1.0;
      if (!isBuilt) {
        entry.currentDisplayScale = easeOutCubic(prog) * MINI_SCALE;
      } else {
        mesh.getWorldPosition(wp);
        const dist = wp.distanceTo(this.cursorWorldSmooth);
        const proximity = 1 - THREE.MathUtils.clamp(dist / HOVER_RADIUS, 0, 1);
        if (dist <= BRANCH_HOVER_RADIUS) {
          hoveredBranchStones.push(entry);
        }

        let target;
        if (isFocused && this.focusBlend > 0.01) {
          const restScale = THREE.MathUtils.lerp(MINI_SCALE, entry.baseScale, proximity * proximity * (3 - 2 * proximity));
          target = THREE.MathUtils.lerp(restScale, entry.baseScale * 2.5, focusEase);
        } else if (this.focusBlend > 0.01 && !isFocused) {
          const playRest = this.isPlaying
            ? THREE.MathUtils.lerp(MINI_SCALE, entry.baseScale, (clothWave(
                (this.clusterRoot.children[entry.clusterIndex]?.position.x || 0) + entry.basePos.x,
                (this.clusterRoot.children[entry.clusterIndex]?.position.y || 0) + entry.basePos.y,
                elapsed,
              ) + 1.14) / 2.28)
            : THREE.MathUtils.lerp(MINI_SCALE, entry.baseScale, proximity * proximity * (3 - 2 * proximity));
          target = THREE.MathUtils.lerp(playRest, MINI_SCALE * 0.25, focusEase);
        } else if (this.isPlaying) {
          const group = this.clusterRoot.children[entry.clusterIndex];
          const wx = (group ? group.position.x : 0) + entry.basePos.x;
          const wy = (group ? group.position.y : 0) + entry.basePos.y;
          const wave = clothWave(wx, wy, elapsed);
          const waveNorm = (wave + 1.14) / 2.28;
          target = THREE.MathUtils.lerp(MINI_SCALE, entry.baseScale, waveNorm);
        } else {
          entry.hoverProximity = proximity;
          const eased = proximity * proximity * (3 - 2 * proximity);
          target = THREE.MathUtils.lerp(MINI_SCALE, entry.baseScale, eased);
          if (proximity > 0.08) hoveredStones.push(entry);
          if (proximity > 0.05) {
            const intensity = Math.pow(proximity, 2.0);
            mesh.rotation.y += intensity * 0.012;
            mesh.rotation.x += intensity * 0.006;
            mesh.position.z += intensity * 0.03;
          }
        }
        entry.currentDisplayScale = THREE.MathUtils.lerp(entry.currentDisplayScale, target, 0.08);
      }
      mesh.scale.setScalar(Math.max(0.001, entry.currentDisplayScale));
      const shellOpacityTarget = isFocused && this.focusBlend > 0.01
        ? THREE.MathUtils.lerp(entry.baseOpacity, Math.max(0.34, entry.baseOpacity * 0.56), focusEase)
        : (this.focusBlend > 0.01 && !isFocused
            ? THREE.MathUtils.lerp(entry.baseOpacity, entry.baseOpacity * 0.72, focusEase)
            : entry.baseOpacity);
      mesh.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(
        mesh.material.uniforms.uOpacity.value,
        shellOpacityTarget,
        0.08,
      );
      mesh.material.uniforms.uHover.value = THREE.MathUtils.lerp(
        mesh.material.uniforms.uHover.value,
        Math.pow(entry.hoverProximity, 1.6) * 0.9,
        0.12,
      );

      const expand = THREE.MathUtils.clamp((entry.currentDisplayScale - 0.06)/(1.0 - 0.06), 0, 1);
      const amp = THREE.MathUtils.lerp(0.006, 0.07, expand);
      const orbitSpeed = 0.18;
      const orbitRadius = amp * 1.5;
      let posX = entry.basePos.x + Math.cos(elapsed * orbitSpeed + entry.driftOffset) * orbitRadius;
      let posY = entry.basePos.y + Math.sin(elapsed * orbitSpeed + entry.driftOffset) * orbitRadius;
      let posZ = entry.basePos.z + Math.cos(elapsed * orbitSpeed * 1.4 + entry.driftOffset) * amp * 0.3;

      if (isFocused && this.focusBlend > 0.01) {
        const vCamPos = this.camera.position.clone();
        const vCamDir = new THREE.Vector3();
        this.camera.getWorldDirection(vCamDir);
        
        // Ideal world position: 4.5 units directly in front of the camera lens
        const idealWorld = vCamPos.add(vCamDir.multiplyScalar(4.5));
        
        // Convert to local space of the stone's parent group
        const group = this.clusterRoot.children[entry.clusterIndex];
        if (group) {
          idealWorld.applyMatrix4(group.matrixWorld.clone().invert());
        }
        
        posX = THREE.MathUtils.lerp(posX, idealWorld.x, focusEase);
        posY = THREE.MathUtils.lerp(posY, idealWorld.y, focusEase);
        posZ = THREE.MathUtils.lerp(posZ, idealWorld.z, focusEase);
        mesh.rotation.y += 0.008;
        mesh.rotation.x = Math.sin(elapsed * 0.3) * 0.15 * focusEase;
      }
      mesh.position.x = posX;
      mesh.position.y = posY;
      mesh.position.z = posZ;

      if (this.playbackBlend > 0.005) {
        const group = this.clusterRoot.children[entry.clusterIndex];
        const wx = (group ? group.position.x : 0) + entry.basePos.x;
        const wy = (group ? group.position.y : 0) + entry.basePos.y;
        const clothAmp = this.playbackBlend * 1.0;
        const wave = clothWave(wx, wy, elapsed) * clothAmp;
        const eps = 0.1;
        const waveX = clothWave(wx + eps, wy, elapsed) * clothAmp;
        const waveY = clothWave(wx, wy + eps, elapsed) * clothAmp;
        const slopeX = (waveX - wave) / eps;
        const slopeY = (waveY - wave) / eps;
        mesh.position.y += wave * 0.15;
        mesh.position.z += (wave * 0.45) + 0.55; 
        const targetRotZ = slopeX * 0.08;
        const targetRotX = -slopeY * 0.08;
        mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, targetRotZ, 0.05);
        mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, targetRotX, 0.05);

        const audioSwim = 0.42 + this.smoothAudio * 0.8;
        const t = elapsed * entry.swimSpeed * 0.35 + entry.swimPhaseA;
        const bX = entry.basePos.x, bY = entry.basePos.y, bZ = entry.basePos.z;
        
        let p1X = Math.sin(bX * 0.5 + t) * Math.cos(bY * 0.5 - t) + Math.sin(bZ * 0.5 + t);
        let p2X = Math.sin(bX * 1.5 - t) * Math.cos(bY * 1.2 + t) + Math.sin(bZ * 1.3 - t);
        let p3X = Math.sin(bX * 2.5 + t*1.5) * Math.cos(bY * 2.1 - t*1.2) + Math.sin(bZ * 2.2 + t*1.4);
        const fbmX = p1X + p2X * 0.5 + p3X * 0.25;
        
        let p1Y = Math.sin(bX * 0.6 + t + 10) * Math.cos(bY * 0.4 - t + 10) + Math.sin(bZ * 0.7 + t + 10);
        let p2Y = Math.sin(bX * 1.4 - t + 10) * Math.cos(bY * 1.3 + t + 10) + Math.sin(bZ * 1.1 - t + 10);
        let p3Y = Math.sin(bX * 2.4 + t*1.5 + 10) * Math.cos(bY * 2.0 - t*1.2 + 10) + Math.sin(bZ * 2.3 + t*1.4 + 10);
        const fbmY = p1Y + p2Y * 0.5 + p3Y * 0.25;
        
        let p1Z = Math.sin(bX * 0.4 + t + 20) * Math.cos(bY * 0.6 - t + 20) + Math.sin(bZ * 0.5 + t + 20);
        let p2Z = Math.sin(bX * 1.1 - t + 20) * Math.cos(bY * 1.4 + t + 20) + Math.sin(bZ * 1.3 - t + 20);
        let p3Z = Math.sin(bX * 2.1 + t*1.5 + 20) * Math.cos(bY * 2.3 - t*1.2 + 20) + Math.sin(bZ * 2.0 + t*1.4 + 20);
        const fbmZ = p1Z + p2Z * 0.5 + p3Z * 0.25;

        const swimRadius = entry.swimRadius * this.playbackBlend * audioSwim * 0.7;
        const swimLift = entry.swimLift * this.playbackBlend * (0.95 + this.smoothAudio * 0.85) * 0.35;
        
        const swimDriftX = fbmX * swimRadius;
        const swimDriftY = fbmY * swimRadius;
        const swimDriftZ = fbmZ * swimLift;

        mesh.position.x += swimDriftX;
        mesh.position.y += swimDriftY;
        mesh.position.z += swimDriftZ;

        const driftRotY = swimDriftX * 0.24;
        const driftRotX = swimDriftY * 0.16;
        mesh.rotation.y += driftRotY * 0.05;
        mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, targetRotX + driftRotX, 0.04);
        mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, targetRotZ + swimDriftX * 0.05, 0.04);
      }
      mesh.rotation.y += (entry.rotSpeed || 0.001) + expand*0.006;
      if (this.cursorActive && !this.focusedStone) {
        mesh.getWorldPosition(wp);
        const labelDist = wp.distanceTo(this.cursorWorldSmooth);
        if (labelDist < 1.5 && labelDist < _nearestDist) {
          _nearestDist = labelDist;
          _nearestLabel = entry.key;
          _activeClusterIndex = entry.clusterIndex;
        }
      }
    });

    this.hoveredStoneLabel = _nearestLabel;
    this.hoveredStones = hoveredStones;
    this.hoveredBranchStones = hoveredBranchStones;

    this.cubes.forEach((entry) => {
      const auraTarget = _activeClusterIndex !== null && entry.clusterIndex === _activeClusterIndex
        ? (entry === this.focusedStone || entry === this.releasingStone ? 0.54 : 0.3)
        : 0.0;
      entry.mesh.material.uniforms.uClusterAura.value = THREE.MathUtils.lerp(
        entry.mesh.material.uniforms.uClusterAura.value,
        auraTarget,
        0.08,
      );
    });

    this.clusterRoot.children.forEach((group, i) => {
      const a = this.groupAnchors[i];
      if (!a) return;
      group.position.x = a.x + Math.sin(elapsed*0.36+i)*0.07;
      group.position.y = a.y + Math.cos(elapsed*0.41+i)*0.055;
    });

    // ── Residual stone branches ──
    const _cwp = new THREE.Vector3();
    const STRETCH_LIMIT = 3.6;

    this.inkStrokes.forEach(bundle => {
      const { ribbons, orbitSeed } = bundle;
      const cursorAnchor = this.cursorWorldSmooth;
      const trailPath = this.cursorTrail?.pathPoints || [];
      const idleLife = this.cursorTrail?.idleLife || 0;
      const branchLead = trailPath.length ? trailPath[trailPath.length - 1] : cursorAnchor;
      const anchorIndex = trailPath.length
        ? (trailPath.length - 1) - (
            TRAIL_BRANCH_BACKSTEP
            + Math.sin(elapsed * 0.34 + orbitSeed) * (0.45 + idleLife * 0.9)
          )
        : 0;
      const anchorSample = trailPath.length
        ? samplePathPoint(trailPath, anchorIndex)
        : cursorAnchor.clone();
      const headDir = branchLead.clone().sub(anchorSample);
      const headDirNorm = headDir.lengthSq() > 1e-5
        ? headDir.normalize()
        : new THREE.Vector3(1, 0, 0);
      const headTangent = new THREE.Vector3(-headDirNorm.y, headDirNorm.x, 0).normalize();
      const sourceOffset = Math.sin(elapsed * 0.42 + bundle.anchorBias + orbitSeed * 0.35) * TRAIL_BRANCH_SOURCE_SPREAD;
      const rawBranchFrom = branchLead.clone()
        .addScaledVector(headTangent, sourceOffset)
        .addScaledVector(headDirNorm, -0.06 - Math.abs(sourceOffset) * 0.08);

      bundle.anchorWorld.lerp(rawBranchFrom, BRANCH_ROOT_PULL);
      const branchFrom = bundle.anchorWorld;
      bundle.stateTime += dt;
      bundle.cooldown = Math.max(0, bundle.cooldown - dt);

      if (!this.cursorActive || !this.cursorTrail || trailPath.length < 2) {
        if (bundle.targetStone) bundle.lastStone = bundle.targetStone;
        bundle.targetStone = null;
        bundle.reachFactor = THREE.MathUtils.lerp(bundle.reachFactor, 0, 0.22);
        bundle.drawProgress = bundle.reachFactor;
        bundle.wrapFactor = THREE.MathUtils.lerp(bundle.wrapFactor, 0, 0.18);
        bundle.surfaceProgress = THREE.MathUtils.lerp(bundle.surfaceProgress, 0, 0.18);
        bundle.lingerFactor = THREE.MathUtils.lerp(bundle.lingerFactor, 0, 0.18);
        bundle.tipWorld.lerp(branchFrom, BRANCH_RELEASE_PULL_SOFT);
      } else {
        const hoveredPool = this.hoveredBranchStones || [];
        const isClaimedByOther = (cube) => this.inkStrokes.some(other =>
          other !== bundle && other.targetStone === cube && other.reachFactor > 0.08
        );

        const sortedTargets = hoveredPool
          .filter(cube => cube !== bundle.lastStone)
          .map(cube => {
            cube.mesh.getWorldPosition(wp);
            return { cube, dist: wp.distanceTo(branchLead), pos: wp.clone() };
          })
          .sort((a, b) => a.dist - b.dist);
        const availableTargets = sortedTargets.filter(target => !isClaimedByOther(target.cube));

        if (bundle.targetStone) {
          const stillHovered = hoveredPool.includes(bundle.targetStone);
          const sharedStone = isClaimedByOther(bundle.targetStone);
          bundle.targetStone.mesh.getWorldPosition(_cwp);
          if ((!stillHovered || sharedStone) && availableTargets.length && availableTargets[0].cube !== bundle.targetStone) {
            bundle.lastStone = bundle.targetStone;
            bundle.targetStone = null;
            bundle.cooldown = 0.06;
          } else if (!stillHovered || _cwp.distanceTo(branchLead) > STRETCH_LIMIT) {
            bundle.lastStone = bundle.targetStone;
            bundle.residualStonePos.copy(_cwp);
            bundle.residualStoneRadius = Math.max(bundle.targetStone.currentDisplayScale || 0, bundle.targetStone.baseScale || 0.14) * 1.08;
            bundle.targetStone = null;
            bundle.cooldown = FILAMENT_COOLDOWN_TIME;
            bundle.reachFactor = THREE.MathUtils.lerp(bundle.reachFactor, 0, 0.14);
            bundle.wrapFactor = THREE.MathUtils.lerp(bundle.wrapFactor, 0, 0.18);
            bundle.surfaceProgress = THREE.MathUtils.lerp(bundle.surfaceProgress, 0, 0.16);
            bundle.lingerFactor = THREE.MathUtils.lerp(bundle.lingerFactor, 0, 0.14);
          }
        }

        if (!bundle.targetStone && availableTargets.length) {
          const candidateIndex = Math.min(
            availableTargets.length - 1,
            Math.floor(((Math.sin(bundle.anchorBias) + 1) * 0.5) * Math.min(availableTargets.length, 2)),
          );
          const candidate = availableTargets[candidateIndex];
          bundle.targetStone = candidate.cube;
          this.onBranchTouch?.(candidate.cube);
          if (candidate.cube !== bundle.lastStone) {
            bundle.lastStone = null;
          }
          bundle.reachFactor = THREE.MathUtils.lerp(bundle.reachFactor, 0.06, 0.18);
          bundle.residualStonePos.copy(candidate.pos);
          bundle.residualStoneRadius = Math.max(candidate.cube.currentDisplayScale || 0, candidate.cube.baseScale || 0.14) * 1.08;
          const toStone = candidate.pos.clone().sub(branchFrom);
          bundle.wrapSign = Math.sin(orbitSeed + Math.atan2(toStone.y, toStone.x)) >= 0 ? 1 : -1;
        }

        if (bundle.targetStone) {
          bundle.targetStone.mesh.getWorldPosition(_cwp);
          const stoneRadius = Math.max(bundle.targetStone.currentDisplayScale || 0, bundle.targetStone.baseScale || 0.14) * 1.08;
          const distToCursor = _cwp.distanceTo(branchLead);
          const stretchFactor = Math.max(0, 1 - distToCursor / STRETCH_LIMIT);
          const toAnchor = branchFrom.clone().sub(_cwp);
          const contactDir = toAnchor.lengthSq() > 1e-5 ? toAnchor.normalize() : new THREE.Vector3(1, 0, 0);
          const orbitAngle = bundle.wrapSign * (0.16 + bundle.reachFactor * 0.42 + Math.sin(elapsed * 0.38 + orbitSeed) * 0.08);
          const orbitDir = rotateAroundZ(contactDir, orbitAngle).normalize();
          const tipTarget = _cwp.clone()
            .addScaledVector(orbitDir, stoneRadius * (0.98 + bundle.reachFactor * 0.08))
            .add(new THREE.Vector3(
              0,
              0,
              Math.sin(elapsed * 0.42 + orbitSeed) * BRANCH_ORBIT_LIFT * 0.08 * bundle.reachFactor,
            ));

          bundle.residualStonePos.lerp(_cwp, 0.16);
          bundle.residualStoneRadius = THREE.MathUtils.lerp(bundle.residualStoneRadius, stoneRadius, 0.14);
          bundle.reachFactor = THREE.MathUtils.lerp(bundle.reachFactor, 1.0, 0.05);
          bundle.drawProgress = bundle.reachFactor;
          bundle.wrapFactor = THREE.MathUtils.lerp(bundle.wrapFactor, stretchFactor * bundle.reachFactor, 0.05);
          bundle.surfaceProgress = THREE.MathUtils.lerp(bundle.surfaceProgress, stretchFactor, 0.04);
          bundle.lingerFactor = THREE.MathUtils.lerp(bundle.lingerFactor, stretchFactor * 0.65, 0.04);
          bundle.tipWorld.lerp(
            new THREE.Vector3().lerpVectors(branchFrom, tipTarget, easeOutCubic(bundle.reachFactor)),
            0.055,
          );
        } else {
          bundle.reachFactor = THREE.MathUtils.lerp(bundle.reachFactor, 0, 0.1);
          bundle.drawProgress = bundle.reachFactor;
          bundle.wrapFactor = THREE.MathUtils.lerp(bundle.wrapFactor, 0, 0.12);
          bundle.surfaceProgress = THREE.MathUtils.lerp(bundle.surfaceProgress, 0, 0.12);
          bundle.lingerFactor = THREE.MathUtils.lerp(bundle.lingerFactor, 0, 0.1);
          const retractTarget = new THREE.Vector3().lerpVectors(branchFrom, bundle.residualStonePos, bundle.reachFactor * 0.4);
          bundle.tipWorld.lerp(retractTarget, 0.045);
        }
      }

      const trailPresence = this.cursorTrail.visibility * (0.6 + this.cursorTrail.motion * 0.4);
      const branchLengthFactor = THREE.MathUtils.clamp(branchFrom.distanceTo(bundle.tipWorld) / 0.32, 0, 1);
      const branchPresence = bundle.reachFactor * branchLengthFactor;
      const tOpa = (0.08 + Math.pow(branchPresence, 0.92) * 0.5) * (trailPresence * 0.85 + 0.15);

      ribbons.forEach(r => {
        const currentOpa = r.mat.uniforms.uOpacity.value;
        const targetOpa  = THREE.MathUtils.lerp(currentOpa, tOpa, 0.08);
        r.mat.uniforms.uOpacity.value = targetOpa;
        r.mesh.visible = targetOpa > 0.001;
      });

      if (branchPresence > 0.01) {
        const stoneWorld = bundle.targetStone ? _cwp.clone() : bundle.residualStonePos.clone();
        const stoneRadius = Math.max(bundle.residualStoneRadius, 0.14);
        const stretchFactor = bundle.targetStone ? Math.max(0, 1 - stoneWorld.distanceTo(branchLead) / STRETCH_LIMIT) : 0;
        const baseWidth = 0.055 + stretchFactor * 0.12 * branchPresence;

        ribbons.forEach((r, idx) => {
          r.mat.uniforms.uTime.value = elapsed;
          r.mat.uniforms.uAudio.value = this.audioLevel;
          const branchGold = 0.18 + branchPresence * 0.22 + bundle.wrapFactor * 0.38 + bundle.lingerFactor * 0.14;
          r.mat.uniforms.uGold.value = THREE.MathUtils.lerp(
            r.mat.uniforms.uGold.value,
            Math.min(branchGold, 0.82),
            0.08,
          );

          const branchPath = computeWobblyPath(
            branchFrom,
            bundle.tipWorld,
            elapsed * 0.82 + orbitSeed * 0.2,
            LINE_SEGMENTS,
            r.seed + orbitSeed * 0.5,
          );
          const pts = branchPath.map((point, pointIndex, arr) => {
            const t = pointIndex / Math.max(arr.length - 1, 1);
            const envelope = Math.pow(Math.sin(t * Math.PI), 1.08);
            const pointOut = point.clone();

            if (bundle.targetStone) {
              const endInfluence = THREE.MathUtils.smoothstep(t, 0.64, 1.0) * bundle.wrapFactor;
              const toStone = point.clone().sub(stoneWorld);
              const stoneDir = toStone.lengthSq() > 1e-5 ? toStone.normalize() : new THREE.Vector3(1, 0, 0);
              const orbitDir = rotateAroundZ(
                stoneDir,
                bundle.wrapSign * endInfluence * (0.52 + Math.sin(elapsed * 0.4 + orbitSeed) * 0.08),
              ).normalize();
              const wrapPoint = stoneWorld.clone()
                .addScaledVector(orbitDir, stoneRadius * (1.0 + endInfluence * 0.08))
                .add(new THREE.Vector3(
                  0,
                  0,
                  Math.sin(elapsed * 0.36 + orbitSeed + t * 2.0) * BRANCH_ORBIT_LIFT * 0.06 * endInfluence,
                ));
              pointOut.lerp(wrapPoint, endInfluence * 0.45);
            }

            const offsetAmp = 0.014 + branchPresence * 0.016 + bundle.wrapFactor * 0.01 + idleLife * 0.012;
            pointOut.x += Math.sin(elapsed * 0.18 + idx * 0.72 + t * 2.3 + orbitSeed) * offsetAmp * envelope;
            pointOut.y += Math.cos(elapsed * 0.16 + idx * 0.72 + t * 1.95 + orbitSeed * 0.7) * offsetAmp * envelope;
            pointOut.z += Math.sin(elapsed * 0.12 + t * 2.5 + orbitSeed) * 0.012 * envelope;
            return pointOut;
          });
          if (pts.length >= 2) {
            updateRibbon(r.geo, pts, baseWidth * (0.94 + idx * 0.1));
          }
        });
      }
    });

    this.splatters = this.splatters.filter(s => {
      const age = elapsed - s.birthTime;
      const prog = age / s.duration;
      if (prog >= 1.0) {
        this.splatterRoot.remove(s.mesh);
        s.mesh.geometry.dispose();
        s.mesh.material.dispose();
        return false;
      }
      s.mesh.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(0.85, 0, prog * prog);
      s.mesh.material.uniforms.uTime.value = elapsed;
      const scl = s.baseScale * (1.0 + Math.sin(prog * Math.PI * 0.5) * 0.8);
      s.mesh.scale.setScalar(scl);
      return true;
    });

    // Update global hover intensity for background
    let maxHover = 0;
    this.cubes.forEach(c => {
      c.mesh.getWorldPosition(wp);
      const d = wp.distanceTo(this.cursorWorldSmooth);
      const prox = 1.0 - THREE.MathUtils.clamp(d / HOVER_RADIUS, 0, 1);
      if (prox > maxHover) maxHover = prox;
    });
    this.paperPlane.material.uniforms.uHover.value = THREE.MathUtils.lerp(this.paperPlane.material.uniforms.uHover.value, maxHover, 0.1);
    
    // Convert cursor to UV for background shader
    const uvCursor = new THREE.Vector2(0.5, 0.5);
    const cp = this.cursorWorldSmooth.clone();
    // Assuming paper plane is 100x100 centered at 0,0
    uvCursor.set((cp.x + 50) / 100, (cp.y + 50) / 100);
    this.paperPlane.material.uniforms.uCursorPos.value.copy(uvCursor);

    this.updateGraphRibbons(elapsed, shouldUpdateGraphGeometry);
    this.renderer.render(this.scene, this.camera);
  }

  generateGraph(palette, accentPalette = palette) {
    if (this.cubes.length < 2) return;
    this.cubes.forEach((cubeA, i) => {
      const neighbors = this.cubes
        .map((cb, j) => ({ cube: cb, index: j, d: cubeA.mesh.position.distanceTo(cb.mesh.position) }))
        .filter(n => n.index > i)
        .sort((a,b) => a.d - b.d)
        .slice(0, 1);
      neighbors.forEach(n => {
        const pairId = [i, this.cubes.indexOf(n.cube)].sort().join("-");
        if (this.graphRibbons.some(r => r.id === pairId)) return;

        const baseThread = new THREE.Color("#8f8067");
        const accentThread = new THREE.Color(accentPalette[(i + n.index) % accentPalette.length] || palette[(i + n.index) % palette.length] || "#8f8067");
        const inkCol = baseThread.lerp(accentThread, 0.32);
        const bundleCount = 1;
        const ribbons = [];

        for (let b = 0; b < bundleCount; b++) {
          const mat = new THREE.ShaderMaterial({
            uniforms: {
              uColor:     { value: inkCol.clone() },
              uOpacity:   { value: 0 },
              uTime:      { value: 0 },
              uTheme:     { value: this.themeBlend },
              uSeed:      { value: Math.random() * 100.0 },
              uPlayback:  { value: 0 },
              uAudio:     { value: 0 },
            },
            vertexShader:   THREAD_VERT,
            fragmentShader: THREAD_FRAG,
            transparent: true,
            blending: THREE.NormalBlending,
            depthWrite: false,
          });
          const geo = createRibbonGeometry(GRAPH_THREAD_SEGMENTS);
          const mesh = new THREE.Mesh(geo, mat);
          mesh.frustumCulled = false;
          this.scene.add(mesh);
          ribbons.push({
            mesh,
            geo,
            mat,
            seed: seededVal((i + 1) * 97 + (n.index + 1) * 53 + b * 11) * 10.0,
          });
        }

        this.graphRibbons.push({ id: pairId, from: cubeA, to: n.cube, ribbons });
      });
    });
  }

  updateGraphRibbons(elapsed, shouldUpdateGeometry = true) {
    this.graphRibbons.forEach(bundle => {
      const { from, to, ribbons } = bundle;
      const p1 = from.mesh.getWorldPosition(new THREE.Vector3());
      const p2 = to.mesh.getWorldPosition(new THREE.Vector3());
      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
      const centerDist = mid.length();
      const distanceFade = 1.0 - THREE.MathUtils.clamp((centerDist - 5.5) / 10.5, 0, 1);
      const spanFade = 1.0 - THREE.MathUtils.clamp((p1.distanceTo(p2) - 2.4) / 5.6, 0, 1);
      const breathe = 0.72 + Math.sin(
        elapsed * 0.34 + seededVal(bundle.from.clusterIndex + bundle.to.clusterIndex + 1) * 8.0,
      ) * 0.1;
      const targetOpa = this.isPlaying
        ? (this.playbackBlend * breathe * GRAPH_THREAD_BASE_OPACITY * Math.pow(distanceFade, 1.8) * Math.pow(spanFade, 1.15))
        : 0.0;
      const width = (GRAPH_THREAD_WIDTH + this.audioLevel * GRAPH_THREAD_AUDIO_WIDTH) * (0.82 + distanceFade * 0.18);

      ribbons.forEach((r, idx) => {
        r.mat.uniforms.uOpacity.value = THREE.MathUtils.lerp(r.mat.uniforms.uOpacity.value, targetOpa, 0.05);
        r.mesh.visible = r.mat.uniforms.uOpacity.value > 0.001;
        
        if (r.mesh.visible) {
          r.mat.uniforms.uTime.value = elapsed;
          r.mat.uniforms.uTheme.value = this.themeBlend;
          r.mat.uniforms.uPlayback.value = this.playbackBlend;
          r.mat.uniforms.uAudio.value = this.smoothAudio;

          if (shouldUpdateGeometry) {
            const pts = computeSilkThreadPath(p1, p2, elapsed, GRAPH_THREAD_SEGMENTS, r.seed + idx * 0.17);
            updateRibbon(r.geo, pts, width);
          }
        }
      });
    });
  }

  addSplatter(x, y, colorHex, isGold = false) {
    const scale = 0.15 + Math.random() * 0.4;
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor:   { value: new THREE.Color(colorHex) },
        uOpacity: { value: 0.85 },
        uSeed:    { value: Math.random() * 100 },
        uTime:    { value: this.clock.getElapsedTime() },
        uTheme:   { value: this.themeBlend },
        uGold:    { value: isGold ? 1.0 : 0.0 },
      },
      vertexShader:   SPLATTER_VERT,
      fragmentShader: SPLATTER_FRAG,
      transparent: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const jitterX = (Math.random() - 0.5) * 1.5;
    const jitterY = (Math.random() - 0.5) * 0.8;
    mesh.position.set(x + jitterX, y + jitterY, -4.8);
    mesh.rotation.z = Math.random() * Math.PI * 2;
    mesh.scale.setScalar(0.1); 
    this.splatterRoot.add(mesh);
    this.splatters.push({
      mesh,
      birthTime: this.clock.getElapsedTime(),
      duration: 3.5 + Math.random() * 2,
      velocity: new THREE.Vector3(0, 0, 0),
      baseScale: scale,
    });
  }
}
