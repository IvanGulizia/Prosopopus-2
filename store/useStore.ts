// store/useStore.ts
import { create } from 'zustand';
import { Project, UIState, ToolType, Axis, Layer, Keyframe, Point, Stroke, LayerState, BlendMode, UIMode, InterpolationMode, InterpolationStrategy, StyleProps, Theme } from '../types';
import { DEFAULT_PROJECT, INITIAL_UI_STATE, DEFAULT_LAYER, DEFAULT_KEYFRAME } from '../constants';
import { simplifyPoints, distance, chaikinSmooth, simplifyCollinearPoints } from '../utils/math';

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
  
  // Project Actions
  resetProject: () => void;
  loadProject: (project: Project) => void;

  toggleSettings: () => void;
  toggleLayerPanel: () => void;
  closeAllPanels: () => void; // Used for clicking outside

  setMode: (mode: UIMode) => void;

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
  
  toggleSnapPlayMode: () => void;
  toggleSnapMatrixGrid: () => void;
  setAxisMatrixDivisions: (val: number) => void;
  setAxisMatrixPadding: (val: number) => void;
  setInterpolationExponent: (val: number) => void;
  setInterpolationStrategy: (val: InterpolationStrategy) => void;
  
  togglePlayModePhysics: () => void;
  setSpringStiffness: (val: number) => void;
  setSpringDamping: (val: number) => void;

  setGridSize: (size: number) => void;
  toggleSmoothing: () => void; // Renamed from toggleSimplifyStrokes
  
  toggleOnionSkin: () => void;
  setOnionSkinOpacity: (opacity: number) => void;
  setInactiveLayerOpacity: (opacity: number) => void;
  setGhostStrokeOpacity: (opacity: number) => void;

  // Performance Actions
  setResolutionScale: (scale: number) => void;
  togglePerformanceMode: () => void;
  
  // Layer Actions
  addLayer: () => void;
  deleteLayer: (layerId: string) => void;
  renameLayer: (layerId: string, name: string) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  toggleLayerVisibility: (layerId: string) => void;
  toggleLayerLock: (layerId: string) => void;
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
  updateStrokeInCurrentKeyframe: (strokeId: string, newPoints: Point[]) => void;
  deleteStroke: (strokeId: string) => void; 
  
  createKeyframeAtCurrentAxes: () => void;
  deleteKeyframe: (keyframeId: string) => void;
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

const MAX_HISTORY = 50;

// HELPER: Extract UI properties (color, width) from the current selection context
const getHydratedUIProps = (project: Project, layerId: string | null, kfId: string | null, strokeId: string | null): Partial<UIState> => {
    if (!layerId || !kfId) return {};

    const layer = project.layers.find(l => l.id === layerId);
    if (!layer) return {};

    const kf = project.keyframes.find(k => k.id === kfId);
    if (!kf) return {};

    const layerState = kf.layerStates.find(ls => ls.layerId === layerId);
    if (!layerState || layerState.strokes.length === 0) {
        // Fallback to layer base style if no strokes exist
        const style = resolveStrokeStyle(undefined, layer);
        return {
            brushColor: style.strokeColor,
            fillColor: style.fillColor,
            brushSize: style.strokeWidth,
            cornerRoundness: style.cornerRoundness
        };
    }

    // Determine which stroke to read from
    let targetStroke = layerState.strokes[0]; // Default to first
    if (strokeId) {
        const found = layerState.strokes.find(s => s.id === strokeId);
        if (found) targetStroke = found;
    }

    const style = resolveStrokeStyle(targetStroke, layer);

    return {
        brushColor: style.strokeColor,
        fillColor: style.fillColor,
        brushSize: style.strokeWidth,
        cornerRoundness: style.cornerRoundness
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
  toggleLayerPanel: () => set((state) => ({ ui: { ...state.ui, isLayerPanelOpen: !state.ui.isLayerPanelOpen, isSettingsOpen: false, isDebugMenuOpen: false } })),
  toggleDebugMenu: () => set((state) => ({ ui: { ...state.ui, isDebugMenuOpen: !state.ui.isDebugMenuOpen, isSettingsOpen: false } })),
  setThemeColor: (key, color) => set((state) => ({ ui: { ...state.ui, theme: { ...state.ui.theme, [key]: color } } })),
  closeAllPanels: () => set((state) => ({ ui: { ...state.ui, isSettingsOpen: false, isLayerPanelOpen: false } })),

  setMode: (mode) => set((state) => ({
    ui: {
        ...state.ui,
        mode,
        // Auto-close panels when entering Play mode
        isLayerPanelOpen: mode === 'play' ? false : state.ui.isLayerPanelOpen,
        isSettingsOpen: mode === 'play' ? false : state.ui.isSettingsOpen
    }
  })),

  undo: () => set((state) => {
    if (state.history.past.length === 0) return state;
    const previous = state.history.past[state.history.past.length - 1];
    const newPast = state.history.past.slice(0, -1);
    
    // HYDRATE UI FROM UNDO STATE
    const restoredUIProps = getHydratedUIProps(
        previous, 
        state.ui.selectedLayerId, 
        state.ui.selectedKeyframeId, 
        state.ui.selectedStrokeId
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
        state.ui.selectedStrokeId
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

  setTool: (tool) => set((state) => ({ 
      ui: { 
          ...state.ui, 
          selectedTool: tool, 
          // We DO NOT clear selectedStrokeId here anymore. 
          // This allows "Direct Selection" workflow (Draw -> Click Select -> Object is already selected)
      } 
  })),
  
  // --- BATCH UPDATE: PROPERTIES (Color/Size) ---
  // If a stroke is selected, these functions update the stroke across ALL keyframes.
  
  setBrushColor: (color) => set((state) => {
    // 1. Update UI (Source of Truth for next stroke)
    const newUI = { ...state.ui, brushColor: color };
    const strokeColor = color === 'none' ? 'none' : color;

    // 2. Deep Update if Object Selected
    if (state.ui.selectedKeyframeId && state.ui.selectedLayerId && state.ui.selectedStrokeId) {
        const targetId = state.ui.selectedStrokeId;
        const past = [...state.history.past, state.project].slice(-MAX_HISTORY);

        const newKeyframes = state.project.keyframes.map(kf => {
            if (kf.id !== state.ui.selectedKeyframeId) return kf;
            return {
                ...kf,
                layerStates: kf.layerStates.map(ls => ({
                    ...ls,
                    strokes: ls.strokes.map(s => {
                        // Update only matching ID
                        if (s.id === targetId) {
                            return { ...s, style: { ...s.style, strokeColor } };
                        }
                        return s;
                    })
                }))
            };
        });

        return { 
           ui: newUI, 
           project: { ...state.project, keyframes: newKeyframes },
           history: { past, future: [] }
        };
    }

    return { ui: newUI };
  }),

  setFillColor: (color) => set((state) => {
    const newUI = { ...state.ui, fillColor: color };
    
    if (state.ui.selectedKeyframeId && state.ui.selectedLayerId && state.ui.selectedStrokeId) {
        const targetId = state.ui.selectedStrokeId;
        const past = [...state.history.past, state.project].slice(-MAX_HISTORY);

        const newKeyframes = state.project.keyframes.map(kf => {
            if (kf.id !== state.ui.selectedKeyframeId) return kf;
            return {
                ...kf,
                layerStates: kf.layerStates.map(ls => ({
                    ...ls,
                    strokes: ls.strokes.map(s => {
                        if (s.id === targetId) {
                            return { ...s, style: { ...s.style, fillColor: color } };
                        }
                        return s;
                    })
                }))
            };
        });

        return { 
           ui: newUI, 
           project: { ...state.project, keyframes: newKeyframes },
           history: { past, future: [] }
        };
    }

    return { ui: newUI };
  }),

  setBrushSize: (size) => set((state) => {
    const newUI = { ...state.ui, brushSize: size };
    
    if (state.ui.selectedKeyframeId && state.ui.selectedLayerId && state.ui.selectedStrokeId) {
        const targetId = state.ui.selectedStrokeId;
        const past = [...state.history.past, state.project].slice(-MAX_HISTORY);

        const newKeyframes = state.project.keyframes.map(kf => {
            if (kf.id !== state.ui.selectedKeyframeId) return kf;
            return {
                ...kf,
                layerStates: kf.layerStates.map(ls => ({
                    ...ls,
                    strokes: ls.strokes.map(s => {
                        if (s.id === targetId) {
                            return { ...s, style: { ...s.style, strokeWidth: size } };
                        }
                        return s;
                    })
                }))
            };
        });

        return { 
           ui: newUI, 
           project: { ...state.project, keyframes: newKeyframes },
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

    // Clear overrides for this property in all strokes of this layer
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

    return { 
       ui: state.ui.selectedLayerId === layerId ? { ...state.ui, brushColor: color } : state.ui,
       project: { ...state.project, layers: newLayers, keyframes: newKeyframes },
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

    // Clear overrides for this property in all strokes of this layer
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

    return { 
       ui: state.ui.selectedLayerId === layerId ? { ...state.ui, fillColor: color } : state.ui,
       project: { ...state.project, layers: newLayers, keyframes: newKeyframes },
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

    // Clear overrides for this property in all strokes of this layer
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

    return { 
       ui: state.ui.selectedLayerId === layerId ? { ...state.ui, brushSize: width } : state.ui,
       project: { ...state.project, layers: newLayers, keyframes: newKeyframes },
       history: { past, future: [] }
    };
  }),

  toggleGrid: () => set((state) => ({ ui: { ...state.ui, showGrid: !state.ui.showGrid } })),
  toggleSnapToGrid: () => set((state) => ({ ui: { ...state.ui, snapToGrid: !state.ui.snapToGrid } })),
  setSnapScale: (scale) => set((state) => ({ ui: { ...state.ui, snapScale: scale } })),
  setStrokeCap: (cap) => set((state) => ({ ui: { ...state.ui, strokeCap: cap } })),
  
  toggleSnapPlayMode: () => set((state) => ({ ui: { ...state.ui, snapPlayMode: !state.ui.snapPlayMode } })),
  toggleSnapMatrixGrid: () => set((state) => ({ ui: { ...state.ui, snapMatrixGrid: !state.ui.snapMatrixGrid } })),
  setAxisMatrixDivisions: (val) => set((state) => ({ ui: { ...state.ui, axisMatrixDivisions: val } })),
  setAxisMatrixPadding: (val) => set((state) => ({ ui: { ...state.ui, axisMatrixPadding: val } })),
  setInterpolationExponent: (val) => set((state) => ({ ui: { ...state.ui, interpolationExponent: val } })),
  setInterpolationStrategy: (val) => set((state) => ({ ui: { ...state.ui, interpolationStrategy: val } })),
  
  togglePlayModePhysics: () => set((state) => ({ ui: { ...state.ui, playModePhysics: !state.ui.playModePhysics } })),
  setSpringStiffness: (val) => set((state) => ({ ui: { ...state.ui, springStiffness: val } })),
  setSpringDamping: (val) => set((state) => ({ ui: { ...state.ui, springDamping: val } })),

  setGridSize: (size) => set((state) => ({ ui: { ...state.ui, gridSize: size } })),
  toggleSmoothing: () => set((state) => ({ ui: { ...state.ui, smoothingEnabled: !state.ui.smoothingEnabled } })),
  
  toggleOnionSkin: () => set((state) => ({ ui: { ...state.ui, onionSkinEnabled: !state.ui.onionSkinEnabled } })),
  setOnionSkinOpacity: (opacity) => set((state) => ({ ui: { ...state.ui, onionSkinOpacity: opacity } })),
  setInactiveLayerOpacity: (opacity) => set((state) => ({ ui: { ...state.ui, inactiveLayerOpacity: opacity } })),
  setGhostStrokeOpacity: (opacity) => set((state) => ({ ui: { ...state.ui, ghostStrokeOpacity: opacity } })),

  setResolutionScale: (scale) => set((state) => ({ ui: { ...state.ui, resolutionScale: scale } })),
  togglePerformanceMode: () => set((state) => ({ ui: { ...state.ui, performanceMode: !state.ui.performanceMode } })),
  
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
    if (matchingKfId) {
        hydratedProps = getHydratedUIProps(state.project, state.ui.selectedLayerId, matchingKfId, state.ui.selectedStrokeId);
    }

    return { 
      project: { ...state.project, axes: newAxes },
      ui: { ...state.ui, selectedKeyframeId: matchingKfId, ...hydratedProps }
    };
  }),

  updateMultipleAxisValues: (values) => set((state) => {
    const newAxes = state.project.axes.map(a => 
       values[a.id] !== undefined ? { ...a, currentValue: Math.max(0, Math.min(1, values[a.id])) } : a
    );
    return {
        project: { ...state.project, axes: newAxes }
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
    const hydratedProps = getHydratedUIProps(state.project, layerId, state.ui.selectedKeyframeId, state.ui.selectedStrokeId);
    return { ui: { ...state.ui, selectedLayerId: layerId, ...hydratedProps } };
  }),
  
  selectKeyframe: (keyframeId) => set((state) => {
    const hydratedProps = getHydratedUIProps(state.project, state.ui.selectedLayerId, keyframeId, state.ui.selectedStrokeId);
    return { ui: { ...state.ui, selectedKeyframeId: keyframeId, ...hydratedProps } };
  }),
  
  selectStroke: (strokeId) => set((state) => {
     const hydratedProps = getHydratedUIProps(state.project, state.ui.selectedLayerId, state.ui.selectedKeyframeId, strokeId);
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
      ui: { ...state.ui, selectedLayerId: newId },
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
    return {
      ui: state.ui.selectedLayerId === layerId ? { ...state.ui, cornerRoundness: roundness } : state.ui,
      project: {
        ...state.project,
        layers: applyToAllStates ? state.project.layers.map(l => 
          l.id === layerId ? { ...l, baseStyle: { ...l.baseStyle, cornerRoundness: roundness } as StyleProps } : l
        ) : state.project.layers,
        keyframes: state.project.keyframes.map(kf => {
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
        })
      }
    };
  }),

  setStrokeCornerRoundness: (strokeId, roundness) => set((state) => {
    const currentKeyframeId = state.ui.selectedKeyframeId;
    return {
      ui: { ...state.ui, cornerRoundness: roundness },
      project: {
        ...state.project,
        keyframes: state.project.keyframes.map(kf => 
          kf.id === currentKeyframeId ? {
            ...kf,
            layerStates: kf.layerStates.map(ls => ({
              ...ls,
              strokes: ls.strokes.map(s => 
                s.id === strokeId ? { ...s, style: { ...s.style, cornerRoundness: roundness } } : s
              )
            }))
          } : kf
        )
      }
    };
  }),

  addStrokeToCurrentKeyframe: (rawPoints, closed = false, skipSimplify = false) => set((state) => {
    const { selectedLayerId, brushColor, fillColor, brushSize, smoothingEnabled, snapToGrid } = state.ui;
    if (!selectedLayerId) return state;

    const layer = state.project.layers.find(l => l.id === selectedLayerId);
    if (layer?.locked || !layer?.visible) return state;

    const baseStyle = layer.baseStyle || { strokeColor: '#000000', strokeWidth: 4, fillColor: 'none', lineStyle: 'solid', cornerRoundness: 0 };
    const styleOverride: Partial<StyleProps> = {};
    if (brushColor !== baseStyle.strokeColor) styleOverride.strokeColor = brushColor as string;
    if (fillColor !== baseStyle.fillColor) styleOverride.fillColor = fillColor;
    if (brushSize !== baseStyle.strokeWidth) styleOverride.strokeWidth = brushSize;
    if (state.ui.cornerRoundness !== (baseStyle.cornerRoundness || 0)) styleOverride.cornerRoundness = state.ui.cornerRoundness;

    let points = rawPoints;
    let shouldUpdateLayerMode = false;

    // --- GRID OPTIMIZATION ---
    if (snapToGrid && state.ui.selectedTool !== 'polyline') {
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
       const preSimplified = simplifyPoints(rawPoints, 1.5);
       points = chaikinSmooth(preSimplified, 2);
    } else if (!skipSimplify && !smoothingEnabled) {
       points = simplifyPoints(rawPoints, 1.5);
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

    const past = [...state.history.past, state.project].slice(-MAX_HISTORY);
    
    let updatedLayers = [...state.project.layers];
    if (shouldUpdateLayerMode) {
        updatedLayers = updatedLayers.map(l => 
            l.id === selectedLayerId ? { ...l, interpolationMode: 'points' } : l
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

    const newStroke: Stroke = {
      id: `stroke-${selectedLayerId}-unique`,
      points,
      closed: false,
      style: Object.keys(styleOverride).length > 0 ? styleOverride : undefined
    };

    const newKeyframes = keyframes.map(kf => {
      if (kf.id === targetKeyframeId) {
        const existingLayerStateIndex = kf.layerStates.findIndex(ls => ls.layerId === selectedLayerId);
        let newLayerStates = [...kf.layerStates];
        
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

    return { 
      project: { ...state.project, keyframes: newKeyframes, layers: updatedLayers },
      // AUTO-SELECT THE NEWLY CREATED STROKE to enable "Direct Select" workflow
      ui: { ...state.ui, selectedKeyframeId: targetKeyframeId, selectedStrokeId: newStroke.id },
      history: { past, future: [] }
    };
  }),

  updateStrokeInCurrentKeyframe: (strokeId, newPoints) => set((state) => {
    const kfId = state.ui.selectedKeyframeId;
    if (!kfId) return state;

    const keyframes = state.project.keyframes.map(kf => {
      if (kf.id === kfId) {
         const newLayerStates = kf.layerStates.map(ls => {
            if (ls.layerId === state.ui.selectedLayerId) {
               return {
                  ...ls,
                  strokes: ls.strokes.map(s => ({ ...s, points: newPoints }))
               };
            }
            return ls;
         });
         return { ...kf, layerStates: newLayerStates };
      }
      return kf;
    });

    return { project: { ...state.project, keyframes }};
  }),
  
  deleteStroke: (strokeId) => set((state) => {
     const kfId = state.ui.selectedKeyframeId;
     const layerId = state.ui.selectedLayerId;
     if (!kfId || !layerId) return state;

     const past = [...state.history.past, state.project].slice(-MAX_HISTORY);

     const newKeyframes = state.project.keyframes.map(kf => {
         if (kf.id === kfId) {
             const newLayerStates = kf.layerStates.map(ls => {
                 if (ls.layerId === layerId) {
                     return {
                         ...ls,
                         strokes: ls.strokes.filter(s => s.id !== strokeId)
                     };
                 }
                 return ls;
             });
             return { ...kf, layerStates: newLayerStates };
         }
         return kf;
     });

     return {
         project: { ...state.project, keyframes: newKeyframes },
         ui: { ...state.ui, selectedStrokeId: null }, // Clear selection
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

  deleteKeyframe: (keyframeId) => set((state) => {
    if (state.project.keyframes.length <= 1) return state; 
    const past = [...state.history.past, state.project].slice(-MAX_HISTORY);
    const newKeyframes = state.project.keyframes.filter(k => k.id !== keyframeId);
    
    let newSelectedId = state.ui.selectedKeyframeId;
    if (keyframeId === newSelectedId) {
      newSelectedId = newKeyframes[0].id;
    }

    return {
      project: { ...state.project, keyframes: newKeyframes },
      ui: { ...state.ui, selectedKeyframeId: newSelectedId },
      history: { past, future: [] }
    };
  }),

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
  })

}));