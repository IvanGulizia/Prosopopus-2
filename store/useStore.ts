// store/useStore.ts
import { create } from 'zustand';
import { Project, UIState, ToolType, Axis, Layer, Keyframe, Point, Stroke, LayerState, BlendMode, UIMode, InterpolationMode, InterpolationStrategy, StyleProps, Theme, SymmetryType, SymmetryTarget, LayerSymmetryConfig, OnionSkinMode, InactiveLayerMode, PlayModeCursorType, PlayModeCursorShape, CornerRadii, ShapeType, ShapeConfig, AnimationTimeline, TimelineKeyframeMarker, EasingType, LoopMode, LayerInteraction, InteractionTrigger, InteractionAction, LayerDriverMode, LayerTimelineTrack, LayerTimelineKeyframe, InteractionCollider, StateMachine, StateNode, StateTransition, StateNodeType, StateTransitionTrigger } from '../types';
import { DEFAULT_PROJECT, INITIAL_UI_STATE, DEFAULT_LAYER, DEFAULT_KEYFRAME, DEFAULT_ANIMATION } from '../constants';
import { simplifyPoints, distance, chaikinSmooth, simplifyCollinearPoints, getSymmetricPoints, getUnifiedSymmetricContour, generateShapePoints } from '../utils/math';
import { getOrCreateDefaultStateMachine } from '../utils/stateMachine';

interface StoreState {
  project: Project;
  ui: UIState;
  
  history: {
    past: Project[];
    future: Project[];
  };

  // Internal Clipboard for Copy/Paste State
  clipboard: LayerState[] | null; 

  // Actions
  undo: () => void;
  redo: () => void;
  
  // Mode Expert & Timeline Actions
  toggleExpertMode: () => void;
  setExpertMode: (enabled: boolean) => void;
  toggleTimelinePanel: () => void;
  toggleInteractionsPanel: () => void;
  setActiveAnimation: (id: string) => void;
  addAnimation: (name?: string) => void;
  deleteAnimation: (id: string) => void;
  renameAnimation: (id: string, name: string) => void;
  setAnimationDuration: (id: string, duration: number) => void;
  setAnimationLoopMode: (id: string, loopMode: LoopMode) => void;
  setTimelineCurrentTime: (time: number) => void;
  setTimelinePlaying: (playing: boolean) => void;
  addTimelineMarker: (animationId: string, time: number, keyframeId?: string, axisValues?: Record<string, number>, easing?: EasingType) => void;
  updateTimelineMarker: (animationId: string, markerId: string, updates: Partial<TimelineKeyframeMarker>) => void;
  deleteTimelineMarker: (animationId: string, markerId: string) => void;
  setSelectedMarker: (markerId: string | null) => void;

  // Layer Timeline Tracks (Multi-Layer Keyframing)
  toggleAutoKeyframe: () => void;
  setAutoKeyframe: (enabled: boolean) => void;
  setLayerDriverMode: (layerId: string, mode: LayerDriverMode) => void;
  addLayerTimelineKeyframe: (layerId: string, time?: number, easing?: EasingType) => void;
  updateLayerTimelineKeyframe: (layerId: string, keyframeId: string, updates: Partial<LayerTimelineKeyframe>) => void;
  moveLayerTimelineKeyframe: (layerId: string, keyframeId: string, newTime: number) => void;
  updateLayerTimelineKeyframeEasing: (layerId: string, keyframeId: string, easing: EasingType) => void;
  deleteLayerTimelineKeyframe: (layerId: string, keyframeId: string) => void;
  duplicateLayerTimelineKeyframe: (layerId: string, keyframeId: string, newTime?: number) => void;
  setSelectedLayerTrack: (layerId: string | null) => void;
  setSelectedTimelineKeyframe: (layerId: string | null, keyframeId: string | null) => void;
  captureCurrentPoseToTimelineKeyframe: (layerId: string, keyframeId: string) => void;

  // State Machine & Interactive Actions (Figma-Style Triggers & Colliders)
  addInteraction: (layerId: string, trigger: InteractionTrigger, action: InteractionAction, name?: string, collider?: InteractionCollider) => void;
  updateInteraction: (id: string, updates: Partial<LayerInteraction>) => void;
  deleteInteraction: (id: string) => void;
  setInteractionCollider: (id: string, collider: InteractionCollider) => void;
  setEditingColliderInteractionId: (interactionId: string | null) => void;

  // Visual State Machine Graph Actions (Rive / Unity Animator Style)
  ensureStateMachine: () => StateMachine;
  addStateNode: (node: Omit<StateNode, 'id'>) => string;
  updateStateNode: (nodeId: string, updates: Partial<StateNode>) => void;
  deleteStateNode: (nodeId: string) => void;
  addStateTransition: (transition: Omit<StateTransition, 'id'>) => string;
  updateStateTransition: (transitionId: string, updates: Partial<StateTransition>) => void;
  deleteStateTransition: (transitionId: string) => void;
  captureCurrentPoseToStateNode: (nodeId: string) => void;
  applyPoseStateNodeToCanvas: (nodeId: string) => void;
  createPoseStateNodeFromCurrent: (name?: string, x?: number, y?: number) => string;
  createClipStateNode: (animationId: string, x?: number, y?: number) => string;
  setGraphWindowPosition: (position: { x: number; y: number }) => void;
  setGraphWindowSize: (size: { width: number; height: number }) => void;
  setGraphWindowMaximized: (maximized: boolean) => void;
  setSelectedGraphNode: (nodeId: string | null) => void;
  setSelectedGraphTransition: (transitionId: string | null) => void;
  setActiveStateNode: (nodeId: string | null) => void;
  setRuntimeScrollProgress: (progress: number) => void;

  // Project Actions
  resetProject: () => void;
  loadProject: (project: Project) => void;

  toggleSettings: () => void;
  toggleGallery: (open?: boolean) => void;
  toggleShareModal: (open?: boolean) => void;
  toggleLayerPanel: () => void;
  closeAllPanels: () => void; // Used for clicking outside

  setMode: (mode: UIMode) => void;
  toggleTransformMode: () => void;
  setTransformMode: (mode: 'object' | 'points') => void;

  setTool: (tool: ToolType) => void;
  setBrushColor: (color: string) => void;
  setFillColor: (color: string) => void;
  setBrushSize: (size: number) => void;
  
  // Layer Global Actions
  updateLayerStrokeColor: (layerId: string, color: string) => void;
  updateLayerFillColor: (layerId: string, color: string) => void;
  updateLayerStrokeWidth: (layerId: string, width: number) => void;
  
  // Config Actions
  toggleGrid: () => void;
  toggleSnapToGrid: () => void;
  setSnapScale: (scale: number) => void;
  setStrokeCap: (cap: 'round' | 'butt' | 'square') => void;
  setPlayModeCursor: (cursor: PlayModeCursorType) => void;
  setPlayModeCursorShape: (shape: PlayModeCursorShape) => void;
  setPlayModeCursorSize: (size: number) => void;
  setPlayModeCursorColor: (color: string) => void;
  
  toggleSnapPlayMode: () => void;
  toggleSnapMatrixGrid: () => void;
  setAxisMatrixDivisions: (val: number) => void;
  setAxisMatrixPadding: (val: number) => void;
  setInterpolationExponent: (val: number) => void;
  setInterpolationStrategy: (val: InterpolationStrategy) => void;
  setGridCurvature: (val: number) => void;
  
  togglePlayModePhysics: () => void;
  setSpringStiffness: (val: number) => void;
  setSpringDamping: (val: number) => void;
  toggleOvershootBounciness: () => void;
  setOvershootBounciness: (val: number) => void;
  toggleOvershootRubberband: () => void;
  setOvershootRubberbandFactor: (val: number) => void;
  toggleOvershootMomentum: () => void;
  setOvershootMomentumFactor: (val: number) => void;

  // Geometric Overshoot Actions
  toggleOvershootExtrapolation: () => void;
  setOvershootExtrapolationFactor: (val: number) => void;
  toggleOvershootVertexInertia: () => void;
  setOvershootVertexInertiaFactor: (val: number) => void;
  setOvershootVertexDamping: (val: number) => void;
  setOvershootVertexMass: (val: number) => void;
  setOvershootVertexSnapProtection: (val: number) => void;
  toggleOvershootExaggeration: () => void;
  setOvershootExaggerationFactor: (val: number) => void;

  setGridSize: (size: number) => void;
  toggleSmoothing: () => void; // Renamed from toggleSimplifyStrokes
  
  toggleOnionSkin: () => void;
  toggleGuideOnionSkin: () => void;
  toggleGuideOnionSkinInPlayMode: () => void;
  toggleGuideOnionDistanceOpacity: () => void;
  setGuideOnionDistanceRange: (range: number) => void;
  toggleGuideOnionDirectionalTint: () => void;
  setGuideOnionColor: (direction: 'Up' | 'Down' | 'Left' | 'Right', color: string) => void;
  setOnionSkinOpacity: (opacity: number) => void;
  setOnionSkinMode: (mode: OnionSkinMode) => void;
  setInactiveLayerOpacity: (opacity: number) => void;
  setInactiveLayerMode: (mode: InactiveLayerMode) => void;
  setGhostStrokeOpacity: (opacity: number) => void;
  setRedrawGhostOpacity: (opacity: number) => void;

  // Performance Actions
  setResolutionScale: (scale: number) => void;
  togglePerformanceMode: () => void;
  setStrokeResolution: (resolution: number) => void;
  setStrokeSmoothingFactor: (factor: number) => void;
  
  // Shape & Corner Radii Actions
  setShapeType: (type: ShapeType) => void;
  setShapeSides: (sides: number) => void;
  setCornerRadii: (radii: Partial<CornerRadii>) => void;
  setCornerRadius: (corner: keyof CornerRadii | 'all', value: number) => void;
  addOrUpdateShapeStroke: (config: ShapeConfig) => void;
  
  // Symmetry Actions
  toggleSymmetry: () => void;
  setSymmetryType: (type: SymmetryType) => void;
  setSymmetryAxisX: (x: number) => void;
  setSymmetryAxisY: (y: number) => void;
  setSymmetryRadialCount: (count: number) => void;
  setSymmetryTarget: (target: SymmetryTarget) => void;
  toggleShowSymmetryAxis: () => void;
  resetSymmetryToCenter: () => void;
  toggleLayerSymmetry: (layerId: string) => void;
  setLayerSymmetryConfig: (layerId: string, config: Partial<LayerSymmetryConfig>) => void;
  
  // Layer Actions
  addLayer: () => void;
  deleteLayer: (layerId: string) => void;
  renameLayer: (layerId: string, name: string) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  toggleLayerVisibility: (layerId: string) => void;
  toggleLayerLock: (layerId: string) => void;
  toggleLayerGuideMode: (layerId: string) => void;
  setLayerBlendMode: (layerId: string, mode: BlendMode) => void;
  setLayerInterpolationMode: (layerId: string, mode: InterpolationMode) => void;
  setLayerCornerRoundness: (layerId: string, roundness: number, applyToAllStates?: boolean) => void;
  setStrokeCornerRoundness: (strokeId: string, roundness: number) => void;
  selectLayer: (layerId: string) => void;
  
  updateAxisValue: (axisId: string, value: number) => void;
  updateMultipleAxisValues: (values: Record<string, number>) => void;
  updateCanvasSize: (width: number, height: number) => void; // Batch update
  renameProject: (name: string) => void;
  
  addStrokeToCurrentKeyframe: (points: Point[], closed?: boolean, skipSimplify?: boolean) => void; 
  updateStrokeInCurrentKeyframe: (strokeId: string, newPoints: Point[], shapeConfig?: ShapeConfig) => void;
  deleteStroke: (strokeId: string) => void; 
  
  createKeyframeAtCurrentAxes: () => void;
  deleteKeyframe: (keyframeId: string, targetLayerId?: string) => void;
  deleteKeyframeStateForLayer: (keyframeId: string, layerId: string) => void;
  updateKeyframePosition: (keyframeId: string, x: number, y: number) => void; 
  splitKeyframeForLayer: (keyframeId: string, layerId: string) => string;
  selectKeyframe: (keyframeId: string) => void;
  
  // Copy/Paste Actions
  copyKeyframeState: () => void;
  pasteKeyframeState: () => void;
  
  selectStroke: (strokeId: string | null) => void;
  
  toggleDebugMenu: () => void;
  setThemeColor: (key: keyof Theme, color: string) => void;
}

import { resolveStrokeStyle } from '../utils/style';
import { evaluateLayerTimelineStrokes } from '../utils/animation';

const MAX_HISTORY = 50;

// HELPER: Get current timeline strokes (interpolated if between keyframes, or matching keyframe)
export const getTimelineStrokesForTime = (
  track: LayerTimelineTrack | undefined,
  targetTime: number,
  layer: Layer | undefined,
  anim: AnimationTimeline | undefined,
  fallbackStrokes: Stroke[] = []
): Stroke[] => {
  if (!track || !track.keyframes || track.keyframes.length === 0) {
    return JSON.parse(JSON.stringify(fallbackStrokes));
  }
  const matchKf = track.keyframes.find(k => Math.abs(k.time - targetTime) <= 0.03);
  if (matchKf && matchKf.strokes && matchKf.strokes.length > 0) {
    return JSON.parse(JSON.stringify(matchKf.strokes));
  }
  const evalStrokes = evaluateLayerTimelineStrokes(
    track,
    targetTime,
    layer?.interpolationMode || 'resample',
    200,
    anim?.loopMode || 'loop',
    anim?.duration || 2.0,
    layer
  );
  if (evalStrokes && evalStrokes.length > 0) {
    return JSON.parse(JSON.stringify(evalStrokes));
  }
  return JSON.parse(JSON.stringify(fallbackStrokes));
};

// HELPER: Extract UI properties (color, width) from the current selection context
const getHydratedUIProps = (
  project: Project,
  layerId: string | null,
  kfId: string | null,
  strokeId: string | null,
  timelineKfId?: string | null,
  timelineTime?: number
): Partial<UIState> => {
    if (!layerId) return {};

    const layer = project.layers.find(l => l.id === layerId);
    if (!layer) return {};

    let strokesToSearch: Stroke[] = [];

    const animations = project.animations || [];
    const activeAnim = animations[0];
    const track = activeAnim?.tracks?.find(t => t.layerId === layerId);

    if ((layer.driverMode === 'timeline' || timelineKfId !== undefined || timelineTime !== undefined) && track) {
        if (timelineKfId) {
            const tlKf = track.keyframes.find(k => k.id === timelineKfId);
            if (tlKf && tlKf.strokes && tlKf.strokes.length > 0) {
                strokesToSearch = tlKf.strokes;
            }
        }
        if (strokesToSearch.length === 0 && timelineTime !== undefined) {
            strokesToSearch = evaluateLayerTimelineStrokes(
                track,
                timelineTime,
                layer.interpolationMode || 'resample',
                200,
                activeAnim?.loopMode || 'loop',
                activeAnim?.duration || 2.0,
                layer
            );
        }
    } else if (kfId) {
        const kf = project.keyframes.find(k => k.id === kfId);
        if (kf) {
            const layerState = kf.layerStates.find(ls => ls.layerId === layerId);
            if (layerState) {
                strokesToSearch = layerState.strokes;
            }
        }
    }

    if (strokesToSearch.length === 0) {
        // Fallback to layer base style if no strokes exist
        const style = resolveStrokeStyle(undefined, layer);
        return {
            brushColor: style.strokeColor,
            fillColor: style.fillColor,
            brushSize: style.strokeWidth,
            cornerRoundness: style.cornerRoundness,
            strokeResolution: style.strokeResolution || 200
        };
    }

    // Determine which stroke to read from
    let targetStroke = strokesToSearch[0]; // Default to first
    if (strokeId) {
        const found = strokesToSearch.find(s => s.id === strokeId);
        if (found) targetStroke = found;
    }

    const style = resolveStrokeStyle(targetStroke, layer);

    return {
        brushColor: style.strokeColor,
        fillColor: style.fillColor,
        brushSize: style.strokeWidth,
        cornerRoundness: style.cornerRoundness,
        strokeResolution: style.strokeResolution || 200,
        cornerRadii: targetStroke.shapeConfig?.cornerRadii || targetStroke.style?.cornerRadii
    };
};

export const useStore = create<StoreState>((set, get) => ({
  project: DEFAULT_PROJECT,
  ui: INITIAL_UI_STATE,
  clipboard: null, // Initialize clipboard
  
  history: {
    past: [],
    future: []
  },

  resetProject: () => set((state) => {
      // FORCE FRESH IDs TO ENSURE REACT RE-MOUNTS COMPONENTS
      const newLayerId = `layer-${Date.now()}`;
      const newKfId = `kf-${Date.now()}`;
      
      return {
          project: {
              ...DEFAULT_PROJECT,
              id: `project-${Date.now()}`, // Fresh Project ID
              created: Date.now(),
              modified: Date.now(),
              layers: [{...DEFAULT_LAYER, id: newLayerId}],
              keyframes: [{...DEFAULT_KEYFRAME, id: newKfId, layerStates: [{ layerId: newLayerId, strokes: [] }] }]
          },
          ui: {
              ...state.ui,
              selectedLayerId: newLayerId,
              selectedKeyframeId: newKfId,
              selectedStrokeId: null, // Explicitly clear selection
              pan: { x: 0, y: 0 },
              zoom: 1,
              isPlaying: false,
              mode: 'edit'
          },
          clipboard: null,
          history: { past: [], future: [] }
      };
  }),

  renameProject: (name: string) => set((state) => ({
      project: { ...state.project, name }
  })),

  loadProject: (project) => set((state) => ({
      project: project,
      ui: {
          ...state.ui,
          ...(project.settings || {}), // Restore settings if they exist
          selectedLayerId: project.layers[0]?.id || null,
          selectedKeyframeId: project.keyframes[0]?.id || null,
          isSettingsOpen: false // Close settings after import
      },
      clipboard: null,
      history: { past: [], future: [] }
  })),

  toggleSettings: () => set((state) => ({ ui: { ...state.ui, isSettingsOpen: !state.ui.isSettingsOpen, isLayerPanelOpen: false, isDebugMenuOpen: false } })),
  toggleGallery: (open) => set((state) => ({ ui: { ...state.ui, isGalleryOpen: open !== undefined ? open : !state.ui.isGalleryOpen, isShareOpen: false } })),
  toggleShareModal: (open) => set((state) => ({ ui: { ...state.ui, isShareOpen: open !== undefined ? open : !state.ui.isShareOpen } })),
  toggleLayerPanel: () => set((state) => ({ ui: { ...state.ui, isLayerPanelOpen: !state.ui.isLayerPanelOpen, isSettingsOpen: false, isDebugMenuOpen: false } })),
  toggleDebugMenu: () => set((state) => ({ ui: { ...state.ui, isDebugMenuOpen: !state.ui.isDebugMenuOpen, isSettingsOpen: false } })),
  setThemeColor: (key, color) => set((state) => ({ ui: { ...state.ui, theme: { ...state.ui.theme, [key]: color } } })),
  closeAllPanels: () => set((state) => ({ ui: { ...state.ui, isSettingsOpen: false, isLayerPanelOpen: false } })),

  setMode: (mode) => set((state) => {
    const activeAnim = state.project.animations?.find(a => a.id === state.ui.activeAnimationId) || state.project.animations?.[0];
    const duration = activeAnim?.duration || 2.0;

    return {
      ui: {
        ...state.ui,
        mode,
        // Start playing the timeline automatically when entering Play mode
        timelinePlaying: mode === 'play',
        timelineCurrentTime: (mode === 'play' && state.ui.timelineCurrentTime >= duration - 0.05) ? 0 : state.ui.timelineCurrentTime,
        // Auto-close panels when entering Play mode
        isLayerPanelOpen: mode === 'play' ? false : state.ui.isLayerPanelOpen,
        isSettingsOpen: mode === 'play' ? false : state.ui.isSettingsOpen,
        isTimelineOpen: mode === 'play' ? false : state.ui.isTimelineOpen
      }
    };
  }),

  undo: () => set((state) => {
    if (state.history.past.length === 0) return state;
    const previous = state.history.past[state.history.past.length - 1];
    const newPast = state.history.past.slice(0, -1);
    
    // HYDRATE UI FROM UNDO STATE
    const restoredUIProps = getHydratedUIProps(
        previous, 
        state.ui.selectedLayerId, 
        state.ui.selectedKeyframeId, 
        state.ui.selectedStrokeId,
        state.ui.selectedTimelineKeyframeId
    );

    return {
      project: previous,
      ui: { ...state.ui, ...restoredUIProps },
      history: {
        past: newPast,
        future: [state.project, ...state.history.future]
      }
    };
  }),

  redo: () => set((state) => {
    if (state.history.future.length === 0) return state;
    const next = state.history.future[0];
    const newFuture = state.history.future.slice(1);
    
    // HYDRATE UI FROM REDO STATE
    const restoredUIProps = getHydratedUIProps(
        next, 
        state.ui.selectedLayerId, 
        state.ui.selectedKeyframeId, 
        state.ui.selectedStrokeId,
        state.ui.selectedTimelineKeyframeId
    );

    return {
      project: next,
      ui: { ...state.ui, ...restoredUIProps },
      history: {
        past: [...state.history.past, state.project],
        future: newFuture
      }
    };
  }),

  toggleTransformMode: () => set((state) => {
      let newSelectedStrokeId = state.ui.selectedStrokeId;
      
      // Auto-select stroke if we don't have one and we are switching to select mode
      if (state.ui.selectedLayerId && state.ui.selectedKeyframeId && !newSelectedStrokeId) {
          const kf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId);
          if (kf) {
              const ls = kf.layerStates.find(l => l.layerId === state.ui.selectedLayerId);
              if (ls && ls.strokes.length > 0) {
                  newSelectedStrokeId = ls.strokes[0].id;
              }
          }
      }

      return {
        ui: {
          ...state.ui,
          selectedTool: 'select', // Force select tool when toggling transform mode
          selectedStrokeId: newSelectedStrokeId,
          transformMode: state.ui.transformMode === 'object' ? 'points' : 'object'
        }
      };
  }),

  setTransformMode: (mode) => set((state) => {
      let newSelectedStrokeId = state.ui.selectedStrokeId;
      
      // Auto-select stroke if we don't have one and we are switching to select mode
      if (state.ui.selectedLayerId && state.ui.selectedKeyframeId && !newSelectedStrokeId) {
          const kf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId);
          if (kf) {
              const ls = kf.layerStates.find(l => l.layerId === state.ui.selectedLayerId);
              if (ls && ls.strokes.length > 0) {
                  newSelectedStrokeId = ls.strokes[0].id;
              }
          }
      }

      return {
        ui: {
          ...state.ui,
          selectedTool: 'select', // Force select tool when setting transform mode
          selectedStrokeId: newSelectedStrokeId,
          transformMode: mode
        }
      };
  }),

  setTool: (tool) => set((state) => {
      let newSelectedStrokeId = state.ui.selectedStrokeId;
      
      // Auto-select stroke if switching to a transform tool
      if (tool === 'select' && state.ui.selectedLayerId && state.ui.selectedKeyframeId && !newSelectedStrokeId) {
          const kf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId);
          if (kf) {
              const ls = kf.layerStates.find(l => l.layerId === state.ui.selectedLayerId);
              if (ls && ls.strokes.length > 0) {
                  newSelectedStrokeId = ls.strokes[0].id;
              }
          }
      }

      return { 
          ui: { 
              ...state.ui, 
              selectedTool: tool, 
              selectedStrokeId: newSelectedStrokeId,
              // Keep transformMode as is if switching to select, so it remembers point vs object
              transformMode: tool === 'select' ? state.ui.transformMode : state.ui.transformMode,
          } 
      };
  }),
  
  // --- BATCH UPDATE: PROPERTIES (Color/Size) ---
  // If a stroke is selected, these functions update the stroke across ALL keyframes.
  
  setBrushColor: (color) => set((state) => {
    const strokeColor = color === 'none' ? 'none' : color;
    const newUI = { ...state.ui, brushColor: color };
    const targetStrokeId = state.ui.selectedStrokeId;
    const targetLayerId = state.ui.selectedLayerId;
    
    let newKeyframes = state.project.keyframes;
    let newAnimations = state.project.animations;
    let newTimelineKfId = state.ui.selectedTimelineKeyframeId;
    let didChange = false;

    // 1. Update in Matrix Keyframe if keyframe & layer selected
    if (state.ui.selectedKeyframeId && targetLayerId) {
        didChange = true;
        newKeyframes = state.project.keyframes.map(kf => {
            if (kf.id !== state.ui.selectedKeyframeId) return kf;
            return {
                ...kf,
                layerStates: kf.layerStates.map(ls => {
                    if (ls.layerId !== targetLayerId) return ls;
                    return {
                        ...ls,
                        strokes: ls.strokes.map(s => {
                            if (targetStrokeId && s.id !== targetStrokeId) return s;
                            return { ...s, style: { ...s.style, strokeColor } };
                        })
                    };
                })
            };
        });
    }

    // 2. Update or Auto-Keyframe in Timeline if Timeline is Open or Layer is Timeline Driven
    const isTimelineMode = state.ui.isTimelineOpen || (targetLayerId && state.project.layers.find(l => l.id === targetLayerId)?.driverMode === 'timeline');
    if (isTimelineMode && targetLayerId && newAnimations && newAnimations.length > 0) {
        const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || newAnimations[0].id;
        const targetTime = Math.round((state.ui.timelineCurrentTime ?? 0) * 100) / 100;

        newAnimations = newAnimations.map(anim => {
            if (anim.id !== activeAnimId) return anim;
            const tracks = anim.tracks || [];
            const trackIndex = tracks.findIndex(t => t.layerId === targetLayerId);
            if (trackIndex < 0) {
              if (!state.ui.autoKeyframeEnabled) return anim;
              newTimelineKfId = `kf-tl-${Date.now()}`;
              const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
              const layerStrokes = matrixKf?.layerStates.find(ls => ls.layerId === targetLayerId)?.strokes || [];
              const clonedStrokes = layerStrokes.map(s => ({
                  ...s,
                  id: s.id,
                  style: targetStrokeId ? (s.id === targetStrokeId ? { ...s.style, strokeColor } : s.style) : { ...s.style, strokeColor }
              }));
              const newTlKf: LayerTimelineKeyframe = { id: newTimelineKfId, time: targetTime, strokes: clonedStrokes, easing: "easeInOut", name: `Pose ${targetTime.toFixed(2)}s` };
              return { ...anim, tracks: [...tracks, { layerId: targetLayerId, keyframes: [newTlKf] }] };
            }
            const track = tracks[trackIndex];
            const existingKfIndex = track.keyframes.findIndex(k => Math.abs(k.time - targetTime) <= 0.03);

            if (existingKfIndex >= 0) {
                didChange = true;
                const updatedKf = track.keyframes.map((k, idx) => {
                    if (idx !== existingKfIndex) return k;
                    return {
                        ...k,
                        strokes: (k.strokes || []).map(s => {
                            if (targetStrokeId && s.id !== targetStrokeId) return s;
                            return { ...s, style: { ...s.style, strokeColor } };
                        })
                    };
                });
                return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKf } : t) };
            } else if (state.ui.autoKeyframeEnabled) {
                didChange = true;
                newTimelineKfId = `kf-tl-${Date.now()}`;
                const targetLayer = state.project.layers.find(l => l.id === targetLayerId);
                const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
                const layerStrokes = getTimelineStrokesForTime(track, targetTime, targetLayer, anim, matrixKf?.layerStates.find(ls => ls.layerId === targetLayerId)?.strokes || []);
                const clonedStrokes = layerStrokes.map(s => ({
                    ...s,
                    id: s.id,
                    style: targetStrokeId ? (s.id === targetStrokeId ? { ...s.style, strokeColor } : s.style) : { ...s.style, strokeColor }
                }));

                const newKf: LayerTimelineKeyframe = {
                    id: newTimelineKfId,
                    time: targetTime,
                    strokes: clonedStrokes,
                    easing: 'easeInOut',
                    name: `Pose ${targetTime.toFixed(2)}s`
                };
                const updatedKeyframes = [...track.keyframes, newKf].sort((a, b) => a.time - b.time);
                return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKeyframes } : t) };
            }
            return anim;
        });
    }

    if (didChange) {
        const past = [...state.history.past, state.project].slice(-MAX_HISTORY);
        return {
            ui: { ...newUI, ...(newTimelineKfId ? { selectedTimelineKeyframeId: newTimelineKfId } : {}) },
            project: { ...state.project, keyframes: newKeyframes, animations: newAnimations },
            history: { past, future: [] }
        };
    }

    return { ui: newUI };
  }),

  setFillColor: (color) => set((state) => {
    const newUI = { ...state.ui, fillColor: color };
    const targetStrokeId = state.ui.selectedStrokeId;
    const targetLayerId = state.ui.selectedLayerId;
    
    let newKeyframes = state.project.keyframes;
    let newAnimations = state.project.animations;
    let newTimelineKfId = state.ui.selectedTimelineKeyframeId;
    let didChange = false;

    if (state.ui.selectedKeyframeId && targetLayerId) {
        didChange = true;
        newKeyframes = state.project.keyframes.map(kf => {
            if (kf.id !== state.ui.selectedKeyframeId) return kf;
            return {
                ...kf,
                layerStates: kf.layerStates.map(ls => {
                    if (ls.layerId !== targetLayerId) return ls;
                    return {
                        ...ls,
                        strokes: ls.strokes.map(s => {
                            if (targetStrokeId && s.id !== targetStrokeId) return s;
                            return { ...s, style: { ...s.style, fillColor: color } };
                        })
                    };
                })
            };
        });
    }

    const isTimelineMode = state.ui.isTimelineOpen || (targetLayerId && state.project.layers.find(l => l.id === targetLayerId)?.driverMode === 'timeline');
    if (isTimelineMode && targetLayerId && newAnimations && newAnimations.length > 0) {
        const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || newAnimations[0].id;
        const targetTime = Math.round((state.ui.timelineCurrentTime ?? 0) * 100) / 100;

        newAnimations = newAnimations.map(anim => {
            if (anim.id !== activeAnimId) return anim;
            const tracks = anim.tracks || [];
            const trackIndex = tracks.findIndex(t => t.layerId === targetLayerId);
            if (trackIndex < 0) {
              if (!state.ui.autoKeyframeEnabled) return anim;
              newTimelineKfId = `kf-tl-${Date.now()}`;
              const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
              const layerStrokes = matrixKf?.layerStates.find(ls => ls.layerId === targetLayerId)?.strokes || [];
              const clonedStrokes = layerStrokes.map(s => ({
                  ...s,
                  id: s.id,
                  style: targetStrokeId ? (s.id === targetStrokeId ? { ...s.style, fillColor: color } : s.style) : { ...s.style, fillColor: color }
              }));
              const newTlKf: LayerTimelineKeyframe = { id: newTimelineKfId, time: targetTime, strokes: clonedStrokes, easing: "easeInOut", name: `Pose ${targetTime.toFixed(2)}s` };
              return { ...anim, tracks: [...tracks, { layerId: targetLayerId, keyframes: [newTlKf] }] };
            }
            const track = tracks[trackIndex];
            const existingKfIndex = track.keyframes.findIndex(k => Math.abs(k.time - targetTime) <= 0.03);

            if (existingKfIndex >= 0) {
                didChange = true;
                const updatedKf = track.keyframes.map((k, idx) => {
                    if (idx !== existingKfIndex) return k;
                    return {
                        ...k,
                        strokes: (k.strokes || []).map(s => {
                            if (targetStrokeId && s.id !== targetStrokeId) return s;
                            return { ...s, style: { ...s.style, fillColor: color } };
                        })
                    };
                });
                return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKf } : t) };
            } else if (state.ui.autoKeyframeEnabled) {
                didChange = true;
                newTimelineKfId = `kf-tl-${Date.now()}`;
                const targetLayer = state.project.layers.find(l => l.id === targetLayerId);
                const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
                const layerStrokes = getTimelineStrokesForTime(track, targetTime, targetLayer, anim, matrixKf?.layerStates.find(ls => ls.layerId === targetLayerId)?.strokes || []);
                const clonedStrokes = layerStrokes.map(s => ({
                    ...s,
                    id: s.id,
                    style: targetStrokeId ? (s.id === targetStrokeId ? { ...s.style, fillColor: color } : s.style) : { ...s.style, fillColor: color }
                }));

                const newKf: LayerTimelineKeyframe = {
                    id: newTimelineKfId,
                    time: targetTime,
                    strokes: clonedStrokes,
                    easing: 'easeInOut',
                    name: `Pose ${targetTime.toFixed(2)}s`
                };
                const updatedKeyframes = [...track.keyframes, newKf].sort((a, b) => a.time - b.time);
                return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKeyframes } : t) };
            }
            return anim;
        });
    }

    if (didChange) {
        const past = [...state.history.past, state.project].slice(-MAX_HISTORY);
        return {
            ui: { ...newUI, ...(newTimelineKfId ? { selectedTimelineKeyframeId: newTimelineKfId } : {}) },
            project: { ...state.project, keyframes: newKeyframes, animations: newAnimations },
            history: { past, future: [] }
        };
    }

    return { ui: newUI };
  }),

  setBrushSize: (size) => set((state) => {
    const newUI = { ...state.ui, brushSize: size };
    const targetStrokeId = state.ui.selectedStrokeId;
    const targetLayerId = state.ui.selectedLayerId;
    
    let newKeyframes = state.project.keyframes;
    let newAnimations = state.project.animations;
    let newTimelineKfId = state.ui.selectedTimelineKeyframeId;
    let didChange = false;

    if (state.ui.selectedKeyframeId && targetLayerId) {
        didChange = true;
        newKeyframes = state.project.keyframes.map(kf => {
            if (kf.id !== state.ui.selectedKeyframeId) return kf;
            return {
                ...kf,
                layerStates: kf.layerStates.map(ls => {
                    if (ls.layerId !== targetLayerId) return ls;
                    return {
                        ...ls,
                        strokes: ls.strokes.map(s => {
                            if (targetStrokeId && s.id !== targetStrokeId) return s;
                            return { ...s, style: { ...s.style, strokeWidth: size } };
                        })
                    };
                })
            };
        });
    }

    const isTimelineMode = state.ui.isTimelineOpen || (targetLayerId && state.project.layers.find(l => l.id === targetLayerId)?.driverMode === 'timeline');
    if (isTimelineMode && targetLayerId && newAnimations && newAnimations.length > 0) {
        const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || newAnimations[0].id;
        const targetTime = Math.round((state.ui.timelineCurrentTime ?? 0) * 100) / 100;

        newAnimations = newAnimations.map(anim => {
            if (anim.id !== activeAnimId) return anim;
            const tracks = anim.tracks || [];
            const trackIndex = tracks.findIndex(t => t.layerId === targetLayerId);
            if (trackIndex < 0) {
              if (!state.ui.autoKeyframeEnabled) return anim;
              newTimelineKfId = `kf-tl-${Date.now()}`;
              const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
              const layerStrokes = matrixKf?.layerStates.find(ls => ls.layerId === targetLayerId)?.strokes || [];
              const clonedStrokes = layerStrokes.map(s => ({
                  ...s,
                  id: s.id,
                  style: targetStrokeId ? (s.id === targetStrokeId ? { ...s.style, strokeWidth: size } : s.style) : { ...s.style, strokeWidth: size }
              }));
              const newTlKf: LayerTimelineKeyframe = { id: newTimelineKfId, time: targetTime, strokes: clonedStrokes, easing: "easeInOut", name: `Pose ${targetTime.toFixed(2)}s` };
              return { ...anim, tracks: [...tracks, { layerId: targetLayerId, keyframes: [newTlKf] }] };
            }
            const track = tracks[trackIndex];
            const existingKfIndex = track.keyframes.findIndex(k => Math.abs(k.time - targetTime) <= 0.03);

            if (existingKfIndex >= 0) {
                didChange = true;
                const updatedKf = track.keyframes.map((k, idx) => {
                    if (idx !== existingKfIndex) return k;
                    return {
                        ...k,
                        strokes: (k.strokes || []).map(s => {
                            if (targetStrokeId && s.id !== targetStrokeId) return s;
                            return { ...s, style: { ...s.style, strokeWidth: size } };
                        })
                    };
                });
                return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKf } : t) };
            } else if (state.ui.autoKeyframeEnabled) {
                didChange = true;
                newTimelineKfId = `kf-tl-${Date.now()}`;
                const targetLayer = state.project.layers.find(l => l.id === targetLayerId);
                const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
                const layerStrokes = getTimelineStrokesForTime(track, targetTime, targetLayer, anim, matrixKf?.layerStates.find(ls => ls.layerId === targetLayerId)?.strokes || []);
                const clonedStrokes = layerStrokes.map(s => ({
                    ...s,
                    id: s.id,
                    style: targetStrokeId ? (s.id === targetStrokeId ? { ...s.style, strokeWidth: size } : s.style) : { ...s.style, strokeWidth: size }
                }));

                const newKf: LayerTimelineKeyframe = {
                    id: newTimelineKfId,
                    time: targetTime,
                    strokes: clonedStrokes,
                    easing: 'easeInOut',
                    name: `Pose ${targetTime.toFixed(2)}s`
                };
                const updatedKeyframes = [...track.keyframes, newKf].sort((a, b) => a.time - b.time);
                return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKeyframes } : t) };
            }
            return anim;
        });
    }

    if (didChange) {
        const past = [...state.history.past, state.project].slice(-MAX_HISTORY);
        return {
            ui: { ...newUI, ...(newTimelineKfId ? { selectedTimelineKeyframeId: newTimelineKfId } : {}) },
            project: { ...state.project, keyframes: newKeyframes, animations: newAnimations },
            history: { past, future: [] }
        };
    }

    return { ui: newUI };
  }),
  
  updateLayerStrokeColor: (layerId, color) => set((state) => {
    const strokeColor = color === 'none' ? 'none' : color;
    const past = [...state.history.past, state.project].slice(-MAX_HISTORY);

    const newLayers = state.project.layers.map(l => {
        if (l.id !== layerId) return l;
        return {
            ...l,
            baseStyle: {
                ...(l.baseStyle || { strokeColor: '#000', strokeWidth: 4, fillColor: 'none', lineStyle: 'solid' }),
                strokeColor
            }
        };
    });

    // Bulk update across all matrix keyframes
    const newKeyframes = state.project.keyframes.map(kf => ({
        ...kf,
        layerStates: kf.layerStates.map(ls => {
            if (ls.layerId !== layerId) return ls;
            return {
                ...ls,
                strokes: ls.strokes.map(s => {
                    if (!s.style) return s;
                    const { strokeColor: _, ...rest } = s.style;
                    return {
                        ...s,
                        style: Object.keys(rest).length > 0 ? rest : undefined
                    };
                })
            };
        })
    }));

    // Bulk update across all timeline animations and tracks for this layer!
    const newAnimations = (state.project.animations || []).map(anim => {
        if (!anim.tracks) return anim;
        return {
            ...anim,
            tracks: anim.tracks.map(t => {
                if (t.layerId !== layerId) return t;
                return {
                    ...t,
                    keyframes: t.keyframes.map(k => ({
                        ...k,
                        strokes: (k.strokes || []).map(s => {
                            if (!s.style) return s;
                            const { strokeColor: _, ...rest } = s.style;
                            return {
                                ...s,
                                style: Object.keys(rest).length > 0 ? rest : undefined
                            };
                        })
                    }))
                };
            })
        };
    });

    return { 
       ui: state.ui.selectedLayerId === layerId ? { ...state.ui, brushColor: color } : state.ui,
       project: { ...state.project, layers: newLayers, keyframes: newKeyframes, animations: newAnimations },
       history: { past, future: [] }
    };
  }),

  updateLayerFillColor: (layerId, color) => set((state) => {
    const past = [...state.history.past, state.project].slice(-MAX_HISTORY);

    const newLayers = state.project.layers.map(l => {
        if (l.id !== layerId) return l;
        return {
            ...l,
            baseStyle: {
                ...(l.baseStyle || { strokeColor: '#000', strokeWidth: 4, fillColor: 'none', lineStyle: 'solid' }),
                fillColor: color
            }
        };
    });

    // Bulk update across all matrix keyframes
    const newKeyframes = state.project.keyframes.map(kf => ({
        ...kf,
        layerStates: kf.layerStates.map(ls => {
            if (ls.layerId !== layerId) return ls;
            return {
                ...ls,
                strokes: ls.strokes.map(s => {
                    if (!s.style) return s;
                    const { fillColor: _, ...rest } = s.style;
                    return {
                        ...s,
                        style: Object.keys(rest).length > 0 ? rest : undefined
                    };
                })
            };
        })
    }));

    // Bulk update across all timeline animations and tracks for this layer!
    const newAnimations = (state.project.animations || []).map(anim => {
        if (!anim.tracks) return anim;
        return {
            ...anim,
            tracks: anim.tracks.map(t => {
                if (t.layerId !== layerId) return t;
                return {
                    ...t,
                    keyframes: t.keyframes.map(k => ({
                        ...k,
                        strokes: (k.strokes || []).map(s => {
                            if (!s.style) return s;
                            const { fillColor: _, ...rest } = s.style;
                            return {
                                ...s,
                                style: Object.keys(rest).length > 0 ? rest : undefined
                            };
                        })
                    }))
                };
            })
        };
    });

    return { 
       ui: state.ui.selectedLayerId === layerId ? { ...state.ui, fillColor: color } : state.ui,
       project: { ...state.project, layers: newLayers, keyframes: newKeyframes, animations: newAnimations },
       history: { past, future: [] }
    };
  }),

  updateLayerStrokeWidth: (layerId, width) => set((state) => {
    const past = [...state.history.past, state.project].slice(-MAX_HISTORY);

    const newLayers = state.project.layers.map(l => {
        if (l.id !== layerId) return l;
        return {
            ...l,
            baseStyle: {
                ...(l.baseStyle || { strokeColor: '#000', strokeWidth: 4, fillColor: 'none', lineStyle: 'solid' }),
                strokeWidth: width
            }
        };
    });

    // Bulk update across all matrix keyframes
    const newKeyframes = state.project.keyframes.map(kf => ({
        ...kf,
        layerStates: kf.layerStates.map(ls => {
            if (ls.layerId !== layerId) return ls;
            return {
                ...ls,
                strokes: ls.strokes.map(s => {
                    if (!s.style) return s;
                    const { strokeWidth: _, ...rest } = s.style;
                    return {
                        ...s,
                        style: Object.keys(rest).length > 0 ? rest : undefined
                    };
                })
            };
        })
    }));

    // Bulk update across all timeline animations and tracks for this layer!
    const newAnimations = (state.project.animations || []).map(anim => {
        if (!anim.tracks) return anim;
        return {
            ...anim,
            tracks: anim.tracks.map(t => {
                if (t.layerId !== layerId) return t;
                return {
                    ...t,
                    keyframes: t.keyframes.map(k => ({
                        ...k,
                        strokes: (k.strokes || []).map(s => {
                            if (!s.style) return s;
                            const { strokeWidth: _, ...rest } = s.style;
                            return {
                                ...s,
                                style: Object.keys(rest).length > 0 ? rest : undefined
                            };
                        })
                    }))
                };
            })
        };
    });

    return { 
       ui: state.ui.selectedLayerId === layerId ? { ...state.ui, brushSize: width } : state.ui,
       project: { ...state.project, layers: newLayers, keyframes: newKeyframes, animations: newAnimations },
       history: { past, future: [] }
    };
  }),

  toggleGrid: () => set((state) => ({ ui: { ...state.ui, showGrid: !state.ui.showGrid } })),
  toggleSnapToGrid: () => set((state) => ({ ui: { ...state.ui, snapToGrid: !state.ui.snapToGrid } })),
  setSnapScale: (scale) => set((state) => ({ ui: { ...state.ui, snapScale: scale } })),
  setStrokeCap: (cap) => set((state) => ({ ui: { ...state.ui, strokeCap: cap } })),
  setPlayModeCursor: (cursor) => set((state) => ({ ui: { ...state.ui, playModeCursor: cursor } })),
  setPlayModeCursorShape: (shape) => set((state) => ({ ui: { ...state.ui, playModeCursorShape: shape } })),
  setPlayModeCursorSize: (size) => set((state) => ({ ui: { ...state.ui, playModeCursorSize: size } })),
  setPlayModeCursorColor: (color) => set((state) => ({ ui: { ...state.ui, playModeCursorColor: color } })),
  
  toggleSnapPlayMode: () => set((state) => ({ ui: { ...state.ui, snapPlayMode: !state.ui.snapPlayMode } })),
  toggleSnapMatrixGrid: () => set((state) => ({ ui: { ...state.ui, snapMatrixGrid: !state.ui.snapMatrixGrid } })),
  setAxisMatrixDivisions: (val) => set((state) => ({ ui: { ...state.ui, axisMatrixDivisions: val } })),
  setAxisMatrixPadding: (val) => set((state) => ({ ui: { ...state.ui, axisMatrixPadding: val } })),
  setInterpolationExponent: (val) => set((state) => ({ ui: { ...state.ui, interpolationExponent: val } })),
  setInterpolationStrategy: (val) => set((state) => ({ ui: { ...state.ui, interpolationStrategy: val } })),
  setGridCurvature: (val) => set((state) => ({ ui: { ...state.ui, gridCurvature: val } })),
  
  togglePlayModePhysics: () => set((state) => ({ ui: { ...state.ui, playModePhysics: !state.ui.playModePhysics } })),
  setSpringStiffness: (val) => set((state) => ({ ui: { ...state.ui, springStiffness: val } })),
  setSpringDamping: (val) => set((state) => ({ ui: { ...state.ui, springDamping: val } })),
  toggleOvershootBounciness: () => set((state) => ({ ui: { ...state.ui, overshootBouncinessEnabled: !state.ui.overshootBouncinessEnabled } })),
  setOvershootBounciness: (val) => set((state) => ({ ui: { ...state.ui, overshootBounciness: val } })),
  toggleOvershootRubberband: () => set((state) => ({ ui: { ...state.ui, overshootRubberbandEnabled: !state.ui.overshootRubberbandEnabled } })),
  setOvershootRubberbandFactor: (val) => set((state) => ({ ui: { ...state.ui, overshootRubberbandFactor: val } })),
  toggleOvershootMomentum: () => set((state) => ({ ui: { ...state.ui, overshootMomentumEnabled: !state.ui.overshootMomentumEnabled } })),
  setOvershootMomentumFactor: (val) => set((state) => ({ ui: { ...state.ui, overshootMomentumFactor: val } })),

  // Geometric Overshoot Implementations
  toggleOvershootExtrapolation: () => set((state) => ({ ui: { ...state.ui, overshootExtrapolationEnabled: !state.ui.overshootExtrapolationEnabled } })),
  setOvershootExtrapolationFactor: (val) => set((state) => ({ ui: { ...state.ui, overshootExtrapolationFactor: val } })),
  toggleOvershootVertexInertia: () => set((state) => ({ ui: { ...state.ui, overshootVertexInertiaEnabled: !state.ui.overshootVertexInertiaEnabled } })),
  setOvershootVertexInertiaFactor: (val) => set((state) => ({ ui: { ...state.ui, overshootVertexInertiaFactor: val } })),
  setOvershootVertexDamping: (val) => set((state) => ({ ui: { ...state.ui, overshootVertexDamping: val } })),
  setOvershootVertexMass: (val) => set((state) => ({ ui: { ...state.ui, overshootVertexMass: val } })),
  setOvershootVertexSnapProtection: (val) => set((state) => ({ ui: { ...state.ui, overshootVertexSnapProtection: val } })),
  toggleOvershootExaggeration: () => set((state) => ({ ui: { ...state.ui, overshootExaggerationEnabled: !state.ui.overshootExaggerationEnabled } })),
  setOvershootExaggerationFactor: (val) => set((state) => ({ ui: { ...state.ui, overshootExaggerationFactor: val } })),

  setGridSize: (size) => set((state) => ({ ui: { ...state.ui, gridSize: size } })),
  toggleSmoothing: () => set((state) => ({ ui: { ...state.ui, smoothingEnabled: !state.ui.smoothingEnabled } })),
  
  toggleOnionSkin: () => set((state) => ({ ui: { ...state.ui, onionSkinEnabled: !state.ui.onionSkinEnabled } })),
  toggleGuideOnionSkin: () => set((state) => ({ ui: { ...state.ui, guideOnionSkinEnabled: !state.ui.guideOnionSkinEnabled } })),
  toggleGuideOnionSkinInPlayMode: () => set((state) => ({ ui: { ...state.ui, guideOnionSkinInPlayMode: !state.ui.guideOnionSkinInPlayMode } })),
  toggleGuideOnionDistanceOpacity: () => set((state) => ({ ui: { ...state.ui, guideOnionDistanceOpacity: !state.ui.guideOnionDistanceOpacity } })),
  setGuideOnionDistanceRange: (range) => set((state) => ({ ui: { ...state.ui, guideOnionDistanceRange: range } })),
  toggleGuideOnionDirectionalTint: () => set((state) => ({ ui: { ...state.ui, guideOnionDirectionalTint: !state.ui.guideOnionDirectionalTint } })),
  setGuideOnionColor: (direction, color) => set((state) => ({ ui: { ...state.ui, [`guideOnionColor${direction}`]: color } })),
  setOnionSkinOpacity: (opacity) => set((state) => ({ ui: { ...state.ui, onionSkinOpacity: opacity } })),
  setOnionSkinMode: (mode) => set((state) => ({ ui: { ...state.ui, onionSkinMode: mode } })),
  setInactiveLayerOpacity: (opacity) => set((state) => ({ ui: { ...state.ui, inactiveLayerOpacity: opacity } })),
  setInactiveLayerMode: (mode) => set((state) => ({ ui: { ...state.ui, inactiveLayerMode: mode } })),
  setGhostStrokeOpacity: (opacity) => set((state) => ({ ui: { ...state.ui, ghostStrokeOpacity: opacity } })),
  setRedrawGhostOpacity: (opacity) => set((state) => ({ ui: { ...state.ui, redrawGhostOpacity: opacity } })),

  setResolutionScale: (scale) => set((state) => ({ ui: { ...state.ui, resolutionScale: scale } })),
  togglePerformanceMode: () => set((state) => ({ ui: { ...state.ui, performanceMode: !state.ui.performanceMode } })),
  setStrokeSmoothingFactor: (factor) => set((state) => ({ ui: { ...state.ui, strokeSmoothingFactor: Math.max(0, Math.min(1, factor)) } })),
  
  // Shape & Corner Radii Actions
  setShapeType: (type) => set((state) => ({ ui: { ...state.ui, shapeType: type } })),
  setShapeSides: (sides) => set((state) => ({ ui: { ...state.ui, shapeSides: Math.max(3, Math.min(20, sides)) } })),
  
  setCornerRadii: (radii) => set((state) => {
    const current = state.ui.cornerRadii || { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
    const updated = { ...current, ...radii };
    const avg = Math.round((updated.topLeft + updated.topRight + updated.bottomRight + updated.bottomLeft) / 4);

    let newKeyframes = state.project.keyframes;
    const targetStrokeId = state.ui.selectedStrokeId;
    const targetLayerId = state.ui.selectedLayerId;

    if (state.ui.selectedKeyframeId && targetLayerId && targetStrokeId) {
      newKeyframes = state.project.keyframes.map(kf => {
        if (kf.id !== state.ui.selectedKeyframeId) return kf;
        return {
          ...kf,
          layerStates: kf.layerStates.map(ls => {
            if (ls.layerId !== targetLayerId) return ls;
            return {
              ...ls,
              strokes: ls.strokes.map(s => {
                if (s.id !== targetStrokeId) return s;
                return {
                  ...s,
                  style: { ...(s.style || {}), cornerRadii: updated },
                  shapeConfig: s.shapeConfig ? { ...s.shapeConfig, cornerRadii: updated } : s.shapeConfig
                };
              })
            };
          })
        };
      });
    }

    let newAnimations = state.project.animations;
    let newTimelineKfId = state.ui.selectedTimelineKeyframeId;
    const isTimelineMode = state.ui.isTimelineOpen || (targetLayerId && state.project.layers.find(l => l.id === targetLayerId)?.driverMode === 'timeline');

    if (isTimelineMode && targetLayerId && newAnimations && newAnimations.length > 0) {
      const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || newAnimations[0].id;
      const targetTime = Math.round((state.ui.timelineCurrentTime ?? 0) * 100) / 100;

      newAnimations = newAnimations.map(anim => {
        if (anim.id !== activeAnimId) return anim;
        const tracks = anim.tracks || [];
        const trackIndex = tracks.findIndex(t => t.layerId === targetLayerId);
        if (trackIndex < 0) {
          if (!state.ui.autoKeyframeEnabled) return anim;
          newTimelineKfId = `kf-tl-${Date.now()}`;
          const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
          const layerStrokes = matrixKf?.layerStates.find(ls => ls.layerId === targetLayerId)?.strokes || [];
          const clonedStrokes = layerStrokes.map(s => ({
            ...s,
            id: s.id,
            style: targetStrokeId ? (s.id === targetStrokeId ? { ...(s.style || {}), cornerRadii: updated } : s.style) : { ...(s.style || {}), cornerRadii: updated },
            shapeConfig: s.shapeConfig ? (targetStrokeId ? (s.id === targetStrokeId ? { ...s.shapeConfig, cornerRadii: updated } : s.shapeConfig) : { ...s.shapeConfig, cornerRadii: updated }) : s.shapeConfig
          }));
          const newTlKf: LayerTimelineKeyframe = { id: newTimelineKfId, time: targetTime, strokes: clonedStrokes, easing: "easeInOut", name: `Pose ${targetTime.toFixed(2)}s` };
          return { ...anim, tracks: [...tracks, { layerId: targetLayerId, keyframes: [newTlKf] }] };
        }
        const track = tracks[trackIndex];
        const existingKfIndex = track.keyframes.findIndex(k => Math.abs(k.time - targetTime) <= 0.03);

        if (existingKfIndex >= 0) {
          const updatedKf = track.keyframes.map((k, idx) => {
            if (idx !== existingKfIndex) return k;
            return {
              ...k,
              strokes: (k.strokes || []).map(s => {
                if (targetStrokeId && s.id !== targetStrokeId) return s;
                return {
                  ...s,
                  style: { ...(s.style || {}), cornerRadii: updated },
                  shapeConfig: s.shapeConfig ? { ...s.shapeConfig, cornerRadii: updated } : s.shapeConfig
                };
              })
            };
          });
          return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKf } : t) };
        } else if (state.ui.autoKeyframeEnabled) {
          newTimelineKfId = `kf-tl-${Date.now()}`;
          const targetLayer = state.project.layers.find(l => l.id === targetLayerId);
          const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
          const layerStrokes = getTimelineStrokesForTime(track, targetTime, targetLayer, anim, matrixKf?.layerStates.find(ls => ls.layerId === targetLayerId)?.strokes || []);
          const clonedStrokes = layerStrokes.map(s => ({
            ...s,
            id: s.id,
            style: targetStrokeId ? (s.id === targetStrokeId ? { ...(s.style || {}), cornerRadii: updated } : s.style) : { ...(s.style || {}), cornerRadii: updated },
            shapeConfig: s.shapeConfig ? (targetStrokeId ? (s.id === targetStrokeId ? { ...s.shapeConfig, cornerRadii: updated } : s.shapeConfig) : { ...s.shapeConfig, cornerRadii: updated }) : s.shapeConfig
          }));

          const newKf: LayerTimelineKeyframe = {
            id: newTimelineKfId,
            time: targetTime,
            strokes: clonedStrokes,
            easing: 'easeInOut',
            name: `Pose ${targetTime.toFixed(2)}s`
          };
          const updatedKeyframes = [...track.keyframes, newKf].sort((a, b) => a.time - b.time);
          return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKeyframes } : t) };
        }
        return anim;
      });
    }

    return {
      ui: { ...state.ui, cornerRadii: updated, cornerRoundness: avg, ...(newTimelineKfId ? { selectedTimelineKeyframeId: newTimelineKfId } : {}) },
      project: { ...state.project, keyframes: newKeyframes, animations: newAnimations }
    };
  }),

  setCornerRadius: (corner, value) => set((state) => {
    const v = Math.max(0, Math.min(200, value));
    let updated: CornerRadii;
    if (corner === 'all') {
      updated = { topLeft: v, topRight: v, bottomRight: v, bottomLeft: v };
    } else {
      const current = state.ui.cornerRadii || { topLeft: 0, topRight: 0, bottomRight: 0, bottomLeft: 0 };
      updated = { ...current, [corner]: v };
    }
    const avg = Math.round((updated.topLeft + updated.topRight + updated.bottomRight + updated.bottomLeft) / 4);

    let newKeyframes = state.project.keyframes;
    const strokeId = state.ui.selectedStrokeId;
    const layerId = state.ui.selectedLayerId;
    const kfId = state.ui.selectedKeyframeId;

    if (kfId && layerId && strokeId) {
      let baseStroke: Stroke | undefined;
      for (const k of state.project.keyframes) {
        const ls = k.layerStates.find(l => l.layerId === layerId);
        const s = ls?.strokes.find(st => st.id === strokeId);
        if (s) { baseStroke = s; break; }
      }

      newKeyframes = state.project.keyframes.map(kf => {
        if (kf.id !== kfId) return kf;
        let foundLayer = false;
        const newLayerStates = kf.layerStates.map(ls => {
          if (ls.layerId !== layerId) return ls;
          foundLayer = true;
          let foundStroke = false;
          const strokes = ls.strokes.map(s => {
            if (s.id !== strokeId) return s;
            foundStroke = true;
            return {
              ...s,
              style: { ...(s.style || {}), cornerRadii: updated },
              shapeConfig: s.shapeConfig ? { ...s.shapeConfig, cornerRadii: updated } : (baseStroke?.shapeConfig ? { ...baseStroke.shapeConfig, cornerRadii: updated } : undefined)
            };
          });
          if (!foundStroke && baseStroke) {
            strokes.push({
              ...baseStroke,
              style: { ...(baseStroke.style || {}), cornerRadii: updated },
              shapeConfig: baseStroke.shapeConfig ? { ...baseStroke.shapeConfig, cornerRadii: updated } : undefined
            });
          }
          return { ...ls, strokes };
        });

        if (!foundLayer && baseStroke) {
          newLayerStates.push({
            layerId,
            strokes: [{
              ...baseStroke,
              style: { ...(baseStroke.style || {}), cornerRadii: updated },
              shapeConfig: baseStroke.shapeConfig ? { ...baseStroke.shapeConfig, cornerRadii: updated } : undefined
            }]
          });
        }

        return { ...kf, layerStates: newLayerStates };
      });
    }

    let newAnimations = state.project.animations;
    let newTimelineKfId = state.ui.selectedTimelineKeyframeId;
    const isTimelineMode = state.ui.isTimelineOpen || (layerId && state.project.layers.find(l => l.id === layerId)?.driverMode === 'timeline');

    if (isTimelineMode && layerId && newAnimations && newAnimations.length > 0) {
      const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || newAnimations[0].id;
      const targetTime = Math.round((state.ui.timelineCurrentTime ?? 0) * 100) / 100;

      newAnimations = newAnimations.map(anim => {
        if (anim.id !== activeAnimId) return anim;
        const tracks = anim.tracks || [];
        let trackIndex = tracks.findIndex(t => t.layerId === layerId);
        if (trackIndex < 0) {
          if (!state.ui.autoKeyframeEnabled) return anim;
          newTimelineKfId = `kf-tl-${Date.now()}`;
          const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
          const layerStrokes = matrixKf?.layerStates.find(ls => ls.layerId === layerId)?.strokes || [];
          const clonedStrokes = layerStrokes.map(s => ({
            ...s,
            id: s.id,
            style: s.id === strokeId ? { ...(s.style || {}), cornerRadii: updated } : s.style,
            shapeConfig: s.shapeConfig ? (s.id === strokeId ? { ...s.shapeConfig, cornerRadii: updated } : s.shapeConfig) : s.shapeConfig
          }));
          const newTlKf: LayerTimelineKeyframe = { id: newTimelineKfId, time: targetTime, strokes: clonedStrokes, easing: "easeInOut", name: `Pose ${targetTime.toFixed(2)}s` };
          return { ...anim, tracks: [...tracks, { layerId, keyframes: [newTlKf] }] };
        }
        const track = tracks[trackIndex];
        const existingKfIndex = track.keyframes.findIndex(k => Math.abs(k.time - targetTime) <= 0.03);

        if (existingKfIndex >= 0) {
          const updatedKf = track.keyframes.map((k, idx) => {
            if (idx !== existingKfIndex) return k;
            return {
              ...k,
              strokes: (k.strokes || []).map(s => {
                if (strokeId && s.id !== strokeId) return s;
                return {
                  ...s,
                  style: { ...(s.style || {}), cornerRadii: updated },
                  shapeConfig: s.shapeConfig ? { ...s.shapeConfig, cornerRadii: updated } : s.shapeConfig
                };
              })
            };
          });
          return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKf } : t) };
        } else if (state.ui.autoKeyframeEnabled) {
          newTimelineKfId = `kf-tl-${Date.now()}`;
          const targetLayer = state.project.layers.find(l => l.id === layerId);
          const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
          const layerStrokes = getTimelineStrokesForTime(track, targetTime, targetLayer, anim, matrixKf?.layerStates.find(ls => ls.layerId === layerId)?.strokes || []);
          const clonedStrokes = layerStrokes.map(s => ({
            ...s,
            id: s.id,
            style: strokeId ? (s.id === strokeId ? { ...(s.style || {}), cornerRadii: updated } : s.style) : { ...(s.style || {}), cornerRadii: updated },
            shapeConfig: s.shapeConfig ? (strokeId ? (s.id === strokeId ? { ...s.shapeConfig, cornerRadii: updated } : s.shapeConfig) : { ...s.shapeConfig, cornerRadii: updated }) : s.shapeConfig
          }));

          const newKf: LayerTimelineKeyframe = {
            id: newTimelineKfId,
            time: targetTime,
            strokes: clonedStrokes,
            easing: 'easeInOut',
            name: `Pose ${targetTime.toFixed(2)}s`
          };
          const updatedKeyframes = [...track.keyframes, newKf].sort((a, b) => a.time - b.time);
          return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKeyframes } : t) };
        }
        return anim;
      });
    }

    return {
      ui: { ...state.ui, cornerRadii: updated, cornerRoundness: avg, ...(newTimelineKfId ? { selectedTimelineKeyframeId: newTimelineKfId } : {}) },
      project: { ...state.project, keyframes: newKeyframes, animations: newAnimations }
    };
  }),

  addOrUpdateShapeStroke: (config) => set((state) => {
    const { selectedLayerId, brushColor, fillColor, brushSize, strokeResolution } = state.ui;
    if (!selectedLayerId) return state;

    const layer = state.project.layers.find(l => l.id === selectedLayerId);
    if (layer?.locked || !layer?.visible) return state;

    const targetPointsCount = strokeResolution || 400;
    const points = generateShapePoints(config, targetPointsCount);
    if (points.length === 0) return state;

    const baseStyle = layer.baseStyle || { strokeColor: '#000000', strokeWidth: 4, fillColor: 'none', lineStyle: 'solid', cornerRoundness: 0, strokeResolution: 200 };
    const styleOverride: Partial<StyleProps> = {};
    if (brushColor !== baseStyle.strokeColor) styleOverride.strokeColor = brushColor as string;
    if (fillColor !== baseStyle.fillColor) styleOverride.fillColor = fillColor;
    if (brushSize !== baseStyle.strokeWidth) styleOverride.strokeWidth = brushSize;
    if (config.cornerRadii) styleOverride.cornerRadii = config.cornerRadii;

    const past = [...state.history.past, state.project].slice(-MAX_HISTORY);

    const currentAxisValues: Record<string, number> = {};
    state.project.axes.forEach(a => currentAxisValues[a.id] = a.currentValue);

    let targetKeyframeId = state.ui.selectedKeyframeId;
    let keyframes = [...state.project.keyframes];
    
    if (targetKeyframeId === null) {
      const newKfId = `kf-${Date.now()}`;
      const newKeyframe: Keyframe = {
        id: newKfId,
        name: `Keyframe ${keyframes.length}`,
        axisValues: currentAxisValues,
        layerStates: [] 
      };
      keyframes.push(newKeyframe);
      targetKeyframeId = newKfId;
    }

    const isGuideLayer = layer?.isGuide === true;
    const strokeId = isGuideLayer 
      ? `guide-stroke-${selectedLayerId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
      : `stroke-${selectedLayerId}-unique`;

    const newStroke: Stroke = {
      id: strokeId,
      points,
      closed: true,
      style: Object.keys(styleOverride).length > 0 ? styleOverride : undefined,
      shapeConfig: config
    };

    let finalLayers = state.project.layers;
    if (state.ui.isTimelineOpen && layer?.driverMode !== 'timeline') {
      finalLayers = finalLayers.map(l => l.id === selectedLayerId ? { ...l, driverMode: 'timeline' as LayerDriverMode } : l);
    }
    let newKeyframes: Keyframe[];

    if (isGuideLayer) {
      finalLayers = state.project.layers.map(l => {
        if (l.id === selectedLayerId) {
          return {
            ...l,
            guideStrokes: [...(l.guideStrokes || []), newStroke]
          };
        }
        return l;
      });

      newKeyframes = keyframes.map(kf => {
        if (kf.id === targetKeyframeId) {
          let newLayerStates = [...kf.layerStates];
          const existingLayerStateIndex = newLayerStates.findIndex(ls => ls.layerId === selectedLayerId);
          if (existingLayerStateIndex >= 0) {
            newLayerStates[existingLayerStateIndex] = {
              ...newLayerStates[existingLayerStateIndex],
              strokes: [...newLayerStates[existingLayerStateIndex].strokes, newStroke]
            };
          } else {
            newLayerStates.push({
              layerId: selectedLayerId,
              strokes: [newStroke]
            });
          }
          return { ...kf, layerStates: newLayerStates };
        }
        return kf;
      });
    } else {
      newKeyframes = keyframes.map(kf => {
        if (kf.id === targetKeyframeId) {
          let newLayerStates = [...kf.layerStates].filter(ls => !ls.layerId.includes('-sym-'));
          const existingLayerStateIndex = newLayerStates.findIndex(ls => ls.layerId === selectedLayerId);
          if (existingLayerStateIndex >= 0) {
            newLayerStates[existingLayerStateIndex] = {
              ...newLayerStates[existingLayerStateIndex],
              strokes: [newStroke]
            };
          } else {
            newLayerStates.push({
              layerId: selectedLayerId,
              strokes: [newStroke]
            });
          }
          return { ...kf, layerStates: newLayerStates };
        }
        return kf;
      });
    }

    // Pose Editing Mode Check:
    // If current layer is 'pose' or an active/selected Pose node is present, do NOT create timeline keyframes
    const currentSM = state.project.stateMachines?.find(s => s.id === state.project.activeStateMachineId) || state.project.stateMachines?.[0];
    const activePoseNodeId = state.ui.activeStateNodeId || state.ui.selectedGraphNodeId;
    const activePoseNode = currentSM?.nodes.find(n => n.id === activePoseNodeId && n.type === 'pose');
    const isPoseEditing = !!activePoseNode || layer?.driverMode === 'pose';

    // Automatically sync shape stroke into Timeline track if Timeline is open or layer is timeline-driven (and not pose mode)
    let updatedAnimations = state.project.animations && state.project.animations.length > 0
      ? state.project.animations
      : [DEFAULT_ANIMATION];
    let createdTlKeyframeId: string | null = state.ui.selectedTimelineKeyframeId;

    if (!isPoseEditing && (state.ui.isTimelineOpen || layer?.driverMode === 'timeline')) {
      const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || updatedAnimations[0].id;
      const targetTime = Math.round((state.ui.timelineCurrentTime ?? 0) * 100) / 100;

      updatedAnimations = updatedAnimations.map(anim => {
        if (anim.id === activeAnimId) {
          const tracks = anim.tracks || [];
          const trackIndex = tracks.findIndex(t => t.layerId === selectedLayerId);
          let updatedTracks: LayerTimelineTrack[];

          if (trackIndex >= 0) {
            const track = tracks[trackIndex];
            const existingKfIndex = track.keyframes.findIndex(k => Math.abs(k.time - targetTime) <= 0.03);
            let updatedKf: LayerTimelineKeyframe[];

            if (existingKfIndex >= 0) {
              const existing = track.keyframes[existingKfIndex];
              createdTlKeyframeId = existing.id;
              const currentStrokes = existing.strokes || [];
              const matchIdx = currentStrokes.findIndex(s => s.id === strokeId);
              let newStrokes: Stroke[];
              if (isGuideLayer) {
                newStrokes = [...currentStrokes, newStroke];
              } else if (matchIdx >= 0) {
                newStrokes = currentStrokes.map(s => s.id === strokeId ? newStroke : s);
              } else {
                newStrokes = [newStroke];
              }
              updatedKf = track.keyframes.map((k, idx) => idx === existingKfIndex ? { ...k, strokes: newStrokes } : k);
            } else {
              createdTlKeyframeId = `kf-tl-${Date.now()}`;
              const targetLayer = state.project.layers.find(l => l.id === selectedLayerId);
              const baseStrokes = getTimelineStrokesForTime(track, targetTime, targetLayer, anim, []);
              const newStrokes = isGuideLayer
                ? [...baseStrokes, newStroke]
                : (baseStrokes.some(s => s.id === strokeId)
                    ? baseStrokes.map(s => s.id === strokeId ? newStroke : s)
                    : [newStroke]);
              const newTlKf: LayerTimelineKeyframe = {
                id: createdTlKeyframeId,
                time: targetTime,
                strokes: newStrokes,
                easing: 'easeInOut',
                name: `Pose ${targetTime.toFixed(2)}s`
              };
              updatedKf = [...track.keyframes, newTlKf].sort((a, b) => a.time - b.time);
            }

            updatedTracks = tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKf } : t);
          } else {
            createdTlKeyframeId = `kf-tl-${Date.now()}`;
            const targetLayer = state.project.layers.find(l => l.id === selectedLayerId);
            const baseStrokes = getTimelineStrokesForTime(undefined, targetTime, targetLayer, anim, []);
            const newStrokes = isGuideLayer ? [...baseStrokes, newStroke] : [newStroke];
            const newTlKf: LayerTimelineKeyframe = {
              id: createdTlKeyframeId,
              time: targetTime,
              strokes: newStrokes,
              easing: 'easeInOut',
              name: `Pose ${targetTime.toFixed(2)}s`
            };
            updatedTracks = [
              ...tracks,
              {
                layerId: selectedLayerId,
                keyframes: [newTlKf]
              }
            ];
          }

          return { ...anim, tracks: updatedTracks };
        }
        return anim;
      });
    }

    // Auto-sync into active Pose Node!
    let updatedStateMachines = state.project.stateMachines;
    if (activePoseNode && updatedStateMachines) {
      updatedStateMachines = updatedStateMachines.map(sm => {
        if (sm.id !== currentSM?.id) return sm;
        const updatedNodes = sm.nodes.map(n => {
          if (n.id !== activePoseNode.id) return n;
          const currentLs = n.poseData?.layerStates || [];
          const existingLsIdx = currentLs.findIndex(ls => ls.layerId === selectedLayerId);
          let newLs: LayerState[];
          if (isGuideLayer) {
            if (existingLsIdx >= 0) {
              newLs = currentLs.map((ls, idx) => idx === existingLsIdx ? { ...ls, strokes: [...ls.strokes, newStroke] } : ls);
            } else {
              newLs = [...currentLs, { layerId: selectedLayerId, strokes: [newStroke] }];
            }
          } else {
            if (existingLsIdx >= 0) {
              newLs = currentLs.map((ls, idx) => idx === existingLsIdx ? { ...ls, strokes: [newStroke] } : ls);
            } else {
              newLs = [...currentLs, { layerId: selectedLayerId, strokes: [newStroke] }];
            }
          }
          return {
            ...n,
            targetLayerId: n.targetLayerId && n.targetLayerId !== 'all' ? n.targetLayerId : selectedLayerId,
            poseData: {
              ...(n.poseData || {}),
              layerStates: newLs
            }
          };
        });
        return { ...sm, nodes: updatedNodes };
      });
    }

    return {
      project: {
        ...state.project,
        layers: finalLayers,
        keyframes: newKeyframes,
        animations: updatedAnimations,
        stateMachines: updatedStateMachines
      },
      ui: { 
        ...state.ui, 
        selectedKeyframeId: targetKeyframeId,
        selectedStrokeId: strokeId,
        cornerRadii: config.cornerRadii || state.ui.cornerRadii,
        ...(createdTlKeyframeId ? { selectedTimelineKeyframeId: createdTlKeyframeId, selectedLayerTrackId: selectedLayerId } : {})
      },
      history: { past, future: [] }
    };
  }),
  
  // Symmetry Actions
  toggleSymmetry: () => set((state) => {
    const nextEnabled = !state.ui.symmetryEnabled;
    const selectedLayerId = state.ui.selectedLayerId;
    let updatedLayers = state.project.layers;
    if (selectedLayerId) {
      updatedLayers = updatedLayers.map(l => {
        if (l.id === selectedLayerId) {
          return {
            ...l,
            symmetry: {
              enabled: nextEnabled,
              type: l.symmetry?.type || state.ui.symmetryType,
              axisX: l.symmetry?.axisX ?? state.ui.symmetryAxisX ?? (state.project.canvasSize.width / 2),
              axisY: l.symmetry?.axisY ?? state.ui.symmetryAxisY ?? (state.project.canvasSize.height / 2),
              radialCount: l.symmetry?.radialCount ?? state.ui.symmetryRadialCount ?? 4
            }
          };
        }
        return l;
      });
    }
    return {
      ui: { ...state.ui, symmetryEnabled: nextEnabled },
      project: { ...state.project, layers: updatedLayers }
    };
  }),

  setSymmetryType: (type) => set((state) => {
    const selectedLayerId = state.ui.selectedLayerId;
    let updatedLayers = state.project.layers;
    if (selectedLayerId) {
      updatedLayers = updatedLayers.map(l => {
        if (l.id === selectedLayerId) {
          return {
            ...l,
            symmetry: {
              ...(l.symmetry || { enabled: state.ui.symmetryEnabled }),
              type,
              axisX: l.symmetry?.axisX ?? state.ui.symmetryAxisX ?? (state.project.canvasSize.width / 2),
              axisY: l.symmetry?.axisY ?? state.ui.symmetryAxisY ?? (state.project.canvasSize.height / 2),
              radialCount: l.symmetry?.radialCount ?? state.ui.symmetryRadialCount ?? 4
            }
          };
        }
        return l;
      });
    }
    return {
      ui: { ...state.ui, symmetryType: type },
      project: { ...state.project, layers: updatedLayers }
    };
  }),

  setSymmetryAxisX: (x) => set((state) => {
    const selectedLayerId = state.ui.selectedLayerId;
    let updatedLayers = state.project.layers;
    if (selectedLayerId) {
      updatedLayers = updatedLayers.map(l => {
        if (l.id === selectedLayerId) {
          return {
            ...l,
            symmetry: {
              ...(l.symmetry || { enabled: state.ui.symmetryEnabled, type: state.ui.symmetryType }),
              axisX: x
            }
          };
        }
        return l;
      });
    }
    return {
      ui: { ...state.ui, symmetryAxisX: x },
      project: { ...state.project, layers: updatedLayers }
    };
  }),

  setSymmetryAxisY: (y) => set((state) => {
    const selectedLayerId = state.ui.selectedLayerId;
    let updatedLayers = state.project.layers;
    if (selectedLayerId) {
      updatedLayers = updatedLayers.map(l => {
        if (l.id === selectedLayerId) {
          return {
            ...l,
            symmetry: {
              ...(l.symmetry || { enabled: state.ui.symmetryEnabled, type: state.ui.symmetryType }),
              axisY: y
            }
          };
        }
        return l;
      });
    }
    return {
      ui: { ...state.ui, symmetryAxisY: y },
      project: { ...state.project, layers: updatedLayers }
    };
  }),

  setSymmetryRadialCount: (count) => set((state) => {
    const selectedLayerId = state.ui.selectedLayerId;
    let updatedLayers = state.project.layers;
    if (selectedLayerId) {
      updatedLayers = updatedLayers.map(l => {
        if (l.id === selectedLayerId) {
          return {
            ...l,
            symmetry: {
              ...(l.symmetry || { enabled: state.ui.symmetryEnabled, type: state.ui.symmetryType }),
              radialCount: count
            }
          };
        }
        return l;
      });
    }
    return {
      ui: { ...state.ui, symmetryRadialCount: count },
      project: { ...state.project, layers: updatedLayers }
    };
  }),

  setSymmetryTarget: (target) => set((state) => ({ ui: { ...state.ui, symmetryTarget: target } })),
  toggleShowSymmetryAxis: () => set((state) => ({ ui: { ...state.ui, showSymmetryAxis: !state.ui.showSymmetryAxis } })),
  resetSymmetryToCenter: () => set((state) => {
    const cx = state.project.canvasSize.width / 2;
    const cy = state.project.canvasSize.height / 2;
    const selectedLayerId = state.ui.selectedLayerId;
    let updatedLayers = state.project.layers;
    if (selectedLayerId) {
      updatedLayers = updatedLayers.map(l => {
        if (l.id === selectedLayerId && l.symmetry) {
          return {
            ...l,
            symmetry: {
              ...l.symmetry,
              axisX: cx,
              axisY: cy
            }
          };
        }
        return l;
      });
    }
    return {
      ui: {
        ...state.ui,
        symmetryAxisX: cx,
        symmetryAxisY: cy
      },
      project: { ...state.project, layers: updatedLayers }
    };
  }),

  toggleLayerSymmetry: (layerId) => set((state) => {
    let nextEnabled = false;
    const updatedLayers = state.project.layers.map(l => {
      if (l.id === layerId) {
        nextEnabled = !l.symmetry?.enabled;
        return {
          ...l,
          symmetry: {
            enabled: nextEnabled,
            type: l.symmetry?.type || state.ui.symmetryType,
            axisX: l.symmetry?.axisX ?? state.ui.symmetryAxisX ?? (state.project.canvasSize.width / 2),
            axisY: l.symmetry?.axisY ?? state.ui.symmetryAxisY ?? (state.project.canvasSize.height / 2),
            radialCount: l.symmetry?.radialCount ?? state.ui.symmetryRadialCount ?? 4
          }
        };
      }
      return l;
    });

    const isSelected = state.ui.selectedLayerId === layerId;
    return {
      project: { ...state.project, layers: updatedLayers },
      ui: isSelected ? { ...state.ui, symmetryEnabled: nextEnabled } : state.ui
    };
  }),

  setLayerSymmetryConfig: (layerId, config) => set((state) => {
    const updatedLayers = state.project.layers.map(l => {
      if (l.id === layerId) {
        return {
          ...l,
          symmetry: {
            enabled: config.enabled ?? l.symmetry?.enabled ?? true,
            type: config.type ?? l.symmetry?.type ?? state.ui.symmetryType,
            axisX: config.axisX ?? l.symmetry?.axisX ?? state.ui.symmetryAxisX ?? (state.project.canvasSize.width / 2),
            axisY: config.axisY ?? l.symmetry?.axisY ?? state.ui.symmetryAxisY ?? (state.project.canvasSize.height / 2),
            radialCount: config.radialCount ?? l.symmetry?.radialCount ?? state.ui.symmetryRadialCount ?? 4
          }
        };
      }
      return l;
    });
    return {
      project: { ...state.project, layers: updatedLayers }
    };
  }),
  
  updateAxisValue: (axisId, value) => set((state) => {
    const cleanValue = Math.max(0, Math.min(1, value));
    const newAxes = state.project.axes.map(a => 
      a.id === axisId ? { ...a, currentValue: cleanValue } : a
    );
    
    // Strict Selection Logic (keeps keyframe selected if we are close)
    // But doesn't FORCE snapping during drag (smooth experience)
    const currentAxisValues: Record<string, number> = {};
    newAxes.forEach(a => currentAxisValues[a.id] = a.currentValue);
    
    let matchingKfId = null;
    const exactMatch = state.project.keyframes.find(kf => {
      let dist = 0;
      for (const id in currentAxisValues) {
        dist += Math.abs((kf.axisValues[id] || 0) - currentAxisValues[id]);
      }
      return dist < 0.02; 
    });

    if (exactMatch) {
      matchingKfId = exactMatch.id;
    }

    // Hydrate UI if we snapped to a keyframe
    let hydratedProps = {};
    let newSelectedStrokeId = state.ui.selectedStrokeId;

    if (matchingKfId) {
        if (state.ui.selectedTool === 'select' && state.ui.selectedLayerId) {
            const kf = state.project.keyframes.find(k => k.id === matchingKfId);
            if (kf) {
                const ls = kf.layerStates.find(l => l.layerId === state.ui.selectedLayerId);
                if (ls && ls.strokes.length > 0) {
                    const sameStroke = ls.strokes.find(s => s.id === state.ui.selectedStrokeId);
                    newSelectedStrokeId = sameStroke ? sameStroke.id : ls.strokes[0].id;
                } else {
                    newSelectedStrokeId = null;
                }
            }
        }
        hydratedProps = getHydratedUIProps(state.project, state.ui.selectedLayerId, matchingKfId, newSelectedStrokeId, state.ui.selectedTimelineKeyframeId);
    } else {
        newSelectedStrokeId = null;
    }

    return { 
      project: { ...state.project, axes: newAxes },
      ui: { ...state.ui, selectedKeyframeId: matchingKfId, selectedStrokeId: newSelectedStrokeId, ...hydratedProps }
    };
  }),

  updateMultipleAxisValues: (values) => set((state) => {
    const newAxes = state.project.axes.map(a => 
       values[a.id] !== undefined ? { ...a, currentValue: Math.max(0, Math.min(1, values[a.id])) } : a
    );
    
    // Strict Selection Logic (keeps keyframe selected if we are close)
    const currentAxisValues: Record<string, number> = {};
    newAxes.forEach(a => currentAxisValues[a.id] = a.currentValue);
    
    let matchingKfId = null;
    const exactMatch = state.project.keyframes.find(kf => {
      let dist = 0;
      for (const id in currentAxisValues) {
        dist += Math.abs((kf.axisValues[id] || 0) - currentAxisValues[id]);
      }
      return dist < 0.02; 
    });

    if (exactMatch) {
      matchingKfId = exactMatch.id;
    }

    let hydratedProps = {};
    let newSelectedStrokeId = state.ui.selectedStrokeId;

    if (matchingKfId) {
        if (state.ui.selectedTool === 'select' && state.ui.selectedLayerId) {
            const kf = state.project.keyframes.find(k => k.id === matchingKfId);
            const ls = kf?.layerStates.find(s => s.layerId === state.ui.selectedLayerId);
            if (ls && ls.strokes.length > 0) {
                 const currentStrokeExists = ls.strokes.find(s => s.id === newSelectedStrokeId);
                 if (!currentStrokeExists) {
                     newSelectedStrokeId = ls.strokes[0].id;
                 }
            } else {
                 newSelectedStrokeId = null;
            }
        }
        hydratedProps = getHydratedUIProps(state.project, state.ui.selectedLayerId, matchingKfId, newSelectedStrokeId, state.ui.selectedTimelineKeyframeId);
    } else {
        newSelectedStrokeId = null;
    }

    return {
        project: { ...state.project, axes: newAxes },
        ui: { ...state.ui, selectedKeyframeId: matchingKfId, selectedStrokeId: newSelectedStrokeId, ...hydratedProps }
    };
  }),

  updateCanvasSize: (width, height) => set((state) => {
      const past = [...state.history.past, state.project].slice(-MAX_HISTORY);
      const oldWidth = state.project.canvasSize.width;
      const oldHeight = state.project.canvasSize.height;
      const dx = (width - oldWidth) / 2;
      const dy = 0; // Anchor to top-center as requested

      const newKeyframes = state.project.keyframes.map(kf => ({
          ...kf,
          layerStates: kf.layerStates.map(ls => ({
              ...ls,
              strokes: ls.strokes.map(stroke => ({
                  ...stroke,
                  points: stroke.points.map(pt => ({
                      ...pt,
                      x: pt.x + dx,
                      y: pt.y + dy
                  }))
              }))
          }))
      }));

      return {
          project: { 
              ...state.project, 
              canvasSize: { width, height },
              keyframes: newKeyframes
          },
          history: { past, future: [] }
      };
  }),

  selectLayer: (layerId) => set((state) => {
    let newSelectedStrokeId = null;
    let newTool = state.ui.selectedTool;

    if (newTool === 'select' && state.ui.selectedKeyframeId) {
        const kf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId);
        if (kf) {
            const ls = kf.layerStates.find(l => l.layerId === layerId);
            if (ls && ls.strokes.length > 0) {
                newSelectedStrokeId = ls.strokes[0].id;
            }
        }
    }

    const hydratedProps = getHydratedUIProps(state.project, layerId, state.ui.selectedKeyframeId, newSelectedStrokeId, state.ui.selectedTimelineKeyframeId);
    const targetLayer = state.project.layers.find(l => l.id === layerId);
    let symmetryProps = {};
    if (targetLayer?.symmetry) {
      symmetryProps = {
        symmetryEnabled: targetLayer.symmetry.enabled,
        symmetryType: targetLayer.symmetry.type,
        symmetryAxisX: targetLayer.symmetry.axisX ?? state.ui.symmetryAxisX,
        symmetryAxisY: targetLayer.symmetry.axisY ?? state.ui.symmetryAxisY,
        symmetryRadialCount: targetLayer.symmetry.radialCount ?? state.ui.symmetryRadialCount
      };
    }
    return { ui: { ...state.ui, selectedLayerId: layerId, selectedTool: newTool, selectedStrokeId: newSelectedStrokeId, ...hydratedProps, ...symmetryProps } };
  }),
  
  selectKeyframe: (keyframeId) => set((state) => {
    let newSelectedStrokeId = state.ui.selectedStrokeId;
    
    if (state.ui.selectedLayerId) {
        const kf = state.project.keyframes.find(k => k.id === keyframeId);
        if (kf) {
            const ls = kf.layerStates.find(l => l.layerId === state.ui.selectedLayerId);
            if (ls && ls.strokes.length > 0) {
                const sameStroke = ls.strokes.find(s => s.id === state.ui.selectedStrokeId);
                newSelectedStrokeId = sameStroke ? sameStroke.id : ls.strokes[0].id;
            } else {
                newSelectedStrokeId = null;
            }
        } else {
            newSelectedStrokeId = null;
        }
    }

    const hydratedProps = getHydratedUIProps(state.project, state.ui.selectedLayerId, keyframeId, newSelectedStrokeId, state.ui.selectedTimelineKeyframeId);
    return { ui: { ...state.ui, selectedKeyframeId: keyframeId, selectedStrokeId: newSelectedStrokeId, ...hydratedProps } };
  }),
  
  selectStroke: (strokeId) => set((state) => {
     const hydratedProps = getHydratedUIProps(state.project, state.ui.selectedLayerId, state.ui.selectedKeyframeId, strokeId, state.ui.selectedTimelineKeyframeId);
     return { ui: { ...state.ui, selectedStrokeId: strokeId, ...hydratedProps } };
  }),

  addLayer: () => set((state) => {
    const past = [...state.history.past, state.project].slice(-MAX_HISTORY);
    const newId = `layer-${Date.now()}`;
    const newLayer: Layer = {
      id: newId,
      name: `Layer ${state.project.layers.length + 1}`,
      visible: true,
      locked: false,
      blendMode: 'normal',
      opacity: 1,
      interpolationMode: 'resample'
    };
    return {
      project: { ...state.project, layers: [...state.project.layers, newLayer] },
      ui: { ...state.ui, selectedLayerId: newId, selectedTool: 'pen', selectedStrokeId: null },
      history: { past, future: [] }
    };
  }),

  reorderLayers: (fromIndex, toIndex) => set((state) => {
    if (fromIndex === toIndex) return state;
    const past = [...state.history.past, state.project].slice(-MAX_HISTORY);
    const newLayers = [...state.project.layers];
    const [moved] = newLayers.splice(fromIndex, 1);
    newLayers.splice(toIndex, 0, moved);

    return {
       project: { ...state.project, layers: newLayers },
       history: { past, future: [] }
    };
  }),

  deleteLayer: (layerId) => set((state) => {
    if (state.project.layers.length <= 1) return state; 
    const past = [...state.history.past, state.project].slice(-MAX_HISTORY);
    const newLayers = state.project.layers.filter(l => l.id !== layerId);
    
    const newKeyframes = state.project.keyframes.map(kf => ({
       ...kf,
       layerStates: kf.layerStates.filter(ls => ls.layerId !== layerId)
    }));

    return {
      project: { ...state.project, layers: newLayers, keyframes: newKeyframes },
      ui: { ...state.ui, selectedLayerId: newLayers[newLayers.length - 1].id },
      history: { past, future: [] }
    };
  }),

  renameLayer: (layerId, name) => set((state) => ({
    project: {
      ...state.project,
      layers: state.project.layers.map(l => l.id === layerId ? { ...l, name } : l)
    }
  })),

  toggleLayerVisibility: (layerId) => set((state) => ({
    project: {
      ...state.project,
      layers: state.project.layers.map(l => 
        l.id === layerId ? { ...l, visible: !l.visible } : l
      )
    }
  })),

  toggleLayerLock: (layerId) => set((state) => ({
    project: {
      ...state.project,
      layers: state.project.layers.map(l => 
        l.id === layerId ? { ...l, locked: !l.locked } : l
      )
    }
  })),

  toggleLayerGuideMode: (layerId) => set((state) => {
    const targetLayer = state.project.layers.find(l => l.id === layerId);
    if (!targetLayer) return state;

    const newIsGuide = !targetLayer.isGuide;
    const past = [...state.history.past, state.project].slice(-MAX_HISTORY);

    // If enabling guide mode, collect existing strokes from current keyframe / all keyframes into guideStrokes
    let existingStrokes: Stroke[] = [];
    if (newIsGuide) {
      const kf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
      const ls = kf?.layerStates.find(s => s.layerId === layerId);
      if (ls && ls.strokes.length > 0) {
        existingStrokes = [...ls.strokes];
      }
    }

    const updatedLayers = state.project.layers.map(l => {
      if (l.id === layerId) {
        return {
          ...l,
          isGuide: newIsGuide,
          guideStrokes: newIsGuide ? (l.guideStrokes && l.guideStrokes.length > 0 ? l.guideStrokes : existingStrokes) : undefined
        };
      }
      return l;
    });

    return {
      project: { ...state.project, layers: updatedLayers },
      history: { past, future: [] }
    };
  }),

  setLayerBlendMode: (layerId, mode) => set((state) => {
    return {
      project: {
        ...state.project,
        layers: state.project.layers.map(l => 
          l.id === layerId ? { ...l, blendMode: mode } : l
        )
      }
    };
  }),

  setLayerInterpolationMode: (layerId, mode) => set((state) => {
    return {
      project: {
        ...state.project,
        layers: state.project.layers.map(l => 
          l.id === layerId ? { ...l, interpolationMode: mode } : l
        )
      }
    };
  }),

  setLayerCornerRoundness: (layerId, roundness, applyToAllStates = false) => set((state) => {
    const currentKeyframeId = state.ui.selectedKeyframeId;
    let newKeyframes = state.project.keyframes.map(kf => {
      if (applyToAllStates) {
        return {
          ...kf,
          layerStates: kf.layerStates.map(ls => 
            ls.layerId === layerId ? {
              ...ls,
              strokes: ls.strokes.map(s => ({
                ...s,
                style: { ...s.style, cornerRoundness: undefined }
              }))
            } : ls
          )
        };
      } else if (kf.id === currentKeyframeId) {
        return {
          ...kf,
          layerStates: kf.layerStates.map(ls => 
            ls.layerId === layerId ? {
              ...ls,
              strokes: ls.strokes.map(s => ({
                ...s,
                style: { ...s.style, cornerRoundness: roundness }
              }))
            } : ls
          )
        };
      }
      return kf;
    });

    let newAnimations = state.project.animations;
    let newTimelineKfId = state.ui.selectedTimelineKeyframeId;
    const isTimelineMode = state.ui.isTimelineOpen || (layerId && state.project.layers.find(l => l.id === layerId)?.driverMode === 'timeline');

    if (isTimelineMode && layerId && newAnimations && newAnimations.length > 0) {
      const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || newAnimations[0].id;
      const targetTime = Math.round((state.ui.timelineCurrentTime ?? 0) * 100) / 100;

      newAnimations = newAnimations.map(anim => {
        if (anim.id !== activeAnimId) return anim;
        const tracks = anim.tracks || [];
        let trackIndex = tracks.findIndex(t => t.layerId === layerId);
        if (trackIndex < 0) {
          if (!state.ui.autoKeyframeEnabled) return anim;
          newTimelineKfId = `kf-tl-${Date.now()}`;
          const targetLayer = state.project.layers.find(l => l.id === layerId);
          const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
          const layerStrokes = getTimelineStrokesForTime(undefined, targetTime, targetLayer, anim, matrixKf?.layerStates.find(ls => ls.layerId === layerId)?.strokes || []);
          const clonedStrokes = layerStrokes.map(s => ({
            ...s,
            id: s.id,
            style: { ...s.style, cornerRoundness: roundness }
          }));
          const newTlKf: LayerTimelineKeyframe = { id: newTimelineKfId, time: targetTime, strokes: clonedStrokes, easing: "easeInOut", name: `Pose ${targetTime.toFixed(2)}s` };
          return { ...anim, tracks: [...tracks, { layerId, keyframes: [newTlKf] }] };
        }
        const track = tracks[trackIndex];
        const existingKfIndex = track.keyframes.findIndex(k => Math.abs(k.time - targetTime) <= 0.03);

        if (existingKfIndex >= 0) {
          const updatedKf = track.keyframes.map((k, idx) => {
            if (idx !== existingKfIndex) return k;
            return {
              ...k,
              strokes: (k.strokes || []).map(s => ({
                ...s,
                style: { ...s.style, cornerRoundness: roundness }
              }))
            };
          });
          return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKf } : t) };
        } else if (state.ui.autoKeyframeEnabled) {
          newTimelineKfId = `kf-tl-${Date.now()}`;
          const targetLayer = state.project.layers.find(l => l.id === layerId);
          const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
          const layerStrokes = getTimelineStrokesForTime(track, targetTime, targetLayer, anim, matrixKf?.layerStates.find(ls => ls.layerId === layerId)?.strokes || []);
          const clonedStrokes = layerStrokes.map(s => ({
            ...s,
            id: s.id,
            style: { ...s.style, cornerRoundness: roundness }
          }));

          const newKf: LayerTimelineKeyframe = {
            id: newTimelineKfId,
            time: targetTime,
            strokes: clonedStrokes,
            easing: 'easeInOut',
            name: `Pose ${targetTime.toFixed(2)}s`
          };
          const updatedKeyframes = [...track.keyframes, newKf].sort((a, b) => a.time - b.time);
          return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKeyframes } : t) };
        }
        return anim;
      });
    }

    return {
      ui: state.ui.selectedLayerId === layerId ? { ...state.ui, cornerRoundness: roundness, ...(newTimelineKfId ? { selectedTimelineKeyframeId: newTimelineKfId } : {}) } : state.ui,
      project: {
        ...state.project,
        layers: applyToAllStates ? state.project.layers.map(l => 
          l.id === layerId ? { ...l, baseStyle: { ...l.baseStyle, cornerRoundness: roundness } as StyleProps } : l
        ) : state.project.layers,
        keyframes: newKeyframes,
        animations: newAnimations
      }
    };
  }),

  setStrokeCornerRoundness: (strokeId, roundness) => set((state) => {
    const currentKeyframeId = state.ui.selectedKeyframeId;
    const targetLayerId = state.ui.selectedLayerId;

    let newKeyframes = state.project.keyframes.map(kf => 
      kf.id === currentKeyframeId ? {
        ...kf,
        layerStates: kf.layerStates.map(ls => ({
          ...ls,
          strokes: ls.strokes.map(s => 
            s.id === strokeId ? { ...s, style: { ...s.style, cornerRoundness: roundness } } : s
          )
        }))
      } : kf
    );

    let newAnimations = state.project.animations;
    let newTimelineKfId = state.ui.selectedTimelineKeyframeId;
    const isTimelineMode = state.ui.isTimelineOpen || (targetLayerId && state.project.layers.find(l => l.id === targetLayerId)?.driverMode === 'timeline');

    if (isTimelineMode && targetLayerId && newAnimations && newAnimations.length > 0) {
      const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || newAnimations[0].id;
      const targetTime = Math.round((state.ui.timelineCurrentTime ?? 0) * 100) / 100;

      newAnimations = newAnimations.map(anim => {
        if (anim.id !== activeAnimId) return anim;
        const tracks = anim.tracks || [];
        const trackIndex = tracks.findIndex(t => t.layerId === targetLayerId);
        if (trackIndex < 0) {
          if (!state.ui.autoKeyframeEnabled) return anim;
          newTimelineKfId = `kf-tl-${Date.now()}`;
          const targetLayer = state.project.layers.find(l => l.id === targetLayerId);
          const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
          const layerStrokes = getTimelineStrokesForTime(undefined, targetTime, targetLayer, anim, matrixKf?.layerStates.find(ls => ls.layerId === targetLayerId)?.strokes || []);
          const clonedStrokes = layerStrokes.map(s => ({
            ...s,
            id: s.id,
            style: s.id === strokeId ? { ...s.style, cornerRoundness: roundness } : s.style
          }));
          const newTlKf: LayerTimelineKeyframe = { id: newTimelineKfId, time: targetTime, strokes: clonedStrokes, easing: "easeInOut", name: `Pose ${targetTime.toFixed(2)}s` };
          return { ...anim, tracks: [...tracks, { layerId: targetLayerId, keyframes: [newTlKf] }] };
        }
        const track = tracks[trackIndex];
        const existingKfIndex = track.keyframes.findIndex(k => Math.abs(k.time - targetTime) <= 0.03);

        if (existingKfIndex >= 0) {
          const updatedKf = track.keyframes.map((k, idx) => {
            if (idx !== existingKfIndex) return k;
            return {
              ...k,
              strokes: (k.strokes || []).map(s => {
                if (s.id !== strokeId) return s;
                return { ...s, style: { ...s.style, cornerRoundness: roundness } };
              })
            };
          });
          return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKf } : t) };
        } else if (state.ui.autoKeyframeEnabled) {
          newTimelineKfId = `kf-tl-${Date.now()}`;
          const targetLayer = state.project.layers.find(l => l.id === targetLayerId);
          const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
          const layerStrokes = getTimelineStrokesForTime(track, targetTime, targetLayer, anim, matrixKf?.layerStates.find(ls => ls.layerId === targetLayerId)?.strokes || []);
          const clonedStrokes = layerStrokes.map(s => ({
            ...s,
            id: s.id,
            style: s.id === strokeId ? { ...s.style, cornerRoundness: roundness } : s.style
          }));

          const newKf: LayerTimelineKeyframe = {
            id: newTimelineKfId,
            time: targetTime,
            strokes: clonedStrokes,
            easing: 'easeInOut',
            name: `Pose ${targetTime.toFixed(2)}s`
          };
          const updatedKeyframes = [...track.keyframes, newKf].sort((a, b) => a.time - b.time);
          return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKeyframes } : t) };
        }
        return anim;
      });
    }

    return {
      ui: { ...state.ui, cornerRoundness: roundness, ...(newTimelineKfId ? { selectedTimelineKeyframeId: newTimelineKfId } : {}) },
      project: {
        ...state.project,
        keyframes: newKeyframes,
        animations: newAnimations
      }
    };
  }),

  setStrokeResolution: (resolution) => set((state) => {
    const newUI = { ...state.ui, strokeResolution: resolution };
    
    if (state.ui.selectedKeyframeId && state.ui.selectedLayerId) {
        const targetStrokeId = state.ui.selectedStrokeId;
        const targetLayerId = state.ui.selectedLayerId;
        
        const shouldUpdateStrokes = true;

        if (shouldUpdateStrokes) {
            const past = [...state.history.past, state.project].slice(-MAX_HISTORY);

            const newKeyframes = state.project.keyframes.map(kf => {
                if (kf.id !== state.ui.selectedKeyframeId) return kf;
                return {
                    ...kf,
                    layerStates: kf.layerStates.map(ls => {
                        if (ls.layerId !== targetLayerId) return ls;
                        return {
                            ...ls,
                            strokes: ls.strokes.map(s => {
                                if (targetStrokeId && s.id !== targetStrokeId) return s;
                                return { ...s, style: { ...s.style, strokeResolution: resolution } };
                            })
                        };
                    })
                };
            });

            return { 
               ui: newUI, 
               project: { ...state.project, keyframes: newKeyframes },
               history: { past, future: [] }
            };
        }
    }

    return { ui: newUI };
  }),

  addStrokeToCurrentKeyframe: (rawPoints, closed = false, skipSimplify = false) => set((state) => {
    const { selectedLayerId, brushColor, fillColor, brushSize, smoothingEnabled, snapToGrid } = state.ui;
    if (!selectedLayerId) return state;

    const layer = state.project.layers.find(l => l.id === selectedLayerId);
    if (layer?.locked || !layer?.visible) return state;

    const baseStyle = layer.baseStyle || { strokeColor: '#000000', strokeWidth: 4, fillColor: 'none', lineStyle: 'solid', cornerRoundness: 0, strokeResolution: 200 };
    const styleOverride: Partial<StyleProps> = {};
    if (brushColor !== baseStyle.strokeColor) styleOverride.strokeColor = brushColor as string;
    if (fillColor !== baseStyle.fillColor) styleOverride.fillColor = fillColor;
    if (brushSize !== baseStyle.strokeWidth) styleOverride.strokeWidth = brushSize;
    if (state.ui.cornerRoundness !== (baseStyle.cornerRoundness || 0)) styleOverride.cornerRoundness = state.ui.cornerRoundness;
    if (state.ui.strokeResolution !== (baseStyle.strokeResolution || 200)) styleOverride.strokeResolution = state.ui.strokeResolution;

    let points = rawPoints;
    let shouldUpdateLayerMode = false;

    // --- GRID OPTIMIZATION ---
    if (snapToGrid) {
        points = simplifyCollinearPoints(rawPoints, 0.1);
        if (layer.interpolationMode === 'resample') {
            shouldUpdateLayerMode = true;
        }
    } 
    // --- AUTOMATIC POLYLINE SWITCH ---
    else if (state.ui.selectedTool === 'polyline') {
         // Polyline is geometric, defaulting to 'Points' mode is much safer for topology
         if (layer.interpolationMode === 'resample') {
             shouldUpdateLayerMode = true;
         }
    }
    // --- SPLINE OPTIMIZATION ---
    // If we are in Spline mode, we want Anchors, not 1000 mouse points.
    else if (layer.interpolationMode === 'spline' && !skipSimplify) {
        // Aggressive simplification to create structural anchors
        points = simplifyPoints(rawPoints, 2.5);
    }
    // --- STANDARD OPTIMIZATION ---
    else if (!skipSimplify && smoothingEnabled) { 
       const factor = state.ui.strokeSmoothingFactor ?? 0.2;
       if (factor <= 0.05) {
           // Ultra-detailed / Raw: preserve virtually all sampled points
           points = simplifyPoints(rawPoints, 0.25);
       } else if (factor < 0.35) {
           // Crisp / High detail: minimal simplification + 1 subtle Chaikin pass
           const preSimplified = simplifyPoints(rawPoints, 0.6);
           points = chaikinSmooth(preSimplified, 1);
       } else if (factor < 0.7) {
           // Balanced smoothing: standard curve rounding
           const preSimplified = simplifyPoints(rawPoints, 1.2);
           points = chaikinSmooth(preSimplified, 2);
       } else {
           // Strong smoothing: high curve rounding
           const preSimplified = simplifyPoints(rawPoints, 2.0);
           points = chaikinSmooth(preSimplified, 3);
       }
    } else if (!skipSimplify && !smoothingEnabled) {
       // Smoothing disabled: Raw points with minimal noise filter
       points = simplifyPoints(rawPoints, 0.25);
    }

    // --- CLEANUP DUPLICATES ---
    // Often double-clicking creates P[n] === P[n-1]. We sanitize this to prevent "fake closure".
    if (points.length > 1) {
        // If last point is same as previous, remove it
        const last = points[points.length - 1];
        const prev = points[points.length - 2];
        if (distance(last, prev) < 0.1) {
            points = points.slice(0, -1);
        }
    }

    const { symmetryEnabled, symmetryType, symmetryAxisX, symmetryAxisY, symmetryRadialCount, symmetryTarget } = state.ui;

    if (symmetryEnabled && symmetryTarget === 'merge' && (symmetryType === 'vertical' || symmetryType === 'horizontal')) {
      points = getUnifiedSymmetricContour(points, symmetryType, symmetryAxisX, symmetryAxisY);
    }

    const past = [...state.history.past, state.project].slice(-MAX_HISTORY);
    
    let updatedLayers = [...state.project.layers].filter(l => !l.id.includes('-sym-'));
    if (shouldUpdateLayerMode) {
        updatedLayers = updatedLayers.map(l => 
            l.id === selectedLayerId ? { ...l, interpolationMode: 'points' } : l
        );
    }

    if (symmetryEnabled && symmetryTarget !== 'merge') {
      updatedLayers = updatedLayers.map(l => 
        l.id === selectedLayerId ? {
          ...l,
          symmetry: {
            enabled: true,
            type: symmetryType,
            axisX: symmetryAxisX ?? (state.project.canvasSize.width / 2),
            axisY: symmetryAxisY ?? (state.project.canvasSize.height / 2),
            radialCount: symmetryRadialCount ?? 4
          }
        } : l
      );
    }

    const currentAxisValues: Record<string, number> = {};
    state.project.axes.forEach(a => currentAxisValues[a.id] = a.currentValue);

    let targetKeyframeId = state.ui.selectedKeyframeId;
    let keyframes = [...state.project.keyframes];
    
    if (targetKeyframeId === null) {
      const newKfId = `kf-${Date.now()}`;
      const newKeyframe: Keyframe = {
        id: newKfId,
        name: `Keyframe ${keyframes.length}`,
        axisValues: currentAxisValues,
        layerStates: [] 
      };
      keyframes.push(newKeyframe);
      targetKeyframeId = newKfId;
    }

    const isGuideLayer = layer?.isGuide === true;
    const strokeId = isGuideLayer 
      ? `guide-stroke-${selectedLayerId}-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
      : `stroke-${selectedLayerId}-unique`;

    const newStroke: Stroke = {
      id: strokeId,
      points,
      closed: closed ?? false,
      style: Object.keys(styleOverride).length > 0 ? styleOverride : undefined
    };

    let finalLayers = updatedLayers;
    if (state.ui.isTimelineOpen && layer?.driverMode !== 'timeline') {
      finalLayers = finalLayers.map(l => l.id === selectedLayerId ? { ...l, driverMode: 'timeline' as LayerDriverMode } : l);
    }
    let newKeyframes: Keyframe[];

    if (isGuideLayer) {
      finalLayers = updatedLayers.map(l => {
        if (l.id === selectedLayerId) {
          return {
            ...l,
            guideStrokes: [...(l.guideStrokes || []), newStroke]
          };
        }
        return l;
      });

      newKeyframes = keyframes.map(kf => {
        if (kf.id === targetKeyframeId) {
          let newLayerStates = [...kf.layerStates];
          const existingLayerStateIndex = newLayerStates.findIndex(ls => ls.layerId === selectedLayerId);
          if (existingLayerStateIndex >= 0) {
            newLayerStates[existingLayerStateIndex] = {
              ...newLayerStates[existingLayerStateIndex],
              strokes: [...newLayerStates[existingLayerStateIndex].strokes, newStroke]
            };
          } else {
            newLayerStates.push({
              layerId: selectedLayerId,
              strokes: [newStroke]
            });
          }
          return { ...kf, layerStates: newLayerStates };
        }
        return kf;
      });
    } else {
      newKeyframes = keyframes.map(kf => {
        if (kf.id === targetKeyframeId) {
          let newLayerStates = [...kf.layerStates].filter(ls => !ls.layerId.includes('-sym-'));

          const existingLayerStateIndex = newLayerStates.findIndex(ls => ls.layerId === selectedLayerId);
          if (existingLayerStateIndex >= 0) {
            newLayerStates[existingLayerStateIndex] = {
              ...newLayerStates[existingLayerStateIndex],
              strokes: [newStroke]
            };
          } else {
            newLayerStates.push({
              layerId: selectedLayerId,
              strokes: [newStroke]
            });
          }

          return { ...kf, layerStates: newLayerStates };
        }
        return kf;
      });
    }

    // Automatically sync into Timeline track if Timeline is open or layer is timeline-driven
    let updatedAnimations = state.project.animations && state.project.animations.length > 0
      ? state.project.animations
      : [DEFAULT_ANIMATION];
    let createdTlKeyframeId: string | null = state.ui.selectedTimelineKeyframeId;

    if (state.ui.isTimelineOpen || layer?.driverMode === 'timeline') {
      const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || updatedAnimations[0].id;
      const targetTime = Math.round((state.ui.timelineCurrentTime ?? 0) * 100) / 100;

      updatedAnimations = updatedAnimations.map(anim => {
        if (anim.id === activeAnimId) {
          const tracks = anim.tracks || [];
          const trackIndex = tracks.findIndex(t => t.layerId === selectedLayerId);
          let updatedTracks: LayerTimelineTrack[];

          if (trackIndex >= 0) {
            const track = tracks[trackIndex];
            const existingKfIndex = track.keyframes.findIndex(k => Math.abs(k.time - targetTime) <= 0.03);
            let updatedKf: LayerTimelineKeyframe[];

            if (existingKfIndex >= 0) {
              const existing = track.keyframes[existingKfIndex];
              createdTlKeyframeId = existing.id;
              const newStrokes = isGuideLayer ? [...(existing.strokes || []), newStroke] : [newStroke];
              updatedKf = track.keyframes.map((k, idx) => idx === existingKfIndex ? { ...k, strokes: newStrokes } : k);
            } else {
              createdTlKeyframeId = `kf-tl-${Date.now()}`;
              const targetLayer = state.project.layers.find(l => l.id === selectedLayerId);
              const baseStrokes = getTimelineStrokesForTime(track, targetTime, targetLayer, anim, []);
              const newStrokes = isGuideLayer
                ? [...baseStrokes, newStroke]
                : (baseStrokes.some(s => s.id === strokeId)
                    ? baseStrokes.map(s => s.id === strokeId ? newStroke : s)
                    : [newStroke]);
              const newTlKf: LayerTimelineKeyframe = {
                id: createdTlKeyframeId,
                time: targetTime,
                strokes: newStrokes,
                easing: 'easeInOut',
                name: `Pose ${targetTime.toFixed(2)}s`
              };
              updatedKf = [...track.keyframes, newTlKf].sort((a, b) => a.time - b.time);
            }

            updatedTracks = tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKf } : t);
          } else {
            createdTlKeyframeId = `kf-tl-${Date.now()}`;
            const targetLayer = state.project.layers.find(l => l.id === selectedLayerId);
            const baseStrokes = getTimelineStrokesForTime(undefined, targetTime, targetLayer, anim, []);
            const newStrokes = isGuideLayer ? [...baseStrokes, newStroke] : [newStroke];
            const newTlKf: LayerTimelineKeyframe = {
              id: createdTlKeyframeId,
              time: targetTime,
              strokes: newStrokes,
              easing: 'easeInOut',
              name: `Pose ${targetTime.toFixed(2)}s`
            };
            updatedTracks = [
              ...tracks,
              {
                layerId: selectedLayerId,
                keyframes: [newTlKf]
              }
            ];
          }

          return { ...anim, tracks: updatedTracks };
        }
        return anim;
      });
    }

    return { 
      project: { ...state.project, keyframes: newKeyframes, layers: finalLayers, animations: updatedAnimations },
      // AUTO-SELECT THE NEWLY CREATED STROKE to enable "Direct Select" workflow
      ui: { 
        ...state.ui, 
        selectedKeyframeId: targetKeyframeId, 
        selectedStrokeId: newStroke.id,
        ...(createdTlKeyframeId ? { selectedTimelineKeyframeId: createdTlKeyframeId, selectedLayerTrackId: selectedLayerId } : {})
      },
      history: { past, future: [] }
    };
  }),

  updateStrokeInCurrentKeyframe: (strokeId, newPoints, shapeConfig) => set((state) => {
    const kfId = state.ui.selectedKeyframeId;
    const layerId = state.ui.selectedLayerId;
    if (!kfId || !layerId) return state;

    // Find base stroke properties from ANY keyframe if not yet in this keyframe
    let baseStroke: Stroke | undefined;
    for (const k of state.project.keyframes) {
      const ls = k.layerStates.find(l => l.layerId === layerId);
      const s = ls?.strokes.find(st => st.id === strokeId);
      if (s) {
        baseStroke = s;
        break;
      }
    }

    const keyframes = state.project.keyframes.map(kf => {
      if (kf.id === kfId) {
        let foundLayer = false;
        const newLayerStates = kf.layerStates.map(ls => {
          if (ls.layerId === layerId) {
            foundLayer = true;
            let foundStroke = false;
            const strokes = ls.strokes.map(s => {
              if (s.id === strokeId) {
                foundStroke = true;
                return {
                  ...s,
                  points: newPoints,
                  shapeConfig: shapeConfig !== undefined ? shapeConfig : s.shapeConfig
                };
              }
              return s;
            });

            if (!foundStroke) {
              // Auto-Keyframe: create stroke inside this layerState
              strokes.push({
                id: strokeId,
                points: newPoints,
                closed: baseStroke?.closed ?? false,
                style: baseStroke?.style,
                shapeConfig: shapeConfig !== undefined ? shapeConfig : baseStroke?.shapeConfig
              });
            }

            return { ...ls, strokes };
          }
          return ls;
        });

        if (!foundLayer) {
          // Auto-Keyframe: create layerState with this stroke
          newLayerStates.push({
            layerId,
            strokes: [{
              id: strokeId,
              points: newPoints,
              closed: baseStroke?.closed ?? false,
              style: baseStroke?.style,
              shapeConfig: shapeConfig !== undefined ? shapeConfig : baseStroke?.shapeConfig
            }]
          });
        }

        return { ...kf, layerStates: newLayerStates };
      }
      return kf;
    });

    // Check if we are currently editing a Pose node in the State Machine:
    const currentSM = state.project.stateMachines?.find(s => s.id === state.project.activeStateMachineId) || state.project.stateMachines?.[0];
    const activePoseNodeId = state.ui.activeStateNodeId || state.ui.selectedGraphNodeId;
    const activePoseNode = currentSM?.nodes.find(n => n.id === activePoseNodeId && n.type === 'pose');
    const isPoseEditing = !!activePoseNode || (layerId && state.project.layers.find(l => l.id === layerId)?.driverMode === 'pose');

    // Also update in Timeline track if timeline is open or layer is timeline driven (and not in pose mode)
    let updatedLayers = state.project.layers;
    let updatedAnimations = state.project.animations;
    const isTimelineMode = !isPoseEditing && (state.ui.isTimelineOpen || (layerId && state.project.layers.find(l => l.id === layerId)?.driverMode === 'timeline'));
    let newTimelineKfId = state.ui.selectedTimelineKeyframeId;

    if (isTimelineMode && updatedAnimations && updatedAnimations.length > 0) {
      if (layerId) {
        updatedLayers = updatedLayers.map(l => l.id === layerId && l.driverMode !== 'timeline' ? { ...l, driverMode: 'timeline' as LayerDriverMode } : l);
      }
      const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || updatedAnimations[0].id;
      const targetTime = Math.round((state.ui.timelineCurrentTime ?? 0) * 100) / 100;

      updatedAnimations = updatedAnimations.map(anim => {
        if (anim.id !== activeAnimId) return anim;
        const tracks = anim.tracks || [];
        let trackIndex = tracks.findIndex(t => t.layerId === layerId);
        if (trackIndex < 0) {
          if (!state.ui.autoKeyframeEnabled) return anim;
          newTimelineKfId = `kf-tl-${Date.now()}`;
          const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
          const layerStrokes = matrixKf?.layerStates.find(ls => ls.layerId === layerId)?.strokes || [];
          const clonedStrokes = layerStrokes.some(s => s.id === strokeId)
            ? layerStrokes.map(s => s.id === strokeId ? { ...s, points: newPoints, shapeConfig: shapeConfig !== undefined ? shapeConfig : s.shapeConfig } : s)
            : [...layerStrokes, {
                id: strokeId,
                points: newPoints,
                closed: baseStroke?.closed ?? false,
                style: baseStroke?.style,
                shapeConfig: shapeConfig !== undefined ? shapeConfig : baseStroke?.shapeConfig
              }];
          const newTlKf: LayerTimelineKeyframe = { id: newTimelineKfId, time: targetTime, strokes: clonedStrokes, easing: 'easeInOut', name: `Pose ${targetTime.toFixed(2)}s` };
          return { ...anim, tracks: [...tracks, { layerId, keyframes: [newTlKf] }] };
        }

        const track = tracks[trackIndex];
        const existingKfIndex = track.keyframes.findIndex(k => Math.abs(k.time - targetTime) <= 0.03);

        if (existingKfIndex >= 0) {
          const updatedKf = track.keyframes.map((k, idx) => {
            if (idx !== existingKfIndex) return k;
            return {
              ...k,
              strokes: (k.strokes || []).map(s => {
                if (s.id !== strokeId) return s;
                return {
                  ...s,
                  points: newPoints,
                  shapeConfig: shapeConfig !== undefined ? shapeConfig : s.shapeConfig
                };
              })
            };
          });
          return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKf } : t) };
        } else if (state.ui.autoKeyframeEnabled) {
          newTimelineKfId = `kf-tl-${Date.now()}`;
          const refKf = track.keyframes.find(k => k.id === state.ui.selectedTimelineKeyframeId) || track.keyframes[0];
          const matrixKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
          const layerStrokes = refKf?.strokes || matrixKf?.layerStates.find(ls => ls.layerId === layerId)?.strokes || [];
          const clonedStrokes = layerStrokes.some(s => s.id === strokeId)
            ? layerStrokes.map(s => s.id === strokeId ? { ...s, points: newPoints, shapeConfig: shapeConfig !== undefined ? shapeConfig : s.shapeConfig } : s)
            : [...layerStrokes, {
                id: strokeId,
                points: newPoints,
                closed: baseStroke?.closed ?? false,
                style: baseStroke?.style,
                shapeConfig: shapeConfig !== undefined ? shapeConfig : baseStroke?.shapeConfig
              }];

          const newTlKf: LayerTimelineKeyframe = {
            id: newTimelineKfId,
            time: targetTime,
            strokes: clonedStrokes,
            easing: 'easeInOut',
            name: `Pose ${targetTime.toFixed(2)}s`
          };
          const updatedKeyframes = [...track.keyframes, newTlKf].sort((a, b) => a.time - b.time);
          return { ...anim, tracks: tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKeyframes } : t) };
        }
        return anim;
      });
    }

    // Auto-sync into active Pose Node!
    let updatedStateMachines = state.project.stateMachines;
    if (activePoseNode && updatedStateMachines) {
      updatedStateMachines = updatedStateMachines.map(sm => {
        if (sm.id !== currentSM?.id) return sm;
        const updatedNodes = sm.nodes.map(n => {
          if (n.id !== activePoseNode.id) return n;
          const currentLs = n.poseData?.layerStates || [];
          const existingLsIdx = currentLs.findIndex(ls => ls.layerId === layerId);
          let newLs: LayerState[];
          if (existingLsIdx >= 0) {
            newLs = currentLs.map((ls, idx) => {
              if (idx !== existingLsIdx) return ls;
              const strokes = ls.strokes.map(s => s.id === strokeId ? {
                ...s,
                points: newPoints,
                shapeConfig: shapeConfig !== undefined ? shapeConfig : s.shapeConfig
              } : s);
              return { ...ls, strokes };
            });
          } else {
            newLs = [...currentLs, {
              layerId,
              strokes: [{
                id: strokeId,
                points: newPoints,
                closed: baseStroke?.closed ?? false,
                style: baseStroke?.style,
                shapeConfig: shapeConfig !== undefined ? shapeConfig : baseStroke?.shapeConfig
              }]
            }];
          }
          return {
            ...n,
            poseData: {
              ...(n.poseData || {}),
              layerStates: newLs
            }
          };
        });
        return { ...sm, nodes: updatedNodes };
      });
    }

    const targetLayer = state.project.layers.find(l => l.id === layerId);
    if (targetLayer?.isGuide) {
      updatedLayers = state.project.layers.map(l => {
        if (l.id === layerId && l.guideStrokes) {
          return {
            ...l,
            guideStrokes: l.guideStrokes.map(s => s.id === strokeId ? { ...s, points: newPoints, shapeConfig: shapeConfig !== undefined ? shapeConfig : s.shapeConfig } : s)
          };
        }
        return l;
      });
    }

    return { 
      project: {
        ...state.project,
        layers: updatedLayers,
        keyframes,
        animations: updatedAnimations,
        stateMachines: updatedStateMachines
      },
      ui: { ...state.ui, ...(newTimelineKfId ? { selectedTimelineKeyframeId: newTimelineKfId } : {}) }
    };
  }),
  
  deleteStroke: (strokeId) => set((state) => {
     const kfId = state.ui.selectedKeyframeId;
     const layerId = state.ui.selectedLayerId;
     if (!kfId || !layerId) return state;

     const past = [...state.history.past, state.project].slice(-MAX_HISTORY);

     const targetLayer = state.project.layers.find(l => l.id === layerId);
     let updatedLayers = state.project.layers;
     if (targetLayer?.isGuide) {
       updatedLayers = state.project.layers.map(l => {
         if (l.id === layerId) {
           return {
             ...l,
             guideStrokes: (l.guideStrokes || []).filter(s => s.id !== strokeId)
           };
         }
         return l;
       });
     }

     // 1. Remove the stroke from the keyframe's layerState
     let newKeyframes = state.project.keyframes.map(kf => {
         if (kf.id === kfId) {
             const newLayerStates = kf.layerStates.map(ls => {
                 if (ls.layerId === layerId) {
                     return {
                         ...ls,
                         strokes: ls.strokes.filter(s => s.id !== strokeId)
                     };
                 }
                 return ls;
             }).filter(ls => ls.strokes.length > 0);
             return { ...kf, layerStates: newLayerStates };
         }
         return kf;
     });

     // 1.b Also remove stroke from timeline tracks for the active keyframe only
     let updatedAnimations = state.project.animations;
     if (updatedAnimations && updatedAnimations.length > 0 && (state.ui.isTimelineOpen || targetLayer?.driverMode === 'timeline')) {
       const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || updatedAnimations[0].id;
       const targetTime = state.ui.timelineCurrentTime ?? 0;
       const targetTlKfId = state.ui.selectedTimelineKeyframeId;

       updatedAnimations = updatedAnimations.map(anim => {
         if (anim.id !== activeAnimId) return anim;
         return {
           ...anim,
           tracks: (anim.tracks || []).map(track => {
             if (track.layerId !== layerId) return track;
             return {
               ...track,
               keyframes: track.keyframes.map(k => {
                 const isTarget = targetTlKfId ? k.id === targetTlKfId : Math.abs(k.time - targetTime) <= 0.03;
                 if (!isTarget) return k;
                 return {
                   ...k,
                   strokes: (k.strokes || []).filter(s => s.id !== strokeId)
                 };
               })
             };
           })
         };
       });
     }

     // 2. Check if the target keyframe now has 0 strokes across ALL layers
     const targetKf = newKeyframes.find(k => k.id === kfId);
     const hasAnyStrokesLeft = targetKf?.layerStates.some(ls => ls.strokes.length > 0);

     let newSelectedId = state.ui.selectedKeyframeId;
     let newAxes = state.project.axes;

     if (!hasAnyStrokesLeft && newKeyframes.length > 1) {
         // Prune the now-empty keyframe so it doesn't leave ghost dots on the Matrix
         newKeyframes = newKeyframes.filter(k => k.id !== kfId);
         
         const kfWithData = newKeyframes.find(k => 
             k.layerStates.some(ls => ls.layerId === layerId && ls.strokes.length > 0)
         ) || newKeyframes[0];
         
         newSelectedId = kfWithData?.id || null;

         if (newSelectedId && kfWithData) {
             newAxes = state.project.axes.map(a => {
                 if (kfWithData.axisValues[a.id] !== undefined) {
                     return { ...a, currentValue: kfWithData.axisValues[a.id] };
                 }
                 return a;
             });
         }
     }

     return {
         project: { ...state.project, layers: updatedLayers, keyframes: newKeyframes, axes: newAxes, animations: updatedAnimations },
         ui: { ...state.ui, selectedKeyframeId: newSelectedId, selectedStrokeId: null },
         history: { past, future: [] }
     };
  }),

  createKeyframeAtCurrentAxes: () => set((state) => {
     const currentAxisValues: Record<string, number> = {};
     state.project.axes.forEach(a => currentAxisValues[a.id] = a.currentValue);

     const newKeyframe: Keyframe = {
        id: `kf-${Date.now()}`,
        name: `Keyframe ${state.project.keyframes.length}`,
        axisValues: currentAxisValues,
        layerStates: []
      };

      return {
        project: { ...state.project, keyframes: [...state.project.keyframes, newKeyframe] },
        ui: { ...state.ui, selectedKeyframeId: newKeyframe.id }
      };
  }),

  deleteKeyframe: (keyframeId, targetLayerId) => set((state) => {
    const layerId = targetLayerId || state.ui.selectedLayerId;
    const targetKf = state.project.keyframes.find(k => k.id === keyframeId);
    if (!targetKf) return state;

    const past = [...state.history.past, state.project].slice(-MAX_HISTORY);

    // Check if other layers have strokes in this keyframe
    const otherLayersHaveStrokes = targetKf.layerStates.some(
        ls => (layerId ? ls.layerId !== layerId : false) && ls.strokes.length > 0
    );

    let newKeyframes: Keyframe[];

    if (otherLayersHaveStrokes && layerId) {
        // Only clear strokes for the specified layer, keep keyframe and other layers intact!
        newKeyframes = state.project.keyframes.map(kf => {
            if (kf.id === keyframeId) {
                return {
                    ...kf,
                    layerStates: kf.layerStates.filter(ls => ls.layerId !== layerId)
                };
            }
            return kf;
        });
    } else {
        // No other layers have strokes in this keyframe
        if (state.project.keyframes.length > 1) {
            newKeyframes = state.project.keyframes.filter(k => k.id !== keyframeId);
        } else {
            // Keep the only remaining keyframe, but clear its strokes
            newKeyframes = state.project.keyframes.map(kf => {
                if (kf.id === keyframeId) {
                    return { ...kf, layerStates: [] };
                }
                return kf;
            });
        }
    }

    // Determine next selected keyframe ID
    let newSelectedId = state.ui.selectedKeyframeId;
    let newAxes = state.project.axes;

    if (keyframeId === newSelectedId) {
        // Look for a keyframe having data for the active layer
        const kfWithActiveLayerData = newKeyframes.find(k => 
            k.layerStates.some(ls => ls.layerId === state.ui.selectedLayerId && ls.strokes.length > 0)
        );
        if (kfWithActiveLayerData) {
            newSelectedId = kfWithActiveLayerData.id;
            newAxes = state.project.axes.map(a => {
                if (kfWithActiveLayerData.axisValues[a.id] !== undefined) {
                    return { ...a, currentValue: kfWithActiveLayerData.axisValues[a.id] };
                }
                return a;
            });
        } else {
            newSelectedId = newKeyframes[0]?.id || null;
            if (newKeyframes[0]) {
                newAxes = state.project.axes.map(a => {
                    if (newKeyframes[0].axisValues[a.id] !== undefined) {
                        return { ...a, currentValue: newKeyframes[0].axisValues[a.id] };
                    }
                    return a;
                });
            }
        }
    }

    return {
      project: { ...state.project, keyframes: newKeyframes, axes: newAxes },
      ui: { ...state.ui, selectedKeyframeId: newSelectedId, selectedStrokeId: null },
      history: { past, future: [] }
    };
  }),

  deleteKeyframeStateForLayer: (keyframeId, layerId) => {
    get().deleteKeyframe(keyframeId, layerId);
  },

  updateKeyframePosition: (keyframeId, x, y) => set((state) => {
     const past = [...state.history.past, state.project].slice(-MAX_HISTORY);
     
     const newKeyframes = state.project.keyframes.map(kf => {
         if (kf.id === keyframeId) {
             return {
                 ...kf,
                 axisValues: {
                     ...kf.axisValues,
                     'axis-x': x,
                     'axis-y': y
                 }
             };
         }
         return kf;
     });

     let newAxes = state.project.axes;
     if (state.ui.selectedKeyframeId === keyframeId) {
         newAxes = state.project.axes.map(a => {
             if (a.id === 'axis-x') return { ...a, currentValue: x };
             if (a.id === 'axis-y') return { ...a, currentValue: y };
             return a;
         });
     }

     return {
         project: { ...state.project, keyframes: newKeyframes, axes: newAxes },
         history: { past, future: [] }
     };
  }),

  splitKeyframeForLayer: (keyframeId, layerId) => {
      let newKfId = keyframeId;
      set((state) => {
          const kf = state.project.keyframes.find(k => k.id === keyframeId);
          if (!kf) return state;
          
          // Check if this keyframe has other layers with strokes
          const otherLayersHaveData = kf.layerStates.some(ls => ls.layerId !== layerId && ls.strokes.length > 0);
          
          if (!otherLayersHaveData) {
              // No need to split, just return the same ID
              return state;
          }
          
          // We need to split
          newKfId = `kf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const past = [...state.history.past, state.project].slice(-MAX_HISTORY);
          
          const layerStateToMove = kf.layerStates.find(ls => ls.layerId === layerId) || { layerId, strokes: [] };
          
          const newKeyframes = state.project.keyframes.map(k => {
              if (k.id === keyframeId) {
                  return {
                      ...k,
                      layerStates: k.layerStates.filter(ls => ls.layerId !== layerId)
                  };
              }
              return k;
          });
          
          const newKeyframe: Keyframe = {
              id: newKfId,
              name: `Keyframe ${state.project.keyframes.length}`,
              axisValues: { ...kf.axisValues },
              layerStates: [layerStateToMove]
          };
          
          newKeyframes.push(newKeyframe);
          
          return {
              project: { ...state.project, keyframes: newKeyframes },
              ui: { ...state.ui, selectedKeyframeId: newKfId },
              history: { past, future: [] }
          };
      });
      return newKfId;
  },

  // --- Copy / Paste Actions ---
  
  copyKeyframeState: () => set((state) => {
    const kfId = state.ui.selectedKeyframeId;
    const layerId = state.ui.selectedLayerId;
    if (!kfId || !layerId) return state;
    
    const kf = state.project.keyframes.find(k => k.id === kfId);
    if (!kf) return state;

    const layerState = kf.layerStates.find(ls => ls.layerId === layerId);
    if (!layerState) return state;

    // Deep copy of the specific layerState
    const clipboardData = JSON.parse(JSON.stringify([layerState]));
    
    return { clipboard: clipboardData };
  }),

  pasteKeyframeState: () => set((state) => {
      const past = [...state.history.past, state.project].slice(-MAX_HISTORY);
      
      // If no clipboard data, do nothing
      if (!state.clipboard || state.clipboard.length === 0) return state;

      const kfId = state.ui.selectedKeyframeId;
      const layerId = state.ui.selectedLayerId;
      if (!layerId) return state;

      const pastedLayerState = state.clipboard[0]; // We only copied one layer state

      // CASE 1: Paste into an existing selected Keyframe
      if (kfId) {
          const newKeyframes = state.project.keyframes.map(kf => {
              if (kf.id === kfId) {
                  // Replace ONLY the selected layer's state
                  const newLayerStates = kf.layerStates.map(ls => {
                      if (ls.layerId === layerId) {
                          return {
                              ...pastedLayerState,
                              layerId: layerId, // Ensure it pastes into the current layer
                              strokes: pastedLayerState.strokes.map((s: any) => ({ ...s, id: `stroke-${Date.now()}-${Math.random()}` }))
                          };
                      }
                      return ls;
                  });
                  
                  // If the layer state didn't exist in this keyframe, add it
                  if (!newLayerStates.some(ls => ls.layerId === layerId)) {
                      newLayerStates.push({
                          ...pastedLayerState,
                          layerId: layerId,
                          strokes: pastedLayerState.strokes.map((s: any) => ({ ...s, id: `stroke-${Date.now()}-${Math.random()}` }))
                      });
                  }

                  return { ...kf, layerStates: newLayerStates };
              }
              return kf;
          });

          return {
              project: { ...state.project, keyframes: newKeyframes },
              history: { past, future: [] }
          };
      } 
      // CASE 2: Paste into Undefined State (Create New Keyframe)
      else {
          const currentAxisValues: Record<string, number> = {};
          state.project.axes.forEach(a => currentAxisValues[a.id] = a.currentValue);
          
          const newKfId = `kf-${Date.now()}`;
          
          // Create empty layer states for all layers, then overwrite the selected one
          const newLayerStates = state.project.layers.map(l => {
              if (l.id === layerId) {
                  return {
                      ...pastedLayerState,
                      layerId: layerId,
                      strokes: pastedLayerState.strokes.map((s: any) => ({ ...s, id: `stroke-${Date.now()}-${Math.random()}` }))
                  };
              }
              return { layerId: l.id, strokes: [] };
          });

          const newKeyframe: Keyframe = {
              id: newKfId,
              name: `Keyframe ${state.project.keyframes.length}`,
              axisValues: currentAxisValues,
              layerStates: newLayerStates
          };

          return {
              project: { ...state.project, keyframes: [...state.project.keyframes, newKeyframe] },
              ui: { ...state.ui, selectedKeyframeId: newKfId },
              history: { past, future: [] }
          };
      }
  }),

  // ==========================================
  // MODE EXPERT & TIMELINES ACTIONS
  // ==========================================
  toggleExpertMode: () => set((state) => {
    const willEnable = !state.ui.expertModeEnabled;
    const animations = state.project.animations && state.project.animations.length > 0 
      ? state.project.animations 
      : [DEFAULT_ANIMATION];
    const activeAnimId = state.project.activeAnimationId || animations[0]?.id || 'anim-default';

    return {
      project: {
        ...state.project,
        animations,
        activeAnimationId: activeAnimId
      },
      ui: { 
        ...state.ui, 
        expertModeEnabled: willEnable,
        isTimelineOpen: willEnable,
        activeAnimationId: activeAnimId,
        timelinePlaying: willEnable ? state.ui.timelinePlaying : false
      }
    };
  }),

  setExpertMode: (enabled: boolean) => set((state) => {
    const animations = state.project.animations && state.project.animations.length > 0 
      ? state.project.animations 
      : [DEFAULT_ANIMATION];
    const activeAnimId = state.project.activeAnimationId || animations[0]?.id || 'anim-default';

    return {
      project: {
        ...state.project,
        animations,
        activeAnimationId: activeAnimId
      },
      ui: { 
        ...state.ui, 
        expertModeEnabled: enabled,
        isTimelineOpen: enabled ? state.ui.isTimelineOpen : false,
        activeAnimationId: activeAnimId,
        timelinePlaying: enabled ? state.ui.timelinePlaying : false
      }
    };
  }),

  toggleTimelinePanel: () => set((state) => ({
    ui: { ...state.ui, isTimelineOpen: !state.ui.isTimelineOpen }
  })),

  toggleInteractionsPanel: () => set((state) => ({
    ui: { ...state.ui, isInteractionsOpen: !state.ui.isInteractionsOpen }
  })),

  setActiveAnimation: (id: string) => set((state) => ({
    ui: { ...state.ui, activeAnimationId: id, timelineCurrentTime: 0, timelinePlaying: false },
    project: { ...state.project, activeAnimationId: id }
  })),

  addAnimation: (name?: string) => set((state) => {
    const existing = state.project.animations || [];
    const newId = `anim-${Date.now()}`;
    const newAnim: AnimationTimeline = {
      id: newId,
      name: name || `Animation ${existing.length + 1}`,
      duration: 2.0,
      loopMode: 'loop',
      fps: 30,
      markers: [
        {
          id: `marker-${Date.now()}-1`,
          time: 0.0,
          axisValues: { 'axis-x': 0.5, 'axis-y': 0.5 },
          easing: 'easeInOut',
          name: 'Start'
        },
        {
          id: `marker-${Date.now()}-2`,
          time: 2.0,
          axisValues: { 'axis-x': 0.5, 'axis-y': 0.5 },
          easing: 'easeInOut',
          name: 'End'
        }
      ]
    };

    return {
      project: {
        ...state.project,
        animations: [...existing, newAnim],
        activeAnimationId: newId
      },
      ui: {
        ...state.ui,
        activeAnimationId: newId,
        timelineCurrentTime: 0,
        timelinePlaying: false,
        selectedMarkerId: newAnim.markers[0].id
      }
    };
  }),

  deleteAnimation: (id: string) => set((state) => {
    const existing = state.project.animations || [];
    const filtered = existing.filter(a => a.id !== id);
    const nextActiveId = filtered.length > 0 ? filtered[0].id : null;
    return {
      project: {
        ...state.project,
        animations: filtered,
        activeAnimationId: nextActiveId
      },
      ui: {
        ...state.ui,
        activeAnimationId: nextActiveId,
        timelineCurrentTime: 0,
        timelinePlaying: false,
        selectedMarkerId: null
      }
    };
  }),

  renameAnimation: (id: string, name: string) => set((state) => {
    const existing = state.project.animations || [];
    const updated = existing.map(a => a.id === id ? { ...a, name } : a);
    return { project: { ...state.project, animations: updated } };
  }),

  setAnimationDuration: (id: string, duration: number) => set((state) => {
    const validDuration = Math.max(0.2, Number(duration) || 1.0);
    const existing = state.project.animations || [];
    const updated = existing.map(a => {
      if (a.id === id) {
        // Adjust markers if necessary
        const markers = a.markers.map(m => ({
          ...m,
          time: Math.min(validDuration, m.time)
        }));
        return { ...a, duration: validDuration, markers };
      }
      return a;
    });
    return {
      project: { ...state.project, animations: updated },
      ui: { ...state.ui, timelineCurrentTime: Math.min(state.ui.timelineCurrentTime, validDuration) }
    };
  }),

  setAnimationLoopMode: (id: string, loopMode: LoopMode) => set((state) => {
    const existing = state.project.animations || [];
    const updated = existing.map(a => a.id === id ? { ...a, loopMode } : a);
    return { project: { ...state.project, animations: updated } };
  }),

  setTimelineCurrentTime: (time: number) => set((state) => {
    const activeAnim = state.project.animations?.find(a => a.id === (state.ui.activeAnimationId || state.project.activeAnimationId));
    const maxDur = activeAnim ? activeAnim.duration : 10.0;
    const clampedTime = Math.max(0, Math.min(maxDur, time));

    const layerId = state.ui.selectedLayerId;
    let matchKfId: string | null = null;
    let newSelectedStrokeId = state.ui.selectedStrokeId;

    if (layerId && activeAnim && activeAnim.tracks) {
      const track = activeAnim.tracks.find(t => t.layerId === layerId);
      if (track && track.keyframes && track.keyframes.length > 0) {
        const matchKf = track.keyframes.find(k => Math.abs(k.time - clampedTime) <= 0.03);
        if (matchKf) {
          matchKfId = matchKf.id;
          if (matchKf.strokes && matchKf.strokes.length > 0) {
            const sameStroke = matchKf.strokes.find(s => s.id === state.ui.selectedStrokeId);
            newSelectedStrokeId = sameStroke ? sameStroke.id : matchKf.strokes[0].id;
          } else {
            newSelectedStrokeId = null;
          }
        } else {
          const targetLayer = state.project.layers.find(l => l.id === layerId);
          const evalStrokes = evaluateLayerTimelineStrokes(
            track,
            clampedTime,
            targetLayer?.interpolationMode || 'resample',
            200,
            activeAnim.loopMode || 'loop',
            activeAnim.duration || 2.0,
            targetLayer
          );
          if (evalStrokes && evalStrokes.length > 0) {
            const sameStroke = evalStrokes.find(s => s.id === state.ui.selectedStrokeId);
            newSelectedStrokeId = sameStroke ? sameStroke.id : evalStrokes[0].id;
          } else {
            newSelectedStrokeId = null;
          }
        }
      }
    }

    const hydrated = getHydratedUIProps(
      state.project,
      layerId,
      state.ui.selectedKeyframeId,
      newSelectedStrokeId,
      matchKfId,
      clampedTime
    );

    return {
      ui: {
        ...state.ui,
        timelineCurrentTime: clampedTime,
        selectedTimelineKeyframeId: matchKfId,
        selectedStrokeId: newSelectedStrokeId,
        ...hydrated
      }
    };
  }),

  setTimelinePlaying: (playing: boolean) => set((state) => ({
    ui: { ...state.ui, timelinePlaying: playing }
  })),

  addTimelineMarker: (animationId: string, time: number, keyframeId?: string, axisValues?: Record<string, number>, easing: EasingType = 'easeInOut') => set((state) => {
    const existing = state.project.animations || [];
    const currentAxisValues = axisValues || {};
    if (!axisValues) {
      state.project.axes.forEach(a => {
        currentAxisValues[a.id] = a.currentValue;
      });
    }

    const newMarkerId = `marker-${Date.now()}`;
    const linkedKf = keyframeId ? state.project.keyframes.find(k => k.id === keyframeId) : null;
    const finalAxisValues = linkedKf ? { ...linkedKf.axisValues } : currentAxisValues;
    const name = linkedKf ? linkedKf.name : `Pose at ${time.toFixed(1)}s`;

    const newMarker: TimelineKeyframeMarker = {
      id: newMarkerId,
      time: Math.round(time * 100) / 100,
      keyframeId,
      axisValues: finalAxisValues,
      easing,
      name
    };

    const updated = existing.map(a => {
      if (a.id === animationId) {
        const markers = [...a.markers, newMarker].sort((m1, m2) => m1.time - m2.time);
        return { ...a, markers };
      }
      return a;
    });

    return {
      project: { ...state.project, animations: updated },
      ui: { ...state.ui, selectedMarkerId: newMarkerId, timelineCurrentTime: newMarker.time }
    };
  }),

  updateTimelineMarker: (animationId: string, markerId: string, updates: Partial<TimelineKeyframeMarker>) => set((state) => {
    const existing = state.project.animations || [];
    const updated = existing.map(a => {
      if (a.id === animationId) {
        const markers = a.markers.map(m => {
          if (m.id === markerId) {
            const updatedMarker = { ...m, ...updates };
            if (updates.keyframeId) {
              const kf = state.project.keyframes.find(k => k.id === updates.keyframeId);
              if (kf) {
                updatedMarker.axisValues = { ...kf.axisValues };
                updatedMarker.name = kf.name;
              }
            }
            return updatedMarker;
          }
          return m;
        }).sort((m1, m2) => m1.time - m2.time);
        return { ...a, markers };
      }
      return a;
    });

    return { project: { ...state.project, animations: updated } };
  }),

  deleteTimelineMarker: (animationId: string, markerId: string) => set((state) => {
    const existing = state.project.animations || [];
    const updated = existing.map(a => {
      if (a.id === animationId) {
        const markers = a.markers.filter(m => m.id !== markerId);
        return { ...a, markers };
      }
      return a;
    });

    return {
      project: { ...state.project, animations: updated },
      ui: { ...state.ui, selectedMarkerId: state.ui.selectedMarkerId === markerId ? null : state.ui.selectedMarkerId }
    };
  }),

  setSelectedMarker: (markerId: string | null) => set((state) => {
    const activeAnim = state.project.animations?.find(a => a.id === state.ui.activeAnimationId);
    const marker = activeAnim?.markers.find(m => m.id === markerId);
    return {
      ui: {
        ...state.ui,
        selectedMarkerId: markerId,
        ...(marker ? { timelineCurrentTime: marker.time } : {})
      }
    };
  }),

  // ==========================================
  // LAYER TIMELINE TRACKS (MULTI-LAYER KEYFRAMING)
  // ==========================================
  setLayerDriverMode: (layerId: string, mode: LayerDriverMode) => set((state) => {
    const updatedLayers = state.project.layers.map(l => 
      l.id === layerId ? { ...l, driverMode: mode } : l
    );

    // If switching to timeline, ensure every animation has a track for this layer
    let updatedAnimations = state.project.animations && state.project.animations.length > 0 
      ? state.project.animations 
      : [DEFAULT_ANIMATION];

    if (mode === 'timeline') {
      updatedAnimations = updatedAnimations.map(anim => {
        const existingTracks = anim.tracks || [];
        const hasTrack = existingTracks.some(t => t.layerId === layerId);
        if (hasTrack) return anim;

        const newTrack: LayerTimelineTrack = {
          layerId,
          keyframes: []
        };
        return { ...anim, tracks: [...existingTracks, newTrack] };
      });
    }

    return {
      project: {
        ...state.project,
        layers: updatedLayers,
        animations: updatedAnimations
      },
      ui: {
        ...state.ui,
        selectedLayerTrackId: mode === 'timeline' ? layerId : state.ui.selectedLayerTrackId,
        isTimelineOpen: mode === 'matrix' ? false : state.ui.isTimelineOpen
      }
    };
  }),

  addLayerTimelineKeyframe: (layerId: string, time?: number, easing: EasingType = 'easeInOut') => set((state) => {
    const targetTime = time !== undefined ? time : state.ui.timelineCurrentTime;
    const animations = state.project.animations && state.project.animations.length > 0 
      ? state.project.animations 
      : [DEFAULT_ANIMATION];
    const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || animations[0].id;
    
    // Grab current strokes for this layer
    const activeKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
    const layerState = activeKf?.layerStates.find(ls => ls.layerId === layerId);
    const strokes = layerState?.strokes ? JSON.parse(JSON.stringify(layerState.strokes)) : [];

    const newKeyframeId = `kf-tl-${Date.now()}`;
    const newKeyframe: LayerTimelineKeyframe = {
      id: newKeyframeId,
      time: Math.round(targetTime * 100) / 100,
      strokes,
      easing,
      name: `Pose ${targetTime.toFixed(1)}s`
    };

    const updatedAnimations = animations.map(anim => {
      if (anim.id === activeAnimId) {
        const tracks = anim.tracks || [];
        let trackIndex = tracks.findIndex(t => t.layerId === layerId);
        let updatedTracks: LayerTimelineTrack[];

        if (trackIndex >= 0) {
          const track = tracks[trackIndex];
          const existingKf = track.keyframes.filter(k => Math.abs(k.time - newKeyframe.time) > 0.01);
          const updatedKf = [...existingKf, newKeyframe].sort((a, b) => a.time - b.time);
          updatedTracks = tracks.map((t, idx) => idx === trackIndex ? { ...t, keyframes: updatedKf } : t);
        } else {
          updatedTracks = [
            ...tracks,
            {
              layerId,
              keyframes: [newKeyframe]
            }
          ];
        }

        return { ...anim, tracks: updatedTracks };
      }
      return anim;
    });

    const updatedLayers = state.project.layers.map(l => 
      l.id === layerId ? { ...l, driverMode: 'timeline' as LayerDriverMode } : l
    );

    return {
      project: { ...state.project, animations: updatedAnimations, layers: updatedLayers },
      ui: { 
        ...state.ui, 
        selectedLayerTrackId: layerId, 
        selectedTimelineKeyframeId: newKeyframeId,
        timelineCurrentTime: newKeyframe.time
      }
    };
  }),

  updateLayerTimelineKeyframe: (layerId: string, keyframeId: string, updates: Partial<LayerTimelineKeyframe>) => set((state) => {
    const animations = state.project.animations || [];
    const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || animations[0]?.id;

    const updatedAnimations = animations.map(anim => {
      if (anim.id === activeAnimId && anim.tracks) {
        const tracks = anim.tracks.map(t => {
          if (t.layerId === layerId) {
            const keyframes = t.keyframes.map(k => {
              if (k.id === keyframeId) {
                return { ...k, ...updates };
              }
              return k;
            }).sort((a, b) => a.time - b.time);
            return { ...t, keyframes };
          }
          return t;
        });
        return { ...anim, tracks };
      }
      return anim;
    });

    return { project: { ...state.project, animations: updatedAnimations } };
  }),

  toggleAutoKeyframe: () => set((state) => ({
    ui: { ...state.ui, autoKeyframeEnabled: !state.ui.autoKeyframeEnabled }
  })),

  setAutoKeyframe: (enabled: boolean) => set((state) => ({
    ui: { ...state.ui, autoKeyframeEnabled: enabled }
  })),

  moveLayerTimelineKeyframe: (layerId: string, keyframeId: string, newTime: number) => set((state) => {
    const animations = state.project.animations || [];
    const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || animations[0]?.id;
    const activeAnim = animations.find(a => a.id === activeAnimId);
    const maxDuration = activeAnim?.duration || 2.0;
    const clampedTime = Math.max(0, Math.min(maxDuration, Math.round(newTime * 100) / 100));

    const updatedAnimations = animations.map(anim => {
      if (anim.id === activeAnimId && anim.tracks) {
        const tracks = anim.tracks.map(t => {
          if (t.layerId === layerId) {
            const keyframes = t.keyframes.map(k => {
              if (k.id === keyframeId) {
                return { ...k, time: clampedTime, name: `Pose ${clampedTime.toFixed(2)}s` };
              }
              return k;
            }).sort((a, b) => a.time - b.time);
            return { ...t, keyframes };
          }
          return t;
        });
        return { ...anim, tracks };
      }
      return anim;
    });

    return {
      project: { ...state.project, animations: updatedAnimations },
      ui: { 
        ...state.ui, 
        timelineCurrentTime: clampedTime, 
        selectedTimelineKeyframeId: keyframeId, 
        selectedLayerTrackId: layerId 
      }
    };
  }),

  updateLayerTimelineKeyframeEasing: (layerId: string, keyframeId: string, easing: EasingType) => set((state) => {
    const animations = state.project.animations || [];
    const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || animations[0]?.id;

    const updatedAnimations = animations.map(anim => {
      if (anim.id === activeAnimId && anim.tracks) {
        const tracks = anim.tracks.map(t => {
          if (t.layerId === layerId) {
            const keyframes = t.keyframes.map(k => {
              if (k.id === keyframeId) {
                return { ...k, easing };
              }
              return k;
            });
            return { ...t, keyframes };
          }
          return t;
        });
        return { ...anim, tracks };
      }
      return anim;
    });

    return { project: { ...state.project, animations: updatedAnimations } };
  }),

  deleteLayerTimelineKeyframe: (layerId: string, keyframeId: string) => set((state) => {
    const animations = state.project.animations || [];
    const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || animations[0]?.id;

    const updatedAnimations = animations.map(anim => {
      if (anim.id === activeAnimId && anim.tracks) {
        const tracks = anim.tracks.map(t => {
          if (t.layerId === layerId) {
            return {
              ...t,
              keyframes: t.keyframes.filter(k => k.id !== keyframeId)
            };
          }
          return t;
        });
        return { ...anim, tracks };
      }
      return anim;
    });

    return {
      project: { ...state.project, animations: updatedAnimations },
      ui: {
        ...state.ui,
        selectedTimelineKeyframeId: state.ui.selectedTimelineKeyframeId === keyframeId ? null : state.ui.selectedTimelineKeyframeId
      }
    };
  }),

  duplicateLayerTimelineKeyframe: (layerId: string, keyframeId: string, newTime?: number) => set((state) => {
    const animations = state.project.animations || [];
    const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId || animations[0]?.id;
    const activeAnim = animations.find(a => a.id === activeAnimId);
    const maxDuration = activeAnim?.duration || 2.0;

    const newKfId = `kf-tl-${Date.now()}`;
    let finalTargetTime = newTime;

    const updatedAnimations = animations.map(anim => {
      if (anim.id === activeAnimId && anim.tracks) {
        const tracks = anim.tracks.map(t => {
          if (t.layerId === layerId) {
            const sourceKf = t.keyframes.find(k => k.id === keyframeId);
            if (!sourceKf) return t;

            if (finalTargetTime === undefined) {
              finalTargetTime = Math.min(maxDuration, Math.round((sourceKf.time + 0.2) * 100) / 100);
            }
            finalTargetTime = Math.max(0, Math.min(maxDuration, Math.round(finalTargetTime * 100) / 100));

            const clonedKf: LayerTimelineKeyframe = {
              id: newKfId,
              time: finalTargetTime,
              strokes: JSON.parse(JSON.stringify(sourceKf.strokes || [])),
              easing: sourceKf.easing || 'easeInOut',
              name: `${sourceKf.name || 'Pose'} (copie)`
            };

            const existingWithoutTarget = t.keyframes.filter(k => Math.abs(k.time - finalTargetTime!) > 0.01);
            const updatedKeyframes = [...existingWithoutTarget, clonedKf].sort((a, b) => a.time - b.time);

            return { ...t, keyframes: updatedKeyframes };
          }
          return t;
        });
        return { ...anim, tracks };
      }
      return anim;
    });

    return {
      project: { ...state.project, animations: updatedAnimations },
      ui: {
        ...state.ui,
        selectedTimelineKeyframeId: newKfId,
        selectedLayerTrackId: layerId,
        timelineCurrentTime: finalTargetTime !== undefined ? finalTargetTime : state.ui.timelineCurrentTime
      }
    };
  }),

  setSelectedLayerTrack: (layerId: string | null) => set((state) => ({
    ui: { ...state.ui, selectedLayerTrackId: layerId }
  })),

  setSelectedTimelineKeyframe: (layerId: string | null, keyframeId: string | null) => set((state) => {
    const animations = state.project.animations || [];
    const activeAnim = animations.find(a => a.id === (state.ui.activeAnimationId || state.project.activeAnimationId));
    const track = activeAnim?.tracks?.find(t => t.layerId === layerId);
    const kf = track?.keyframes.find(k => k.id === keyframeId);

    let newSelectedStrokeId = state.ui.selectedStrokeId;
    if (kf && kf.strokes) {
      if (kf.strokes.length > 0) {
        const sameStroke = kf.strokes.find(s => s.id === state.ui.selectedStrokeId);
        newSelectedStrokeId = sameStroke ? sameStroke.id : kf.strokes[0].id;
      } else {
        newSelectedStrokeId = null;
      }
    }

    const hydratedProps = getHydratedUIProps(
        state.project, 
        layerId || state.ui.selectedLayerId, 
        state.ui.selectedKeyframeId, 
        newSelectedStrokeId, 
        keyframeId,
        kf?.time
    );

    return {
      ui: {
        ...state.ui,
        selectedLayerTrackId: layerId,
        selectedTimelineKeyframeId: keyframeId,
        selectedStrokeId: newSelectedStrokeId,
        ...(kf ? { timelineCurrentTime: kf.time } : {}),
        ...hydratedProps
      }
    };
  }),

  captureCurrentPoseToTimelineKeyframe: (layerId: string, keyframeId: string) => set((state) => {
    const activeKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
    const layerState = activeKf?.layerStates.find(ls => ls.layerId === layerId);
    if (!layerState) return state;

    const strokes = JSON.parse(JSON.stringify(layerState.strokes || []));
    const animations = state.project.animations || [];
    const activeAnimId = state.ui.activeAnimationId || state.project.activeAnimationId;

    const updatedAnimations = animations.map(anim => {
      if (anim.id === activeAnimId && anim.tracks) {
        const tracks = anim.tracks.map(t => {
          if (t.layerId === layerId) {
            const keyframes = t.keyframes.map(k => k.id === keyframeId ? { ...k, strokes } : k);
            return { ...t, keyframes };
          }
          return t;
        });
        return { ...anim, tracks };
      }
      return anim;
    });

    return { project: { ...state.project, animations: updatedAnimations } };
  }),

  // ==========================================
  // STATE MACHINE & INTERACTIVE TRIGGER RULES
  // ==========================================
  addInteraction: (layerId: string, trigger: InteractionTrigger, action: InteractionAction, name?: string, collider?: InteractionCollider) => set((state) => {
    const existing = state.project.interactions || [];
    const defaultCollider: InteractionCollider = collider || {
      type: layerId === 'canvas' ? 'canvas' : 'layer'
    };

    const newInteraction: LayerInteraction = {
      id: `interaction-${Date.now()}`,
      layerId,
      name: name || `On ${trigger}`,
      trigger,
      action,
      collider: defaultCollider,
      enabled: true
    };

    return {
      project: {
        ...state.project,
        interactions: [...existing, newInteraction]
      }
    };
  }),

  updateInteraction: (id: string, updates: Partial<LayerInteraction>) => set((state) => {
    const existing = state.project.interactions || [];
    const updated = existing.map(i => i.id === id ? { ...i, ...updates } : i);
    return { project: { ...state.project, interactions: updated } };
  }),

  deleteInteraction: (id: string) => set((state) => {
    const existing = state.project.interactions || [];
    return {
      project: {
        ...state.project,
        interactions: existing.filter(i => i.id !== id)
      },
      ui: {
        ...state.ui,
        editingColliderInteractionId: state.ui.editingColliderInteractionId === id ? null : state.ui.editingColliderInteractionId
      }
    };
  }),

  setInteractionCollider: (id: string, collider: InteractionCollider) => set((state) => {
    const existing = state.project.interactions || [];
    const updated = existing.map(i => i.id === id ? { ...i, collider } : i);
    return { project: { ...state.project, interactions: updated } };
  }),

  setEditingColliderInteractionId: (interactionId: string | null) => set((state) => ({
    ui: { ...state.ui, editingColliderInteractionId: interactionId }
  })),

  // --- Visual State Machine Graph Implementations ---
  ensureStateMachine: () => {
    const state = get();
    if (state.project.stateMachines && state.project.stateMachines.length > 0) {
      const sm = state.project.stateMachines.find(s => s.id === state.project.activeStateMachineId) || state.project.stateMachines[0];
      return sm;
    }
    const defaultSm = getOrCreateDefaultStateMachine(state.project);
    set((s) => ({
      project: {
        ...s.project,
        stateMachines: [defaultSm],
        activeStateMachineId: defaultSm.id
      }
    }));
    return defaultSm;
  },

  addStateNode: (nodeData) => {
    const id = `node-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newNode: StateNode = { ...nodeData, id };
    set((state) => {
      const smList = state.project.stateMachines && state.project.stateMachines.length > 0 
        ? [...state.project.stateMachines] 
        : [getOrCreateDefaultStateMachine(state.project)];
      const activeSmId = state.project.activeStateMachineId || smList[0].id;

      const updatedList = smList.map(sm => {
        if (sm.id !== activeSmId) return sm;
        return {
          ...sm,
          nodes: [...sm.nodes, newNode]
        };
      });

      return {
        project: {
          ...state.project,
          stateMachines: updatedList,
          activeStateMachineId: activeSmId
        },
        ui: {
          ...state.ui,
          selectedGraphNodeId: id
        }
      };
    });
    return id;
  },

  updateStateNode: (nodeId, updates) => set((state) => {
    const smList = state.project.stateMachines || [];
    const activeSmId = state.project.activeStateMachineId || smList[0]?.id;
    if (!activeSmId) return {};

    const updatedList = smList.map(sm => {
      if (sm.id !== activeSmId) return sm;
      return {
        ...sm,
        nodes: sm.nodes.map(n => n.id === nodeId ? { ...n, ...updates } : n)
      };
    });

    return {
      project: { ...state.project, stateMachines: updatedList }
    };
  }),

  deleteStateNode: (nodeId) => set((state) => {
    const smList = state.project.stateMachines || [];
    const activeSmId = state.project.activeStateMachineId || smList[0]?.id;
    if (!activeSmId) return {};

    const updatedList = smList.map(sm => {
      if (sm.id !== activeSmId) return sm;
      // Do not delete entry node if it's the only one
      if (sm.entryNodeId === nodeId) return sm;
      return {
        ...sm,
        nodes: sm.nodes.filter(n => n.id !== nodeId),
        transitions: sm.transitions.filter(t => t.fromNodeId !== nodeId && t.toNodeId !== nodeId)
      };
    });

    return {
      project: { ...state.project, stateMachines: updatedList },
      ui: {
        ...state.ui,
        selectedGraphNodeId: state.ui.selectedGraphNodeId === nodeId ? null : state.ui.selectedGraphNodeId
      }
    };
  }),

  addStateTransition: (transitionData) => {
    const id = `trans-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const newTrans: StateTransition = { ...transitionData, id };

    set((state) => {
      const smList = state.project.stateMachines && state.project.stateMachines.length > 0
        ? [...state.project.stateMachines]
        : [getOrCreateDefaultStateMachine(state.project)];
      const activeSmId = state.project.activeStateMachineId || smList[0].id;

      const updatedList = smList.map(sm => {
        if (sm.id !== activeSmId) return sm;
        // Avoid exact duplicate transitions
        const exists = sm.transitions.some(t => t.fromNodeId === newTrans.fromNodeId && t.toNodeId === newTrans.toNodeId && t.trigger === newTrans.trigger);
        if (exists) return sm;
        return {
          ...sm,
          transitions: [...sm.transitions, newTrans]
        };
      });

      return {
        project: {
          ...state.project,
          stateMachines: updatedList,
          activeStateMachineId: activeSmId
        },
        ui: {
          ...state.ui,
          selectedGraphTransitionId: id
        }
      };
    });
    return id;
  },

  updateStateTransition: (transitionId, updates) => set((state) => {
    const smList = state.project.stateMachines || [];
    const activeSmId = state.project.activeStateMachineId || smList[0]?.id;
    if (!activeSmId) return {};

    const updatedList = smList.map(sm => {
      if (sm.id !== activeSmId) return sm;
      return {
        ...sm,
        transitions: sm.transitions.map(t => t.id === transitionId ? { ...t, ...updates } : t)
      };
    });

    return {
      project: { ...state.project, stateMachines: updatedList }
    };
  }),

  deleteStateTransition: (transitionId) => set((state) => {
    const smList = state.project.stateMachines || [];
    const activeSmId = state.project.activeStateMachineId || smList[0]?.id;
    if (!activeSmId) return {};

    const updatedList = smList.map(sm => {
      if (sm.id !== activeSmId) return sm;
      return {
        ...sm,
        transitions: sm.transitions.filter(t => t.id !== transitionId)
      };
    });

    return {
      project: { ...state.project, stateMachines: updatedList },
      ui: {
        ...state.ui,
        selectedGraphTransitionId: state.ui.selectedGraphTransitionId === transitionId ? null : state.ui.selectedGraphTransitionId
      }
    };
  }),

  captureCurrentPoseToStateNode: (nodeId) => {
    const state = get();
    const targetKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
    const activeAnim = state.project.animations?.find(a => a.id === state.ui.activeAnimationId);

    const snapshotStates: LayerState[] = state.project.layers.map(layer => {
      let activeStrokes: Stroke[] = [];
      if (activeAnim) {
        const track = activeAnim.tracks?.find(t => t.layerId === layer.id);
        if (track && track.keyframes.length > 0) {
          const playhead = state.ui.timelineCurrentTime || 0;
          const closestKf = track.keyframes.reduce((prev, curr) => 
            Math.abs(curr.time - playhead) < Math.abs(prev.time - playhead) ? curr : prev
          , track.keyframes[0]);
          if (closestKf && closestKf.strokes) {
            activeStrokes = closestKf.strokes;
          }
        }
      }
      if (activeStrokes.length === 0) {
        const kfLs = targetKf?.layerStates.find(ls => ls.layerId === layer.id);
        if (kfLs?.strokes) {
          activeStrokes = kfLs.strokes;
        }
      }
      return {
        layerId: layer.id,
        strokes: JSON.parse(JSON.stringify(activeStrokes))
      };
    });

    get().updateStateNode(nodeId, {
      poseData: {
        keyframeId: targetKf?.id,
        layerStates: snapshotStates,
        axisValues: targetKf?.axisValues ? { ...targetKf.axisValues } : { 'axis-x': 0.5, 'axis-y': 0.5 }
      }
    });
  },

  applyPoseStateNodeToCanvas: (nodeId: string) => set((state) => {
    const sm = state.project.stateMachines?.find(s => s.id === state.project.activeStateMachineId) || state.project.stateMachines?.[0];
    const node = sm?.nodes.find(n => n.id === nodeId);
    if (!node || node.type !== 'pose' || !node.poseData?.layerStates) return state;

    const targetKfId = state.ui.selectedKeyframeId || state.project.keyframes[0]?.id;
    if (!targetKfId) return state;

    const updatedKeyframes = state.project.keyframes.map(kf => {
      if (kf.id !== targetKfId) return kf;
      const updatedLs = kf.layerStates.map(ls => {
        const poseLs = node.poseData?.layerStates.find(s => s.layerId === ls.layerId);
        return poseLs ? { ...ls, strokes: JSON.parse(JSON.stringify(poseLs.strokes)) } : ls;
      });
      return { ...kf, layerStates: updatedLs };
    });

    return {
      project: { ...state.project, keyframes: updatedKeyframes },
      ui: { ...state.ui, activeStateNodeId: nodeId }
    };
  }),

  createPoseStateNodeFromCurrent: (name, x = 320, y = 200) => {
    const state = get();
    const targetKf = state.project.keyframes.find(k => k.id === state.ui.selectedKeyframeId) || state.project.keyframes[0];
    const activeAnim = state.project.animations?.find(a => a.id === state.ui.activeAnimationId);

    const snapshotStates: LayerState[] = state.project.layers.map(layer => {
      let activeStrokes: Stroke[] = [];
      if (activeAnim) {
        const track = activeAnim.tracks?.find(t => t.layerId === layer.id);
        if (track && track.keyframes.length > 0) {
          const playhead = state.ui.timelineCurrentTime || 0;
          const closestKf = track.keyframes.reduce((prev, curr) => 
            Math.abs(curr.time - playhead) < Math.abs(prev.time - playhead) ? curr : prev
          , track.keyframes[0]);
          if (closestKf && closestKf.strokes) {
            activeStrokes = closestKf.strokes;
          }
        }
      }
      if (activeStrokes.length === 0) {
        const kfLs = targetKf?.layerStates.find(ls => ls.layerId === layer.id);
        if (kfLs?.strokes) {
          activeStrokes = kfLs.strokes;
        }
      }
      return {
        layerId: layer.id,
        strokes: JSON.parse(JSON.stringify(activeStrokes))
      };
    });

    const nodeId = get().addStateNode({
      name: name || `Pose ${((state.project.stateMachines?.[0]?.nodes.length || 0) + 1)}`,
      type: 'pose',
      x,
      y,
      poseData: {
        keyframeId: targetKf?.id,
        layerStates: snapshotStates,
        axisValues: targetKf?.axisValues ? { ...targetKf.axisValues } : { 'axis-x': 0.5, 'axis-y': 0.5 }
      },
      color: '#3B82F6'
    });

    return nodeId;
  },

  createClipStateNode: (animationId, x = 360, y = 200) => {
    const state = get();
    const anim = state.project.animations?.find(a => a.id === animationId);
    const nodeId = get().addStateNode({
      name: anim?.name || 'Clip Animation',
      type: 'clip',
      x,
      y,
      animationId,
      color: '#8B5CF6'
    });
    return nodeId;
  },

  setGraphWindowPosition: (position) => set((state) => ({
    ui: { ...state.ui, graphWindowPosition: position }
  })),

  setGraphWindowSize: (size) => set((state) => ({
    ui: { ...state.ui, graphWindowSize: size }
  })),

  setGraphWindowMaximized: (maximized) => set((state) => ({
    ui: { ...state.ui, graphWindowMaximized: maximized }
  })),

  setSelectedGraphNode: (nodeId) => set((state) => {
    if (!nodeId) {
      return {
        ui: { ...state.ui, selectedGraphNodeId: null, selectedGraphTransitionId: null }
      };
    }
    const sm = state.project.stateMachines?.find(s => s.id === state.project.activeStateMachineId) || state.project.stateMachines?.[0];
    const node = sm?.nodes.find(n => n.id === nodeId);

    let nextSelectedLayerId = state.ui.selectedLayerId;
    let nextIsTimelineOpen = state.ui.isTimelineOpen;
    let updatedKeyframes = state.project.keyframes;
    let updatedStateMachines = state.project.stateMachines;

    if (node && node.type === 'pose') {
      // Auto-select corresponding layer if configured
      if (node.targetLayerId && node.targetLayerId !== 'all') {
        const layerExists = state.project.layers.some(l => l.id === node.targetLayerId);
        if (layerExists) {
          nextSelectedLayerId = node.targetLayerId;
        }
      } else if (state.ui.selectedLayerId) {
        // Associate current layer if node has no layer set
        updatedStateMachines = state.project.stateMachines?.map(s => {
          if (s.id !== sm?.id) return s;
          return {
            ...s,
            nodes: s.nodes.map(n => n.id === nodeId ? { ...n, targetLayerId: state.ui.selectedLayerId } : n)
          };
        });
      }

      // Close timeline to keep canvas focused purely on pose editing
      nextIsTimelineOpen = false;

      // Automatically apply pose strokes to current canvas keyframe
      if (node.poseData?.layerStates && node.poseData.layerStates.length > 0) {
        const targetKfId = state.ui.selectedKeyframeId || state.project.keyframes[0]?.id;
        if (targetKfId) {
          updatedKeyframes = state.project.keyframes.map(kf => {
            if (kf.id !== targetKfId) return kf;
            const updatedLs = kf.layerStates.map(ls => {
              const poseLs = node.poseData?.layerStates.find(s => s.layerId === ls.layerId);
              return poseLs ? { ...ls, strokes: JSON.parse(JSON.stringify(poseLs.strokes)) } : ls;
            });
            // Add any layers from pose not yet present
            node.poseData?.layerStates.forEach(pls => {
              if (!updatedLs.some(ls => ls.layerId === pls.layerId)) {
                updatedLs.push({ layerId: pls.layerId, strokes: JSON.parse(JSON.stringify(pls.strokes)) });
              }
            });
            return { ...kf, layerStates: updatedLs };
          });
        }
      }
    }

    return {
      project: {
        ...state.project,
        keyframes: updatedKeyframes,
        stateMachines: updatedStateMachines
      },
      ui: {
        ...state.ui,
        selectedGraphNodeId: nodeId,
        selectedGraphTransitionId: null,
        selectedLayerId: nextSelectedLayerId,
        isTimelineOpen: nextIsTimelineOpen
      }
    };
  }),

  setSelectedGraphTransition: (transitionId) => set((state) => ({
    ui: { ...state.ui, selectedGraphTransitionId: transitionId, selectedGraphNodeId: null }
  })),

  setActiveStateNode: (nodeId) => set((state) => {
    if (!nodeId) return { ui: { ...state.ui, activeStateNodeId: null } };
    const sm = state.project.stateMachines?.find(s => s.id === state.project.activeStateMachineId) || state.project.stateMachines?.[0];
    const node = sm?.nodes.find(n => n.id === nodeId);
    if (!node) return { ui: { ...state.ui, activeStateNodeId: nodeId } };

    if (node.type === 'clip' && node.animationId) {
      return {
        ui: {
          ...state.ui,
          activeStateNodeId: nodeId,
          activeAnimationId: node.animationId,
          timelineCurrentTime: 0
        }
      };
    }

    if (node.type === 'pose') {
      let nextSelectedLayerId = state.ui.selectedLayerId;
      if (node.targetLayerId && node.targetLayerId !== 'all') {
        const layerExists = state.project.layers.some(l => l.id === node.targetLayerId);
        if (layerExists) nextSelectedLayerId = node.targetLayerId;
      }

      let updatedKeyframes = state.project.keyframes;
      if (node.poseData?.layerStates && node.poseData.layerStates.length > 0) {
        const targetKfId = state.ui.selectedKeyframeId || state.project.keyframes[0]?.id;
        if (targetKfId) {
          updatedKeyframes = state.project.keyframes.map(kf => {
            if (kf.id !== targetKfId) return kf;
            const updatedLs = kf.layerStates.map(ls => {
              const poseLs = node.poseData?.layerStates.find(s => s.layerId === ls.layerId);
              return poseLs ? { ...ls, strokes: JSON.parse(JSON.stringify(poseLs.strokes)) } : ls;
            });
            node.poseData?.layerStates.forEach(pls => {
              if (!updatedLs.some(ls => ls.layerId === pls.layerId)) {
                updatedLs.push({ layerId: pls.layerId, strokes: JSON.parse(JSON.stringify(pls.strokes)) });
              }
            });
            return { ...kf, layerStates: updatedLs };
          });
        }
      }

      return {
        project: {
          ...state.project,
          keyframes: updatedKeyframes
        },
        ui: {
          ...state.ui,
          activeStateNodeId: nodeId,
          selectedLayerId: nextSelectedLayerId,
          isTimelineOpen: false,
          isMatrixOpen: false
        }
      };
    }

    return { ui: { ...state.ui, activeStateNodeId: nodeId } };
  }),

  setRuntimeScrollProgress: (progress) => set((state) => ({
    ui: { ...state.ui, runtimeScrollProgress: Math.max(0, Math.min(1, progress)) }
  }))

}));