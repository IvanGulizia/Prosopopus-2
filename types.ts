// types.ts

// --- Basic Geometry ---
export interface Point {
  x: number;
  y: number;
  pressure?: number; // 0 to 1
}

export interface Size {
  width: number;
  height: number;
}

// --- Vector Elements ---
export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface CornerRadii {
  topLeft: number;
  topRight: number;
  bottomRight: number;
  bottomLeft: number;
}

export type ShapeType = 'rectangle' | 'ellipse' | 'polygon' | 'star';

export interface ShapeConfig {
  type: ShapeType;
  x?: number;
  y?: number;
  minX?: number;
  minY?: number;
  width: number;
  height: number;
  rotation?: number;
  cornerRoundness?: number;
  cornerRadii?: CornerRadii;
  sides?: number; // For polygon/star
}

export interface StyleProps {
  strokeColor: string | 'none';
  strokeWidth: number;
  fillColor: string | 'none';
  lineStyle: LineStyle;
  cornerRoundness?: number; // 0 to 100
  cornerRadii?: CornerRadii; // Independent 4 corners
  strokeCap?: 'round' | 'butt' | 'square';
  strokeResolution?: number; // Target point count for interpolation (default 200)
}

export interface Stroke {
  id: string;
  points: Point[];
  closed: boolean; // True for shapes, false for lines
  style?: Partial<StyleProps>; // Overrides for this specific stroke state
  shapeConfig?: ShapeConfig; // Stored shape metadata for non-destructive direct editing
}

// --- Layers ---
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'difference' | 'exclusion';
export type InterpolationMode = 'resample' | 'points' | 'spline' | 'length';
export type LayerDriverMode = 'matrix' | 'timeline' | 'pose';

export interface LayerSymmetryConfig {
  enabled: boolean;
  type: SymmetryType; // 'vertical' | 'horizontal' | 'quad' | 'radial'
  axisX?: number; // Axis X offset in px (default canvas width / 2)
  axisY?: number; // Axis Y offset in px (default canvas height / 2)
  radialCount?: number; // 2..12 for radial
}

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  blendMode: BlendMode;
  opacity: number;
  interpolationMode: InterpolationMode; // Per-layer setting
  driverMode?: LayerDriverMode; // 'matrix' (default, controlled by spatial axes) or 'timeline' (temporal keyframes)
  baseStyle?: StyleProps; // The default style for strokes in this layer
  symmetry?: LayerSymmetryConfig;
  isGuide?: boolean; // Calque Repère: freehand multi-stroke drawing without state interpolation
  guideStrokes?: Stroke[]; // Stored strokes for the guide layer
}

// --- Axes & Keyframes (The Interpolation Engine) ---
export type AxisType = 'mouseX' | 'mouseY' | 'scrollLoop' | 'stylus' | 'time';

export interface Axis {
  id: string;
  name: string;
  type: AxisType;
  min: number;
  max: number;
  currentValue: number; // The live value (0-1 usually)
}

export interface LayerState {
  layerId: string;
  strokes: Stroke[]; // In "Puppet Mode", this array will typically contain exactly ONE stroke.
}

export interface Keyframe {
  id: string;
  name: string;
  // Position in the N-dimensional axis space
  axisValues: Record<string, number>; // e.g., { "x": 0.5, "y": 0 }
  // The content of the drawing at this specific state
  layerStates: LayerState[]; 
}

// --- Timelines & Animation Engine (Mode Expert) ---
export type EasingType = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'cubicBezier' | 'bounce' | 'spring';
export type LoopMode = 'once' | 'loop' | 'pingpong';

// Per-Layer Timeline Keyframe (Temporal vector snapshot for this layer)
export interface LayerTimelineKeyframe {
  id: string;
  time: number; // in seconds, e.g. 0.0, 0.5, 1.2
  strokes: Stroke[]; // Vector snapshot of the layer at this specific time
  easing?: EasingType; // Transition curve towards the next keyframe
  name?: string;
}

// Track for a specific layer in the Timeline
export interface LayerTimelineTrack {
  layerId: string;
  keyframes: LayerTimelineKeyframe[];
  visible?: boolean;
  locked?: boolean;
}

export interface TimelineKeyframeMarker {
  id: string;
  time: number; // in seconds, e.g. 0.0, 1.25...
  keyframeId?: string; // Optional link to a Matrix Keyframe
  axisValues: Record<string, number>; // Position in matrix axis space e.g. { "axis-x": 0.5, "axis-y": 0.5 }
  easing: EasingType; // Transition easing to next marker
  name?: string;
}

export interface AnimationTimeline {
  id: string;
  name: string;
  duration: number; // Duration in seconds (e.g. 2.0s)
  loopMode: LoopMode;
  fps?: number;
  markers?: TimelineKeyframeMarker[]; // Matrix-level pose markers
  tracks?: LayerTimelineTrack[]; // Multi-layer temporal tracks
}

// --- State Machine & Interactive Trigger Rules (Figma-style) ---
export type InteractionTrigger = 'click' | 'hover_enter' | 'hover_leave' | 'animation_end';
export type InteractionActionType = 'play_animation' | 'go_to_keyframe' | 'interpolate_to';

export interface ColliderRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ColliderCircle {
  x: number;
  y: number;
  radius: number;
}

export type InteractionColliderType = 'layer' | 'rect' | 'circle' | 'canvas';

export interface InteractionCollider {
  type: InteractionColliderType;
  rect?: ColliderRect;
  circle?: ColliderCircle;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
}

export interface InteractionAction {
  type: InteractionActionType;
  targetAnimationId?: string;
  targetKeyframeId?: string;
  targetAxisValues?: Record<string, number>;
  duration?: number; // Transition duration in milliseconds (default: 300ms)
  easing?: EasingType;
}

export interface LayerInteraction {
  id: string;
  layerId: string; // Layer ID, 'canvas' for canvas-wide events, or 'collider'
  name?: string;
  trigger: InteractionTrigger;
  action: InteractionAction;
  collider?: InteractionCollider; // Custom hitbox definition
  enabled?: boolean;
}

// --- State Machine Graph System (Rive / Unity Animator Style) ---
export type StateNodeType = 'entry' | 'pose' | 'clip' | 'any';

export interface StateNode {
  id: string;
  name: string;
  type: StateNodeType;
  x: number;
  y: number;
  // For 'clip' nodes: points to an AnimationTimeline
  animationId?: string;
  // Target Layer: 'all' or specific layerId for multi-layer independent control
  targetLayerId?: string;
  // For 'pose' nodes: static snapshot of layer shapes / keyframe
  poseData?: {
    keyframeId?: string; // Optional link to a matrix keyframe
    layerStates?: LayerState[]; // Snapshot of strokes for each layer
    axisValues?: Record<string, number>;
  };
  color?: string; // Custom badge/header color
}

export type StateTransitionTrigger = 
  | 'click'            // Clic sur calque ou canvas
  | 'double_click'     // Double-clic
  | 'pointer_down'     // Appui de souris / toucher
  | 'pointer_up'       // Relâchement
  | 'hover_enter'      // Survol entrant
  | 'hover_leave'      // Survol sortant
  | 'scroll_down'      // Molette vers le bas
  | 'scroll_up'        // Molette vers le haut
  | 'scroll_progress'  // Progression du scroll atteignant un seuil (ex: >= 50%)
  | 'scroll_scrub'     // Pilotage continu direct par le scroll (0.0 -> 1.0)
  | 'animation_end'    // Fin d'animation du clip source
  | 'delay'            // Après un délai (en secondes)
  | 'key_press';       // Touche de clavier pressée

export interface StateTransitionTriggerParams {
  targetType?: 'canvas' | 'layer' | 'collider';
  layerId?: string;          // 'canvas' or specific layerId
  collider?: InteractionCollider; // Custom hitbox definition (rect, circle, layer)
  scrollThreshold?: number;  // 0.0 to 1.0 (for 'scroll_progress')
  scrollRange?: [number, number]; // [start, end] for 'scroll_scrub'
  delaySeconds?: number;     // for 'delay' (e.g. 1.5s)
  key?: string;              // 'Space', 'ArrowRight', 'Enter', etc.
}

export interface StateTransition {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  trigger: StateTransitionTrigger;
  params?: StateTransitionTriggerParams;
  duration: number; // Duration of crossfade / morphing transition in seconds (e.g. 0.35s)
  easing: EasingType;
  name?: string;
}

export interface StateMachine {
  id: string;
  name: string;
  nodes: StateNode[];
  transitions: StateTransition[];
  entryNodeId: string;
}

// --- Project Structure ---
export interface Project {
  id: string;
  name: string;
  version: string;
  created: number;
  modified: number;
  canvasSize: Size; // Fixed dimensions for the artboard
  axes: Axis[];
  layers: Layer[];
  keyframes: Keyframe[];
  animations?: AnimationTimeline[]; // Stored animation timelines
  interactions?: LayerInteraction[]; // Stored interactive state triggers
  stateMachines?: StateMachine[]; // Visual State Machine graphs
  activeStateMachineId?: string | null; // Selected State Machine
  activeAnimationId?: string | null; // Default or active timeline
  settings?: Partial<UIState>; // Store relevant UI settings
}

// --- UI State ---
export type ToolType = 'cursor' | 'select' | 'pen' | 'polyline' | 'shape'; 
export type UIMode = 'edit' | 'play';
// 'bilinear-grid' separates axes logic for stable matrix interpolation
export type InterpolationStrategy = 'idw' | 'bilinear-grid'; 
export type SymmetryType = 'vertical' | 'horizontal' | 'quad' | 'radial';
export type SymmetryTarget = 'merge' | 'layer';
export type OnionSkinMode = 'wireframe' | 'styled' | 'both';
export type InactiveLayerMode = 'dimmed' | 'wireframe' | 'normal' | 'hidden';
export type PlayModeCursorType = 'default' | 'dot' | 'crosshair' | 'none';
export type PlayModeCursorShape = 'circle' | 'square' | 'cross' | 'ring';

export interface Theme {
  bgApp: string;
  bgToolbar: string;
  bgPanel: string;
  accent: string;
  textMain: string;
  textMuted: string;
  border: string;
  // States
  hoverBg: string;
  activeBg: string;
  // Canvas
  canvasBg: string;
  gridColor: string;
}

export interface UIState {
  mode: UIMode;
  selectedTool: ToolType;
  selectedLayerId: string | null;
  selectedKeyframeId: string | null;
  selectedStrokeId: string | null; // For Selection Tool
  transformMode: 'object' | 'points';
  
  isPlaying: boolean;
  isLayerPanelOpen: boolean;
  isSettingsOpen: boolean;
  isExporting: boolean;
  exportFileName: string;
  isDebugMenuOpen: boolean;
  isGalleryOpen: boolean;
  isShareOpen: boolean;
  
  // Mode Expert & Timeline Panels
  expertModeEnabled: boolean; // Master toggle for Expert Mode
  isTimelineOpen: boolean;    // Bottom timeline panel visibility
  autoKeyframeEnabled: boolean; // Auto-keyframing when drawing on timeline
  isInteractionsOpen: boolean;// Right interactions & state machine panel visibility
  activeAnimationId: string | null; // Selected animation timeline ID
  timelinePlaying: boolean;   // Whether timeline is currently running in edit/preview
  timelineCurrentTime: number;// Current playhead in seconds
  selectedMarkerId: string | null; // Selected marker on the timeline track
  selectedLayerTrackId: string | null; // Selected layer track in Timeline
  selectedTimelineKeyframeId: string | null; // Selected temporal keyframe on a layer track
  editingColliderInteractionId: string | null; // Interaction ID currently being edited via canvas collider box
  
  // State Machine Graph Window State
  graphWindowPosition: { x: number; y: number };
  graphWindowSize: { width: number; height: number };
  graphWindowMaximized?: boolean;
  selectedGraphNodeId: string | null;
  selectedGraphTransitionId: string | null;
  activeStateNodeId: string | null; // Active runtime node
  runtimeScrollProgress: number; // 0.0 to 1.0 (driven by scroll/wheel or simulator)
  
  // Theme
  theme: Theme;
  
  // Canvas Helpers
  showGrid: boolean;
  snapToGrid: boolean; // Drawing Snap
  snapScale: number; // Snap Scale multiplier
  strokeCap: 'round' | 'butt' | 'square'; // Stroke linecap
  playModeCursor: PlayModeCursorType;
  playModeCursorShape: PlayModeCursorShape;
  playModeCursorSize: number;
  playModeCursorColor: string;
  
  // Matrix Helpers
  snapPlayMode: boolean; // Snap Cursor in Matrix
  snapMatrixGrid: boolean; // Snap Keyframes in Matrix (New)
  axisMatrixDivisions: number; // How many grid lines (e.g. 5 for 5x5)
  axisMatrixPadding: number; // Percentage padding (0.1 = 10%)
  
  // Math Helpers
  interpolationStrategy: InterpolationStrategy; // New
  interpolationExponent: number; // Controls the "falloff" for IDW mode
  gridCurvature: number; // 0 to 1 (0 = Linear C0, 1 = Smoothstep C1, default 1.0)
  
  // PHYSICS (Spring System & Overshoot)
  playModePhysics: boolean; // Enable physics in Play Mode
  springStiffness: number; // Tension (k)
  springDamping: number;   // Friction (c)
  
  // OVERSHOOT MODES & FACTORS (Can be toggled and combined)
  overshootBouncinessEnabled: boolean; // Option A: Underdamped harmonic spring oscillation
  overshootBounciness: number;         // 0 to 1 (0 = critical damping, 1 = maximum springy oscillation)
  
  overshootRubberbandEnabled: boolean;  // Option B: Rubber-band extension beyond active padding / borders
  overshootRubberbandFactor: number;   // 0 to 1 (pull strength into margin/outside bounds)

  overshootMomentumEnabled: boolean;   // Option C: Kinetic momentum impulse projection based on cursor gesture speed
  overshootMomentumFactor: number;     // 0 to 1 (extrapolation multiplier)

  // GEOMETRIC & INTERPOLATION OVERSHOOT (Shape Extrapolation / Vertex Dynamics)
  // Approche A : Linear State Extrapolation / Negative Weights (weights beyond [0, 1])
  overshootExtrapolationEnabled: boolean;
  overshootExtrapolationFactor: number; // 0 to 1.0 (multiplier for projection beyond pose)

  // Approche B : Vertex Inertial Velocity / Dynamic Jiggle (Disney Follow-Through)
  overshootVertexInertiaEnabled: boolean;
  overshootVertexInertiaFactor: number; // Tension / Reactivity (0.1 to 3.0)
  overshootVertexDamping: number;       // Friction / Damping (0.05 to 1.5)
  overshootVertexMass: number;          // Vertex Weight / Mass Lag (0.2 to 2.5)
  overshootVertexSnapProtection: number; // 0 to 1 (Anti-Snap / Whipping Protection, default 0.75)

  // Approche C : Keyframe Exaggeration / Overdrive Slider
  overshootExaggerationEnabled: boolean;
  overshootExaggerationFactor: number;  // 1.0 to 2.5 (geometric shape extrusion multiplier)

  gridSize: number;
  
  // Animation Helpers
  smoothingEnabled: boolean; // Renamed from simplifyStrokes
  strokeSmoothingFactor: number; // 0 to 1 (0 = Raw/Ultra-detailed, 1 = Heavy smoothing)
  onionSkinEnabled: boolean;
  guideOnionSkinEnabled: boolean;
  guideOnionSkinInPlayMode: boolean; // Optional onion skin for guide layers in Play mode
  guideOnionDistanceOpacity: boolean; // Base opacity on distance in matrix
  guideOnionDistanceRange: number; // Range for distance fading
  guideOnionDirectionalTint: boolean; // Tint onions based on matrix direction
  guideOnionColorUp: string;
  guideOnionColorDown: string;
  guideOnionColorLeft: string;
  guideOnionColorRight: string;
  onionSkinOpacity: number;
  onionSkinMode: OnionSkinMode; // 'wireframe' | 'styled' | 'both'
  inactiveLayerOpacity: number; // 0 to 1, opacity of non-selected layers
  inactiveLayerMode: InactiveLayerMode; // 'dimmed' | 'wireframe' | 'normal' | 'hidden'
  
  // Visual Feedback
  ghostStrokeOpacity: number; // Opacity when drawing in a new/undefined state
  redrawGhostOpacity: number; // Opacity of existing stroke while redrawing over it

  // Viewport & Tools
  zoom: number;
  pan: Point;
  brushSize: number;
  brushColor: string | 'none'; // Can be none now
  fillColor: string | 'none'; 
  cornerRoundness: number; // 0 to 100
  cornerRadii: CornerRadii; // Independent 4 corners
  shapeType: ShapeType; // 'rectangle' | 'ellipse' | 'polygon' | 'star'
  shapeSides: number; // For polygon/star (default 5)
  strokeResolution: number; // Target point count for interpolation

  // Symmetry
  symmetryEnabled: boolean;
  symmetryType: SymmetryType; // 'vertical' | 'horizontal' | 'quad' | 'radial'
  symmetryAxisX: number; // X coordinate for vertical / center (pixels)
  symmetryAxisY: number; // Y coordinate for horizontal / center (pixels)
  symmetryRadialCount: number; // For radial mode: 2, 3, 4, 6, 8 (default 4)
  symmetryTarget: SymmetryTarget; // 'merge' | 'layer'
  showSymmetryAxis: boolean; // Show guide line(s) on canvas

  // PERFORMANCE
  resolutionScale: number; // 0.5 to 3.0 (Pixel Density override)
  performanceMode: boolean; // If true, reduces sample count for interpolation
}