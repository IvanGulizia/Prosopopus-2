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
3. **Interactive State Machine**:
   - Element-level trigger assignment (Figma-style intuitive interaction builder).
   - Triggers: `click`, `hover_enter`, `hover_leave`, `animation_end`.
   - Target scope: specific layer (with precise hit testing) or entire canvas.
   - Actions: `go_to_keyframe` with custom easing/duration, `play_animation`.
4. **Settings & Toggles**:
   - Dedicated "Mode Expert" section in Settings panel.
   - URL parameter support: `?mode=expert`.
   - Complete parity in standalone player runtime (`src/player.ts` & `public/prosopopus-player.js`).
