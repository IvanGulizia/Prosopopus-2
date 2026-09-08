# Architectural Decisions (ADR)

## ADR 001: Non-Destructive Expert Mode Layering
- **Context**: The user wanted timeline animations and state machine interactivity without altering or breaking the core matrix interpolation functionality.
- **Decision**: Layered Timeline & State Machine on top of the existing matrix model. When animations/transitions are active, they drive `targetAxes`; when inactive, the mouse/pointer physics seamlessly resume control.
- **Consequences**: Zero regressions for existing matrix projects; new capabilities are purely additive and can be enabled/disabled at will.

## ADR 002: Direct Object-Based Interaction Triggering
- **Context**: Need for simple, immediate interaction setup without the overhead of complex visual node wiring.
- **Decision**: Implemented an intuitive "Add Interaction" rule system directly tied to layers or the canvas with trigger types (`click`, `hover_enter`, `hover_leave`, `animation_end`) and smooth transition actions.
- **Consequences**: Fast, discoverable UX matching modern vector design tools.

## ADR 003: Universal Runtime Parity
- **Context**: Embedded player output must strictly match the studio play mode.
- **Decision**: Maintained synchronous implementation between `src/player.ts` and `public/prosopopus-player.js`.
- **Consequences**: Embeds support timeline animations and interaction triggers out of the box with zero external dependencies.
