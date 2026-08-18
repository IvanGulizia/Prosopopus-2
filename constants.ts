// constants.ts
import { Axis, Layer, Project, Keyframe, UIState, Theme } from './types';

export const APP_COLORS = {
  background: '#EAEAEA',
  primary: '#3B82F6',
  textMain: '#1F2937',
  textMuted: '#9CA3AF',
  border: '#E5E7EB',
  surface: '#FFFFFF',
};

// Curated Palette for Design
export const PALETTE_COLORS = [
  '#000000', '#545454', '#737373', '#A6A6A6', '#D9D9D9', '#FFFFFF',
  '#EF4444', '#F97316', '#F59E0B', '#84CC16', '#10B981', '#06B6D4',
  '#3B82F6', '#6366F1', '#8B5CF6', '#D946EF', '#F43F5E', '#881337',
  'none'
];

export const DEFAULT_AXES: Axis[] = [
  { id: 'axis-x', name: 'Horizontal', type: 'mouseX', min: 0, max: 1, currentValue: 0.5 },
  { id: 'axis-y', name: 'Vertical', type: 'mouseY', min: 0, max: 1, currentValue: 0.5 },
];

export const INITIAL_LAYER_ID = 'layer-1';

export const DEFAULT_LAYER: Layer = {
  id: INITIAL_LAYER_ID,
  name: 'Layer 1',
  visible: true,
  locked: false,
  blendMode: 'normal',
  opacity: 1,
  interpolationMode: 'resample', // Default per layer
  baseStyle: {
    strokeColor: '#000000',
    strokeWidth: 4,
    fillColor: 'none',
    lineStyle: 'solid',
    cornerRoundness: 0,
    strokeCap: 'round'
  }
};

export const DEFAULT_KEYFRAME: Keyframe = {
  id: 'kf-origin',
  name: 'Origin',
  axisValues: { 'axis-x': 0.5, 'axis-y': 0.5 },
  layerStates: [
    {
      layerId: INITIAL_LAYER_ID,
      strokes: [],
    }
  ]
};

export const DEFAULT_PROJECT: Project = {
  id: 'project-default',
  name: 'Puppet Project',
  version: '2.9',
  created: Date.now(),
  modified: Date.now(),
  canvasSize: { width: 600, height: 600 },
  axes: DEFAULT_AXES,
  layers: [DEFAULT_LAYER],
  keyframes: [DEFAULT_KEYFRAME],
};

export const INITIAL_THEME: Theme = {
  bgApp: '#F5F5F7',
  bgToolbar: '#FFFFFF',
  bgPanel: '#FFFFFF',
  accent: '#141414',
  textMain: '#1D1D1F',
  textMuted: '#86868B',
  border: '#D2D2D7',
  hoverBg: '#F5F5F7',
  activeBg: '#E8E8ED',
  canvasBg: '#FFFFFF',
  gridColor: '#E5E7EB',
};

export const INITIAL_UI_STATE: UIState = {
  mode: 'edit',
  selectedTool: 'pen',
  selectedLayerId: INITIAL_LAYER_ID,
  selectedKeyframeId: 'kf-origin',
  selectedStrokeId: null,
  transformMode: 'object',
  
  isPlaying: false,
  isLayerPanelOpen: true,
  isSettingsOpen: false,
  isExporting: false,
  exportFileName: 'my-project',
  isDebugMenuOpen: false,

  theme: INITIAL_THEME,
  
  showGrid: false, 
  snapToGrid: false,
  snapScale: 1,
  strokeCap: 'round',
  
  snapPlayMode: false,
  snapMatrixGrid: true, 
  axisMatrixDivisions: 5, // Default 5x5
  axisMatrixPadding: 0.1, // Default 10%
  
  interpolationStrategy: 'bilinear-grid', // UPDATED TO GRID LOGIC
  interpolationExponent: 2.0, // Default for IDW mode if switched
  
  playModePhysics: true, // DEFAULT ENABLED
  springStiffness: 220, // Updated default: 220
  springDamping: 40,    // Updated default: 40
  
  // Overshoot initial defaults
  overshootBouncinessEnabled: true, // 1. Physical spring bounciness enabled by default
  overshootBounciness: 0.5,         // 50%
  overshootRubberbandEnabled: false, // 2. Border rubber-banding disabled by default
  overshootRubberbandFactor: 0.35,
  overshootMomentumEnabled: false,
  overshootMomentumFactor: 0.4,

  // Geometric Overshoot initial defaults
  overshootExtrapolationEnabled: true, // A. Geometric extrapolation enabled by default
  overshootExtrapolationFactor: 0.2,   // 20%
  overshootVertexInertiaEnabled: false,
  overshootVertexInertiaFactor: 0.4,
  overshootVertexDamping: 0.85,
  overshootExaggerationEnabled: false,
  overshootExaggerationFactor: 1.25,

  gridSize: 40, 
  
  smoothingEnabled: true, // Smoothing toggle
  strokeSmoothingFactor: 0.2, // 0 to 1 (0 = Raw/Detailed points, 1 = Heavy smoothing)
  onionSkinEnabled: false,
  onionSkinOpacity: 0.15,
  onionSkinMode: 'both',
  inactiveLayerOpacity: 0.3,
  inactiveLayerMode: 'dimmed',

  ghostStrokeOpacity: 0.4,
  redrawGhostOpacity: 0.25,

  zoom: 1,
  pan: { x: 0, y: 0 },
  brushSize: 4,
  brushColor: '#000000',
  fillColor: 'none', 
  cornerRoundness: 0,
  cornerRadii: { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 },
  shapeType: 'rectangle',
  shapeSides: 5,
  strokeResolution: 400, // High fidelity point resolution

  // Symmetry
  symmetryEnabled: false,
  symmetryType: 'vertical',
  symmetryAxisX: 300,
  symmetryAxisY: 300,
  symmetryRadialCount: 4,
  symmetryTarget: 'layer', // Default: Dynamic Mirror (instead of Unified Contour)
  showSymmetryAxis: true,

  resolutionScale: 1.5, // Crisp default without killing FPS (Retina is usually 2 or 3)
  performanceMode: false, // Default high fidelity, toggleable for low-spec devices
};