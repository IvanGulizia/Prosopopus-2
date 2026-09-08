# Changelog

## [2.2.1] - Isolation stricte de la Sélection & Correction de la Suppression Timeline

### Fixed
- **Suppression d'une keyframe sur la timeline** :
  - Résolution du conflit d'événements clavier `Backspace` / `Delete` : la touche Suppr ne supprime plus le tracé entier ou toutes les keyframes d'une piste.
  - La fonction `deleteStroke` a été corrigée pour n'impacter strictement que la pose active au lieu de vider toutes les poses de l'animation.
- **Isolation stricte du contexte de Sélection et Modification** :
  - Élimination des boucles de repli (« fallback ») qui recherchaient le tracé dans les autres keyframes ou dans la matrice.
  - Résolution dynamique de la géométrie affichée à l'instant T (`resolveActiveVisibleStroke` et `resolveLayerVisibleStrokes`) pour les boîtes de transformation (gizmo), les poignées de sommet (mode modification par points), et les poignées d'angles (arrondis).
  - Possibilité de désélectionner immédiatement n'importe quelle forme d'un simple clic sur le fond du canvas, y compris en mode modification par points (`transformMode: 'points'`), permettant de sélectionner et modifier strictement l'état courant.
  - Prise en charge du clic à l'intérieur des formes fermées ou remplies grâce au test point-in-polygon.

## [2.2.0] - Refonte UX/UI de la Timeline & Auto-Keyframe (Inspiration Rive & Figma Motion)

### Added
- **Timeline Minimaliste & Dédiée aux Calques** :
  - Suppression de la piste globale matrice 2D et des textes superflus pour une interface claire et épurée.
  - Masquage mutuel de la Matrice 2D lorsque la Timeline est ouverte pour éviter toute confusion visuelle.
  - Top ruler avec repères temporels gradués et tête de lecture (playhead) fluide.
  - Déplacement libre des poses clés (drag & drop) directement sur la piste temporelle avec mise à jour en temps réel.
- **Auto-Keyframe par défaut** :
  - Dès qu'un instant est sélectionné dans la timeline, tout nouveau tracé ou modification de points crée/met à jour instantanément la pose clé sans manipulation supplémentaire.
- **Sélecteur de Courbes d'Easing Interactif** :
  - Bouton courbe visuelle positionné entre les clés adjacentes avec popover de sélection rapide (`easeInOut`, `easeOut`, `easeIn`, `linear`, `spring`, `bounce`).
- **Interpolation de Boucle Continue** :
  - Transition fluide et sans à-coup de la dernière pose clé vers la première en mode boucle (`loop`).

## [2.1.0] - Mode Expert (Timeline & State Machine Integration)

### Added
- **Animation Timeline Engine**:
  - Keyframe sequencing along temporal tracks.
  - Multi-loop modes (`loop`, `pingpong`, `once`).
  - Advanced curve easing (`linear`, `easeIn`, `easeOut`, `easeInOut`, `spring`, `bounce`).
  - Scrubber, transport controls, and playback engine in `src/utils/animation.ts`.
- **Interactive State Machine**:
  - Element-specific & canvas-wide interaction rules.
  - Triggers for `click`, `hover_enter`, `hover_leave`, and `animation_end`.
  - Smooth target keyframe transitions with parameterized durations and easing.
  - Interactive rules panel in `src/components/InteractionsPanel.tsx`.
- **Dual Mode System**:
  - Optional toggle in Settings (`ui.expertModeEnabled`) and URL parameter support (`?mode=expert`).
- **Universal Player Parity**:
  - Complete standalone runtime parity across `src/player.ts` and `public/prosopopus-player.js`.
- **Documentation**:
  - Initialized `docs/` with Vision, Architecture, State, Decisions, Roadmap, and Changelog.
