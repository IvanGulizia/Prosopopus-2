// components/Panels.tsx
import React, { useState, useRef } from 'react';
import { Layers, Settings, Plus, Trash2, Eye, EyeOff, Lock, Unlock, ChevronDown, ChevronUp, X } from 'lucide-react';
import { useStore } from '../store/useStore';
import { BlendMode, InterpolationMode, Theme } from '../types';
import { PALETTE_COLORS } from '../constants';

export const LayerPanel: React.FC = () => {
  const { project, toggleLayerVisibility, toggleLayerLock, setLayerBlendMode, setLayerInterpolationMode, selectLayer, addLayer, deleteLayer, renameLayer, reorderLayers, ui, toggleLayerPanel } = useStore();
  const layers = project.layers;
  const { theme } = ui;

  // Drag and Drop State
  const [draggedLayerIndex, setDraggedLayerIndex] = useState<number | null>(null);
  
  // Inline Editing State
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState<string>("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Toggle Button (Visible when panel is closed)
  if (!ui.isLayerPanelOpen) {
    return (
       <button 
         onClick={(e) => { e.stopPropagation(); toggleLayerPanel(); }}
         className="absolute left-6 top-28 p-3 rounded-2xl shadow-lg border transition-colors pointer-events-auto"
         style={{ backgroundColor: `${theme.bgPanel}EE`, borderColor: theme.border, color: theme.textMain }}
         title="Open Layers"
       >
         <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 17L12 22L22 17"/><path d="M2 12L12 17L22 12"/><path d="M12 2L2 7L12 12L22 7L12 2Z"/></svg>
       </button>
    );
  }

  const handleRenameStart = (id: string, currentName: string) => {
    setEditingLayerId(id);
    setEditingLayerName(currentName);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const handleRenameSubmit = () => {
    if (editingLayerId && editingLayerName.trim()) {
      renameLayer(editingLayerId, editingLayerName.trim());
    }
    setEditingLayerId(null);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleRenameSubmit();
    } else if (e.key === 'Escape') {
      setEditingLayerId(null);
    }
  };

  const onDragStart = (e: React.DragEvent, index: number) => {
      setDraggedLayerIndex(index);
      e.dataTransfer.effectAllowed = "move";
  };

  const onDragOver = (e: React.DragEvent, index: number) => {
      e.preventDefault(); 
      e.dataTransfer.dropEffect = "move";
  };

  const onDrop = (e: React.DragEvent, targetIndex: number) => {
      e.preventDefault();
      if (draggedLayerIndex === null) return;
      
      const realDragIndex = layers.length - 1 - draggedLayerIndex;
      const realTargetIndex = layers.length - 1 - targetIndex;

      reorderLayers(realDragIndex, realTargetIndex);
      setDraggedLayerIndex(null);
  };

  const getNextInterpolationMode = (current: InterpolationMode): InterpolationMode => {
      if (current === 'resample') return 'points';
      if (current === 'points') return 'spline';
      return 'resample';
  };

  const getInterpolationLabel = (mode: InterpolationMode) => {
      if (mode === 'resample') return 'CRV';
      if (mode === 'points') return 'PNT';
      if (mode === 'spline') return 'SPL';
      return 'UNK';
  };

  return (
    <div 
      onClick={(e) => e.stopPropagation()}
      className="absolute left-6 top-28 w-72 backdrop-blur-xl rounded-3xl shadow-2xl border overflow-hidden flex flex-col max-h-[60vh] pointer-events-auto transition-all duration-300"
      style={{ backgroundColor: `${theme.bgPanel}EE`, borderColor: theme.border, color: theme.textMain }}
    >
      <div className="p-5 border-b flex justify-between items-center" style={{ borderColor: theme.border, backgroundColor: `${theme.bgPanel}55` }}>
        <div>
            <h2 className="font-bold text-base">Layers</h2>
            <p className="text-[10px] font-medium" style={{ color: theme.textMuted }}>{layers.length} Active</p>
        </div>
        <div className="flex gap-2">
            <button 
              onClick={addLayer}
              className="rounded-full p-1.5 transition-colors shadow-sm"
              style={{ backgroundColor: theme.accent, color: '#FFFFFF' }}
              title="Add New Layer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
            </button>
            <button 
              onClick={toggleLayerPanel} 
              className="rounded-full p-1.5 transition-colors"
              style={{ color: theme.textMuted }}
            >
               <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
        </div>
      </div>
      
      <div className="overflow-y-auto flex-1 p-4 space-y-2 custom-scrollbar">
        {[...layers].reverse().map((layer, index) => (
          <div 
            key={layer.id}
            draggable
            onDragStart={(e) => onDragStart(e, index)}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={(e) => onDrop(e, index)}
            onClick={() => selectLayer(layer.id)}
            className={`group flex items-center gap-3 p-3 rounded-2xl text-sm cursor-pointer transition-all border relative ${
              ui.selectedLayerId === layer.id 
                ? 'shadow-sm' 
                : 'shadow-sm'
            } ${draggedLayerIndex === index ? 'opacity-50' : ''}`}
            style={{ 
              backgroundColor: ui.selectedLayerId === layer.id ? theme.activeBg : 'transparent',
              borderColor: ui.selectedLayerId === layer.id ? theme.accent : 'transparent',
              color: ui.selectedLayerId === layer.id ? theme.textMain : theme.textMuted
            }}
          >
            {/* Grip */}
            <div className="cursor-grab text-gray-300 hover:text-gray-400 flex flex-col gap-[2px]">
                <div className="flex gap-[2px]">
                    <div className="w-1 h-1 rounded-full bg-current"/>
                    <div className="w-1 h-1 rounded-full bg-current"/>
                </div>
                <div className="flex gap-[2px]">
                    <div className="w-1 h-1 rounded-full bg-current"/>
                    <div className="w-1 h-1 rounded-full bg-current"/>
                </div>
            </div>

            {/* Visibility */}
            <button 
              onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(layer.id); }}
              className={`w-6 h-6 flex items-center justify-center rounded-md hover:bg-black/5 transition-colors ${layer.visible ? 'text-gray-700' : 'text-gray-300'}`}
            >
              {layer.visible 
                ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              }
            </button>

            {/* Name */}
            {editingLayerId === layer.id ? (
               <input
                 ref={renameInputRef}
                 type="text"
                 value={editingLayerName}
                 onChange={(e) => setEditingLayerName(e.target.value)}
                 onBlur={handleRenameSubmit}
                 onKeyDown={handleRenameKeyDown}
                 className="flex-1 font-semibold text-[13px] bg-white border border-blue-300 rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-blue-500/50"
                 onClick={(e) => e.stopPropagation()}
               />
            ) : (
               <span 
                 className="truncate flex-1 font-semibold select-none text-[13px]"
                 onDoubleClick={() => handleRenameStart(layer.id, layer.name)}
               >
                 {layer.name}
               </span>
            )}
            
            {/* Quick Actions */}
            <div className="flex gap-1.5 items-center">
                 {/* Interpolation Mode Toggle */}
                 <button 
                    onClick={(e) => { 
                       e.stopPropagation(); 
                       setLayerInterpolationMode(layer.id, getNextInterpolationMode(layer.interpolationMode)); 
                    }}
                    className={`h-5 px-1.5 rounded text-[9px] font-black uppercase tracking-wider transition-all border ${
                        layer.interpolationMode === 'resample' 
                        ? 'text-blue-500 bg-blue-50 border-blue-100' 
                        : (layer.interpolationMode === 'points' 
                            ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                            : 'text-amber-600 bg-amber-50 border-amber-100') // SPLINE
                        }`}
                    title={`Mode: ${layer.interpolationMode}`}
                 >
                    {getInterpolationLabel(layer.interpolationMode)}
                 </button>

                 <button
                   onClick={(e) => {
                     e.stopPropagation();
                     const modes: BlendMode[] = ['normal', 'multiply', 'screen', 'difference', 'exclusion'];
                     const nextMode = modes[(modes.indexOf(layer.blendMode) + 1) % modes.length];
                     setLayerBlendMode(layer.id, nextMode);
                   }}
                   className={`h-5 px-1.5 rounded text-[9px] font-bold uppercase border min-w-[32px] ${
                     layer.blendMode !== 'normal' 
                        ? 'bg-purple-50 text-purple-600 border-purple-100' 
                        : 'bg-gray-50 text-gray-400 border-gray-100'
                   }`}
                   title={`Blend: ${layer.blendMode}`}
                 >
                  {layer.blendMode.substring(0, 3)}
                </button>
                
                <button
                    onClick={(e) => { e.stopPropagation(); deleteLayer(layer.id); }}
                    className="text-red-400 hover:text-red-600 hover:bg-red-50 p-1 rounded-md opacity-0 group-hover:opacity-100 transition-all"
                    title="Delete Layer"
                 >
                   <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                 </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// HELPER: Section Component
const SettingsSection = ({ title, children, isOpen, onToggle, theme }: { title: string, children: React.ReactNode, isOpen: boolean, onToggle: () => void, theme: Theme }) => (
    <div className="rounded-2xl shadow-sm border overflow-hidden mt-4 first:mt-0" style={{ backgroundColor: theme.bgPanel, borderColor: theme.border }}>
        <button 
            onClick={onToggle}
            className="w-full text-left p-4 flex justify-between items-center transition-colors"
            style={{ backgroundColor: isOpen ? `${theme.activeBg}44` : 'transparent' }}
        >
            <div>
                <h4 className="text-xs font-bold uppercase tracking-widest" style={{ color: theme.textMain }}>{title}</h4>
            </div>
            <ChevronDown 
                className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} 
                style={{ color: theme.textMuted }}
            />
        </button>
        <div className={`transition-all duration-300 ease-in-out ${isOpen ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
            <div className="p-4 space-y-4 border-t" style={{ borderColor: theme.border }}>
                {children}
            </div>
        </div>
    </div>
  );

// HELPER: Row Component with clearer spacing
const SettingsRow = ({ label, value, children }: { label: string, value?: string, children: React.ReactNode }) => (
    <div className="space-y-2">
        <div className="flex justify-between items-baseline">
            <span className="text-xs font-medium text-gray-600">{label}</span>
            {value && <span className="text-[10px] font-mono text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{value}</span>}
        </div>
        {children}
    </div>
);

// HELPER: Toggle Component
const SettingsToggle = ({ label, active, onClick }: { label: string, active: boolean, onClick: () => void }) => (
    <div 
        className="flex items-center justify-between py-1 cursor-pointer group" 
        onClick={onClick}
    >
        <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900 transition-colors">{label}</span>
        <div className={`w-10 h-6 rounded-full relative transition-colors duration-200 border ${active ? 'bg-blue-500 border-blue-500' : 'bg-gray-100 border-gray-200'}`}>
            <div className={`w-4 h-4 bg-white rounded-full absolute top-[3px] shadow-sm transition-transform duration-200 ${active ? 'translate-x-5' : 'translate-x-1'}`} />
        </div>
    </div>
);

export const SettingsPanel: React.FC = () => {
  const { 
      project, toggleSettings, ui, 
      toggleGrid, toggleSnapToGrid, setSnapScale, toggleOnionSkin, 
      setOnionSkinOpacity, toggleSmoothing, 
      resetProject, loadProject, toggleSnapMatrixGrid, 
      setAxisMatrixDivisions, setAxisMatrixPadding, 
      setGhostStrokeOpacity, setInterpolationExponent, 
      setInterpolationStrategy, setGridSize,
      setResolutionScale, togglePerformanceMode,
      togglePlayModePhysics, setSpringStiffness, setSpringDamping,
      setLayerCornerRoundness, setStrokeCap,
      updateLayerStrokeColor, updateLayerFillColor, updateLayerStrokeWidth,
      updateCanvasSize
  } = useStore();
  
  const { theme, isSettingsOpen } = ui;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [openSections, setOpenSections] = useState<string[]>(['layer-styles']);
  const [applyToAllStates, setApplyToAllStates] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [exportFileName, setExportFileName] = useState(project.name);

  const toggleSection = (section: string) => {
      setOpenSections(prev => 
          prev.includes(section) ? prev.filter(s => s !== section) : [...prev, section]
      );
  };

  if (!isSettingsOpen) return null;

  const currentLayer = project.layers.find(l => l.id === ui.selectedLayerId);
  const currentKeyframe = project.keyframes.find(k => k.id === ui.selectedKeyframeId);
  const layerState = currentKeyframe?.layerStates.find(ls => ls.layerId === ui.selectedLayerId);
  const currentStroke = ui.selectedStrokeId ? layerState?.strokes.find(s => s.id === ui.selectedStrokeId) : undefined;
  
  const currentCornerRoundness = ui.cornerRoundness;

  const handleReset = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      resetProject();
  };

  const handleExport = () => {
      // Include relevant UI settings in the export
      const projectWithSettings = {
          ...project,
          name: exportFileName,
          settings: {
              theme: ui.theme,
              showGrid: ui.showGrid,
              gridSize: ui.gridSize,
              snapToGrid: ui.snapToGrid,
              snapScale: ui.snapScale,
              onionSkinEnabled: ui.onionSkinEnabled,
              onionSkinOpacity: ui.onionSkinOpacity,
              inactiveLayerOpacity: ui.inactiveLayerOpacity,
              ghostStrokeOpacity: ui.ghostStrokeOpacity,
              smoothingEnabled: ui.smoothingEnabled,
              resolutionScale: ui.resolutionScale,
              performanceMode: ui.performanceMode,
              snapPlayMode: ui.snapPlayMode,
              snapMatrixGrid: ui.snapMatrixGrid,
              axisMatrixDivisions: ui.axisMatrixDivisions,
              axisMatrixPadding: ui.axisMatrixPadding,
              interpolationExponent: ui.interpolationExponent,
              interpolationStrategy: ui.interpolationStrategy,
              playModePhysics: ui.playModePhysics,
              springStiffness: ui.springStiffness,
              springDamping: ui.springDamping,
              strokeCap: ui.strokeCap,
              brushSize: ui.brushSize,
              brushColor: ui.brushColor,
              fillColor: ui.fillColor,
              cornerRoundness: ui.cornerRoundness
          }
      };
      const data = JSON.stringify(projectWithSettings, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportFileName.replace(/\s+/g, '_').toLowerCase()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setIsExporting(false);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
              try {
                  const json = JSON.parse(event.target?.result as string);
                  loadProject(json);
              } catch (err) {
                  alert("Invalid project file.");
              }
          };
          reader.readAsText(file);
      }
  };

  return (
    <div 
      onClick={(e) => e.stopPropagation()}
      className="absolute top-28 right-6 w-96 backdrop-blur-2xl rounded-3xl shadow-2xl border z-50 flex flex-col max-h-[75vh] pointer-events-auto overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300"
      style={{ backgroundColor: `${theme.bgPanel}EE`, borderColor: theme.border, color: theme.textMain }}
    >
      {/* Header */}
      <div className="flex justify-between items-center p-6 border-b sticky top-0 z-10" style={{ borderColor: theme.border, backgroundColor: `${theme.bgPanel}CC` }}>
        <div>
            <h3 className="font-bold text-lg">Settings</h3>
            <p className="text-xs mt-0.5" style={{ color: theme.textMuted }}>Global configuration</p>
        </div>
        <button 
          onClick={toggleSettings}
          className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
          style={{ backgroundColor: theme.activeBg, color: theme.textMain }}
        >
          <X size={18} />
        </button>
      </div>

      <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
        
        {/* SECTION: LAYER GLOBAL STYLES */}
        <SettingsSection 
            title="Layer Global Styles" 
            isOpen={openSections.includes('layer-styles')}
            onToggle={() => toggleSection('layer-styles')}
            theme={theme}
        >
             <div className="space-y-3">
                 <SettingsRow label="Stroke Color">
                     <div className="grid grid-cols-8 gap-1.5 w-full">
                         {PALETTE_COLORS.map(c => (
                             <button 
                                 key={c} 
                                 onClick={() => ui.selectedLayerId && updateLayerStrokeColor(ui.selectedLayerId, c)}
                                 className="w-6 h-6 rounded-full border relative group overflow-hidden transition-transform hover:scale-110"
                                 style={{ 
                                   backgroundColor: c === 'none' ? '#FFFFFF' : c,
                                   borderColor: theme.border,
                                   boxShadow: (currentLayer?.baseStyle?.strokeColor || 'none') === c ? `0 0 0 2px ${theme.accent}` : 'none'
                                 }}
                             >
                               {c === 'none' && <div className="absolute inset-0 flex items-center justify-center"><div className="w-full h-0.5 bg-red-500 rotate-45 transform"></div></div>}
                             </button>
                         ))}
                     </div>
                 </SettingsRow>
                 <SettingsRow label="Fill Color">
                     <div className="grid grid-cols-8 gap-1.5 w-full">
                         {PALETTE_COLORS.map(c => (
                             <button 
                                 key={c} 
                                 onClick={() => ui.selectedLayerId && updateLayerFillColor(ui.selectedLayerId, c)}
                                 className="w-6 h-6 rounded-full border relative group overflow-hidden transition-transform hover:scale-110"
                                 style={{ 
                                   backgroundColor: c === 'none' ? '#FFFFFF' : c,
                                   borderColor: theme.border,
                                   boxShadow: (currentLayer?.baseStyle?.fillColor || 'none') === c ? `0 0 0 2px ${theme.accent}` : 'none'
                                 }}
                             >
                               {c === 'none' && <div className="absolute inset-0 flex items-center justify-center"><div className="w-full h-0.5 bg-red-500 rotate-45 transform"></div></div>}
                             </button>
                         ))}
                     </div>
                 </SettingsRow>
                 <SettingsRow label="Stroke Width" value={`${ui.brushSize}px`}>
                     <input 
                         type="range" 
                         min="1" max="50" 
                         value={ui.brushSize}
                         onChange={(e) => ui.selectedLayerId && updateLayerStrokeWidth(ui.selectedLayerId, parseInt(e.target.value))} 
                         className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
                     />
                 </SettingsRow>
             </div>
        </SettingsSection>

        {/* SECTION: DATA (MOVED TOP) */}
        <SettingsSection 
            title="Project & Data"
            isOpen={openSections.includes('project-data')}
            onToggle={() => toggleSection('project-data')}
            theme={theme}
        >
             <div className="grid grid-cols-2 gap-3 mb-4">
                 <button onClick={() => setIsExporting(true)} className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Export JSON
                 </button>
                 <button onClick={() => fileInputRef.current?.click()} className="bg-white hover:bg-gray-50 border border-gray-200 text-gray-700 text-xs font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    Import JSON
                 </button>
                 <input type="file" ref={fileInputRef} onChange={handleImport} className="hidden" accept=".json" />
             </div>

             <div className="border-t border-gray-100 pt-4">
                <button 
                    onClick={handleReset}
                    className="w-full bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 text-xs font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2 group"
                >
                    <svg className="group-hover:scale-110 transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Reset
                </button>
             </div>
        </SettingsSection>

        {/* SECTION: CANVAS */}
        <SettingsSection 
            title="Canvas & Guides" 
            isOpen={openSections.includes('canvas-guides')}
            onToggle={() => toggleSection('canvas-guides')}
            theme={theme}
        >
            <div className="space-y-4 mb-4">
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 space-y-3">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider block">Dimensions</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => updateCanvasSize(600, 600)} className={`py-1.5 text-xs font-medium rounded-lg border ${project.canvasSize.width === 600 && project.canvasSize.height === 600 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>1:1 Square</button>
                        <button onClick={() => updateCanvasSize(1280, 720)} className={`py-1.5 text-xs font-medium rounded-lg border ${project.canvasSize.width === 1280 && project.canvasSize.height === 720 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>16:9 Video</button>
                        <button onClick={() => updateCanvasSize(800, 600)} className={`py-1.5 text-xs font-medium rounded-lg border ${project.canvasSize.width === 800 && project.canvasSize.height === 600 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>4:3 Classic</button>
                        <button onClick={() => updateCanvasSize(720, 1280)} className={`py-1.5 text-xs font-medium rounded-lg border ${project.canvasSize.width === 720 && project.canvasSize.height === 1280 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>9:16 Vertical</button>
                    </div>
                    <div className="flex gap-2 items-center mt-2">
                        <input type="number" value={project.canvasSize.width} onChange={(e) => updateCanvasSize(parseInt(e.target.value) || 600, project.canvasSize.height)} className="w-full bg-white border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-700" placeholder="Width" />
                        <span className="text-gray-400 text-xs">x</span>
                        <input type="number" value={project.canvasSize.height} onChange={(e) => updateCanvasSize(project.canvasSize.width, parseInt(e.target.value) || 600)} className="w-full bg-white border border-gray-200 rounded-md px-2 py-1 text-xs text-gray-700" placeholder="Height" />
                    </div>
                </div>
            </div>

            <div className="bg-gray-50 rounded-xl p-3 space-y-3 border border-gray-100">
                <SettingsToggle label="Show Grid" active={ui.showGrid} onClick={toggleGrid} />
                
                <div className="pt-2 border-t border-gray-200/50">
                     <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">Snap to Grid</span>
                        <SettingsToggle label="" active={ui.snapToGrid} onClick={toggleSnapToGrid} />
                     </div>
                     
                     <div className={`transition-all duration-300 overflow-hidden ${ui.showGrid || ui.snapToGrid ? 'max-h-40 opacity-100' : 'max-h-0 opacity-50'}`}>
                        <SettingsRow label="Grid Size" value={`${ui.gridSize}px`}>
                            <input type="range" min="10" max="100" step="10" value={ui.gridSize} onChange={(e) => setGridSize(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-600"/>
                        </SettingsRow>
                        
                        {ui.snapToGrid && (
                            <div className="mt-3">
                                <SettingsRow label="Snap Multiplier" value={`x${ui.snapScale}`}>
                                    <input type="range" min="0.5" max="4" step="0.5" value={ui.snapScale} onChange={(e) => setSnapScale(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-600"/>
                                </SettingsRow>
                            </div>
                        )}
                     </div>
                </div>
            </div>

            <div className="space-y-3 pt-2">
                 {/* CORNER ROUNDNESS CONTROL */}
                 <div className="space-y-2">
                     <SettingsRow label="Corner Rounding" value={`${currentCornerRoundness}%`}>
                         <input type="range" min="0" max="100" step="5" value={currentCornerRoundness} onChange={(e) => {
                             if (ui.selectedLayerId) {
                                 const val = parseInt(e.target.value);
                                 if (applyToAllStates) {
                                     setLayerCornerRoundness(ui.selectedLayerId, val, true);
                                 } else if (currentStroke) {
                                     useStore.getState().setStrokeCornerRoundness(currentStroke.id, val);
                                 } else {
                                     setLayerCornerRoundness(ui.selectedLayerId, val, false);
                                 }
                             }
                         }} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-teal-500 hover:accent-teal-600"/>
                     </SettingsRow>
                     <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                         <input 
                             type="checkbox" 
                             checked={applyToAllStates} 
                             onChange={(e) => setApplyToAllStates(e.target.checked)}
                             className="rounded text-blue-500 focus:ring-blue-500"
                         />
                         Apply to all states in layer
                     </label>
                 </div>

                 {/* STROKE CAP CONTROL */}
                 <div>
                     <label className="text-xs font-medium text-gray-600 mb-2 block">Stroke Cap</label>
                     <div className="flex bg-gray-100/80 rounded-xl p-1.5 gap-1">
                         <button onClick={() => setStrokeCap('round')} className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${ui.strokeCap === 'round' ? 'bg-white shadow text-blue-600 ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}>
                             Round
                         </button>
                         <button onClick={() => setStrokeCap('butt')} className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${ui.strokeCap === 'butt' ? 'bg-white shadow text-blue-600 ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}>
                             Butt
                         </button>
                         <button onClick={() => setStrokeCap('square')} className={`flex-1 py-1.5 text-[11px] font-bold rounded-lg transition-all ${ui.strokeCap === 'square' ? 'bg-white shadow text-blue-600 ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}>
                             Square
                         </button>
                     </div>
                 </div>

                 <SettingsToggle label="Enable Smoothing" active={ui.smoothingEnabled} onClick={toggleSmoothing} />
                 
                 <SettingsRow label="Ghost Opacity" value={`${Math.round(ui.ghostStrokeOpacity * 100)}%`}>
                     <input type="range" min="0" max="1" step="0.05" value={ui.ghostStrokeOpacity} onChange={(e) => setGhostStrokeOpacity(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-600"/>
                 </SettingsRow>
            </div>

             <div className="bg-orange-50/50 rounded-xl p-3 border border-orange-100 space-y-2">
                 <SettingsToggle label="Onion Skin" active={ui.onionSkinEnabled} onClick={toggleOnionSkin} />
                 {ui.onionSkinEnabled && (
                    <SettingsRow label="Opacity" value={`${Math.round(ui.onionSkinOpacity * 100)}%`}>
                         <input type="range" min="0.05" max="0.5" step="0.05" value={ui.onionSkinOpacity} onChange={(e) => setOnionSkinOpacity(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500 hover:accent-orange-600"/>
                    </SettingsRow>
                 )}
             </div>
        </SettingsSection>

        {/* SECTION: INTERPOLATION */}
        <SettingsSection 
            title="Interpolation Engine" 
            isOpen={openSections.includes('interpolation')}
            onToggle={() => toggleSection('interpolation')}
            theme={theme}
        >
             <SettingsToggle label="Snap Matrix Keyframes" active={ui.snapMatrixGrid} onClick={toggleSnapMatrixGrid} />
             
             <div className="grid grid-cols-2 gap-4">
                 <SettingsRow label="Grid Divisions" value={`${ui.axisMatrixDivisions}x`}>
                    <input type="range" min="2" max="20" step="1" value={ui.axisMatrixDivisions} onChange={(e) => setAxisMatrixDivisions(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                 </SettingsRow>

                 <SettingsRow label="Padding" value={`${Math.round(ui.axisMatrixPadding * 100)}%`}>
                    <input type="range" min="0" max="0.2" step="0.01" value={ui.axisMatrixPadding} onChange={(e) => setAxisMatrixPadding(parseFloat(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"/>
                 </SettingsRow>
             </div>

             <div className="pt-2">
                 <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Behavior</label>
                 
                 <div className="bg-blue-50/50 rounded-xl p-3 border border-blue-100 space-y-3 mb-4">
                     <SettingsToggle label="Play Mode Physics" active={ui.playModePhysics} onClick={togglePlayModePhysics} />
                     {ui.playModePhysics && (
                        <>
                            <SettingsRow label="Stiffness (Tension)" value={`${ui.springStiffness}`}>
                                <input type="range" min="10" max="300" step="10" value={ui.springStiffness} onChange={(e) => setSpringStiffness(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-600"/>
                            </SettingsRow>
                            <SettingsRow label="Damping (Friction)" value={`${ui.springDamping}`}>
                                <input type="range" min="1" max="50" step="1" value={ui.springDamping} onChange={(e) => setSpringDamping(parseInt(e.target.value))} className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:accent-blue-600"/>
                            </SettingsRow>
                        </>
                     )}
                 </div>

                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">Algorithm</label>
                <div className="flex bg-gray-100/80 rounded-xl p-1.5 gap-1">
                    <button onClick={() => setInterpolationStrategy('bilinear-grid')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${ui.interpolationStrategy === 'bilinear-grid' ? 'bg-white shadow text-blue-600 ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}>
                        Bilinear Grid
                    </button>
                    <button onClick={() => setInterpolationStrategy('idw')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${ui.interpolationStrategy === 'idw' ? 'bg-white shadow text-blue-600 ring-1 ring-black/5' : 'text-gray-500 hover:text-gray-700'}`}>
                        Radial (IDW)
                    </button>
                </div>
             </div>
        </SettingsSection>

        {/* SECTION: PERFORMANCE (MOVED BOTTOM) */}
        <SettingsSection 
            title="Performance" 
            isOpen={openSections.includes('performance')}
            onToggle={() => toggleSection('performance')}
            theme={theme}
        >
             <SettingsToggle label="Performance Mode (Low Poly)" active={ui.performanceMode} onClick={togglePerformanceMode} />
             
             <SettingsRow label="Resolution Scale" value={`${ui.resolutionScale.toFixed(1)}x`}>
                 <div className="flex items-center gap-3">
                    <span className="text-[10px] text-gray-400">Perf</span>
                    <input 
                        type="range" 
                        min="0.5" 
                        max="3.0" 
                        step="0.1" 
                        value={ui.resolutionScale} 
                        onChange={(e) => setResolutionScale(parseFloat(e.target.value))} 
                        className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-purple-600"
                    />
                    <span className="text-[10px] text-gray-400">Quality</span>
                 </div>
             </SettingsRow>
        </SettingsSection>

      </div>
    </div>
  );
};