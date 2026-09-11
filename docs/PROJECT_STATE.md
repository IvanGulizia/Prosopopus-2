# Project State

## Status: Operational & Stable

### Active Features
1. **Multi-Axis Matrix & Continuous Interpolation**:
   - 2D/3D custom interpolation axes with Bilinear and IDW radial blending.
   - Spring dynamics, kinetic momentum extrapolation, and harmonic vertex inertia.
2. **Expert Mode (Animation Timeline - Rive & Figma Motion Inspired)**:
   - Dedicated layer-by-layer tracks with clean graduation ruler and fluid scrubbing playhead.
   - Matrix 2D is automatically hidden when Timeline is open for total clarity.
   - Auto-keyframing enabled by default: scrub to any time, draw or edit points, and the keyframe is recorded automatically.
   - Strict isolation of selection and transformation to the current temporal keyframe or matrix state.
   - Safe keyframe deletion without wiping strokes from other keyframes.
   - Drag & drop keyframe timing adjustment directly on tracks.
   - In-between easing curve indicators with interactive popover (`easeInOut`, `easeOut`, `easeIn`, `linear`, `spring`, `bounce`).
   - Seamless loop interpolation back into the first keyframe.
   - Loop modes: `loop`, `pingpong`, `once`.
3. **Interactive State Machine & Nodal Graph (Rive & Unity Animator Inspired)**:
   - Floating, draggable and resizable graph window (`StateMachineGraph.tsx`) with pan & zoom and bezier SVG connection cables.
   - Nodes: **Pose** (single keyframe state with direct morphing) and **Clip** (full timeline sequence).
   - Rich trigger suite: `click`, `double_click`, `pointer_down`, `pointer_up`, `hover_enter`, `hover_leave`, `scroll_down`, `scroll_up`, `scroll_scrub`, `key_press`, `delay`, `animation_end`.
   - Continuous scroll scrubbing: drive clips or pose morphs dynamically with the mouse wheel or touchpad.
   - Live Inspector panel for node and transition attributes (duration, easing curve, event parameters).
4. **Galerie Communautaire & Partage Cloud (Firebase Firestore Spark)**:
   - Partage en un clic avec génération automatique de vignette et titre/pseudo.
   - Galerie en ligne avec recherche, prévisualisation et chargement instantané dans l'éditeur.
   - Modération intégrée : bouton de signalement pour les utilisateurs, et authentification Google modérateur (`gulizia.i@gmail.com`) avec suppression en direct.
5. **Settings & Toggles**:
   - Dedicated "Mode Expert" section in Settings panel.
   - URL parameter support: `?mode=expert`.
   - Complete parity in standalone player runtime (`src/player.ts` & `public/prosopopus-player.js`).
