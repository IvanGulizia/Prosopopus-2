# System Architecture

## Architecture Overview

```
+-------------------------------------------------------------+
|                      React UI Layer                         |
|  - Canvas (Drawing & Interactive Play Surface)              |
|  - Timeline (Sequencing, Markers, Easing, Playback)         |
|  - InteractionsPanel (State Machine Rules & Triggers)       |
|  - Toolbar & Settings Panel (Dual Mode Switches & Guides)   |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|               Zustand Central Store (useStore)              |
|  - Project State: axes, keyframes, layers, animations,      |
|    interactions, settings                                   |
|  - UI State: expertModeEnabled, isTimelineOpen, etc.        |
+-------------------------------------------------------------+
                              |
       +----------------------+----------------------+
       |                                             |
       v                                             v
+-----------------------------+        +-----------------------------+
|   Studio Canvas Engine      |        | Standalone Player Engine    |
|   (src/components/Canvas)   |        | (public/prosopopus-player)  |
+-----------------------------+        +-----------------------------+
       |                                             |
       +----------------------+----------------------+
                              |
                              v
+-------------------------------------------------------------+
|               Mathematical Interpolation Core               |
|  - evaluateTimelineAxes & advanceTimelineTime               |
|  - calculateInterpolationWeights (Bilinear / IDW)           |
|  - evaluateEasing (Linear, Cubic, InOut, Spring, Bounce)    |
|  - interpolateStrokePoints & Style resolution               |
|  - Spring Physics & Harmonic Inertial Overshoot             |
+-------------------------------------------------------------+
```

## Modules

- `src/types.ts`: Global TypeScript contracts for axes, keyframes, layers, animations, timeline markers, and interaction rules.
- `src/utils/math.ts`: Geometry, distance metrics, point projection, hit testing (`isPointInStroke`), and spatial interpolation.
- `src/utils/easing.ts`: High-precision cubic, spring, and bounce easing algorithms.
- `src/utils/animation.ts`: Timeline evaluation and playback state advancement.
- `src/player.ts` & `public/prosopopus-player.js`: Standalone runtime engines ensuring 100% parity between studio and external embeds.
