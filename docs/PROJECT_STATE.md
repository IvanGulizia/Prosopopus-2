# Project State

## Status: Operational & Stable

### Active Features
1. **Multi-Axis Matrix & Continuous Interpolation**:
   - 2D/3D custom interpolation axes with Bilinear and IDW radial blending.
   - Spring dynamics, kinetic momentum extrapolation, and harmonic vertex inertia.
2. **Calques Composites (Comp) & Sous-Calques Interpolés** :
   - Mode de calque multi-tracés (`type: 'comp'`) accumulant les traits et les formes.
   - Synchronisation stricte par slots invariants : chaque sous-calque (tracé ou forme) conserve son identité (`stroke.id`) sur l'ensemble des poses.
   - Création de slots vides automatiques (`points: []`) lors de l'ajout d'une forme ou d'un tracé dans un état sans impacter les tracés des autres poses.
   - Bouton d'ajout de sous-calque explicite (`addCompSlot`).
   - Sous-calques ordonnés avec identifiants, index (`#1`, `#2`, ...), nommage inline et visibilité individuelle.
   - Volet accordéon escamotable fermé par défaut pour une ergonomie visuelle sans encombrement.
   - Interpolation multi-vectorielle propre sans interpolation croisée parasite entre formes et traits distincts.
3. **Expert Mode (Animation Timeline - Rive & Figma Motion Inspired)**:
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
4. **Galerie Communautaire 2.0 & Partage Cloud (Firebase Firestore Spark)**:
   - Galerie grand format (max-w-7xl) avec flux adaptatif Masonry / Bento box.
   - Prévisualisation interactive en direct (`InteractiveCardPreview.tsx`) animée à 60 FPS avec suivi du curseur et physique vectorielle au survol.
   - Système d'upvote / likes temps réel avec mémorisation locale.
   - Section et filtre "À la une" (Featured) modifiable par l'administrateur en un clic.
   - Onglets de filtrage et tri : Récents, Populaires (par likes), À la une (Featured), Mes créations.
   - Routage URL et liens de partage profonds : `?view=gallery` pour ouvrir directement la galerie, et `?project=<id>` pour charger immédiatement une animation partagée.
   - Modération hybride sans popup : suppression par code PIN pour les créateurs et mot de passe maître Admin (`prosopopus2026`).
5. **Settings & Toggles**:
   - Dedicated "Mode Expert" section in Settings panel.
   - URL parameter support: `?mode=expert`.
   - Complete parity in standalone player runtime (`src/player.ts` & `public/prosopopus-player.js`).
