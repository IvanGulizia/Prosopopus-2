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

export interface StyleProps {
  strokeColor: string | 'none';
  strokeWidth: number;
  fillColor: string | 'none';
  lineStyle: LineStyle;
  cornerRoundness?: number; // 0 to 100
  strokeCap?: 'round' | 'butt' | 'square';
  strokeResolution?: number; // Target point count for interpolation (default 200)
}

export interface Stroke {
  id: string;
  points: Point[];
  closed: boolean; // True for shapes, false for lines
  style?: Partial<StyleProps>; // Overrides for this specific stroke state
}

// --- Layers ---
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'difference' | 'exclusion';
export type InterpolationMode = 'resample' | 'points' | 'spline' | 'length';

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
  baseStyle?: StyleProps; // The default style for strokes in this layer
  symmetry?: LayerSymmetryConfig;
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
  settings?: Partial<UIState>; // Store relevant UI settings
}

// --- UI State ---
export type ToolType = 'cursor' | 'select' | 'pen' | 'polyline'; 
export type UIMode = 'edit' | 'play';
// 'bilinear-grid' separates axes logic for stable matrix interpolation
export type InterpolationStrategy = 'idw' | 'bilinear-grid'; 
export type SymmetryType = 'vertical' | 'horizontal' | 'quad' | 'radial';
export type SymmetryTarget = 'merge' | 'layer';
export type OnionSkinMode = 'wireframe' | 'styled' | 'both';
export type InactiveLayerMode = 'dimmed' | 'wireframe' | 'normal' | 'hidden';

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
  
  // Theme
  theme: Theme;
  
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