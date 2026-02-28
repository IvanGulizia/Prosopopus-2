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
export type StrokeStyle = 'solid' | 'dashed' | 'dotted';

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
  style: StrokeStyle;
  closed: boolean; // True for shapes, false for lines
  fillColor?: string; // Optional fill (if undefined/null, no fill)
}

// --- Layers ---
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'difference' | 'exclusion';
export type InterpolationMode = 'resample' | 'points' | 'spline'; // Added 'spline'

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  blendMode: BlendMode;
  opacity: number;
  interpolationMode: InterpolationMode; // Per-layer setting
  cornerRoundness: number; // 0 to 100, controls visual corner rounding
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
}

// --- UI State ---
export type ToolType = 'cursor' | 'select' | 'pen' | 'polyline'; 
export type UIMode = 'edit' | 'play';
// 'bilinear-grid' separates axes logic for stable matrix interpolation
export type InterpolationStrategy = 'idw' | 'bilinear-grid'; 

export interface UIState {
  mode: UIMode;
  selectedTool: ToolType;
  selectedLayerId: string | null;
  selectedKeyframeId: string | null;
  selectedStrokeId: string | null; // For Selection Tool
  
  isPlaying: boolean;
  isLayerPanelOpen: boolean;
  
  // Canvas Helpers
  showGrid: boolean;
  snapToGrid: boolean; // Drawing Snap
  snapScale: number; // Snap Scale multiplier
  strokeCap: 'round' | 'butt' | 'square'; // Stroke linecap
  
  // Matrix Helpers
  snapPlayMode: boolean; // Snap Cursor in Matrix
  snapMatrixGrid: boolean; // Snap Keyframes in Matrix (New)
  axisMatrixDivisions: number; // How many grid lines (e.g. 5 for 5x5)
  axisMatrixPadding: number; // Percentage padding (0.1 = 10%)
  
  // Math Helpers
  interpolationStrategy: InterpolationStrategy; // New
  interpolationExponent: number; // Controls the "falloff" for IDW mode
  
  // PHYSICS (Spring System)
  playModePhysics: boolean; // Enable physics in Play Mode
  springStiffness: number; // Tension (k)
  springDamping: number;   // Friction (c)

  gridSize: number;
  
  // Animation Helpers
  smoothingEnabled: boolean; // Renamed from simplifyStrokes
  onionSkinEnabled: boolean;
  onionSkinOpacity: number;
  inactiveLayerOpacity: number; // 0 to 1, opacity of non-selected layers
  
  // Visual Feedback
  ghostStrokeOpacity: number; // Opacity when drawing in a new/undefined state

  // Viewport & Tools
  zoom: number;
  pan: Point;
  brushSize: number;
  brushColor: string | 'none'; // Can be none now
  fillColor: string | 'none'; 

  // PERFORMANCE
  resolutionScale: number; // 0.5 to 3.0 (Pixel Density override)
  performanceMode: boolean; // If true, reduces sample count for interpolation
}