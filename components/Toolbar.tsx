// components/Toolbar.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import { ToolType } from '../types';
import { APP_COLORS, PALETTE_COLORS } from '../constants';

const Icons = {
  Cursor: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m4 4 7.07 17 2.51-7.39L21 11.07z"/></svg>,
  Select: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="5" y="5" rx="2"/><path d="M2 2v6"/><path d="M2 2h6"/><path d="M22 2v6"/><path d="M22 2h-6"/><path d="M2 22v-6"/><path d="M2 22h6"/><path d="M22 22v-6"/><path d="M22 22h-6"/></svg>,
  Points: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v18"/><path d="M3 12h18"/><circle cx="12" cy="12" r="3"/><circle cx="12" cy="3" r="2"/><circle cx="12" cy="21" r="2"/><circle cx="3" cy="12" r="2"/><circle cx="21" cy="12" r="2"/></svg>,
  Pen: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>,
  // UPDATED ICON: Shows explicit nodes and connections
  PolyIcon: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 7 3 10 8-12"/><circle cx="7" cy="7" r="2"/><circle cx="10" cy="17" r="2"/><circle cx="18" cy="5" r="2"/></svg>,
  Settings: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg>,
  Undo: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>,
  Redo: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>,
  Play: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>,
  Pause: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>,
  NoFill: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="2" y1="22" x2="22" y2="2" /><rect x="2" y="2" width="20" height="20" rx="2" stroke="currentColor" fill="none"/></svg>
};

const STROKE_SIZES = [2, 4, 8, 12, 16];

export const Toolbar: React.FC = () => {
  const { ui, setTool, undo, redo, history, toggleSettings, setMode, setBrushColor, setFillColor, setBrushSize, closeAllPanels, toggleTransformMode } = useStore();
  const [activeColorPicker, setActiveColorPicker] = useState<'stroke' | 'fill' | 'size' | null>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  
  const isPlayMode = ui.mode === 'play';
  const isSettingsOpen = ui.isSettingsOpen;

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setActiveColorPicker(null);
      }
    };
    if (activeColorPicker) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activeColorPicker]);

  const ToolButton = ({ tool, icon: Icon, label, onClick }: { tool: ToolType; icon: any; label: string, onClick?: () => void }) => (
    <button
      onClick={(e) => { 
        e.stopPropagation(); 
        if (onClick) onClick();
        else setTool(tool); 
      }}
      disabled={isPlayMode}
      className={`p-2.5 rounded-full transition-all duration-200 flex items-center justify-center group relative
        ${ui.selectedTool === tool && !isPlayMode
          ? 'bg-blue-500 text-white shadow-lg scale-105' 
          : 'hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed'}`}
    >
      <Icon />
      {!isPlayMode && (
        <span className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
          {label}
        </span>
      )}
    </button>
  );

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-white/90 backdrop-blur-md border border-gray-200/50 shadow-xl rounded-full px-2 py-2 flex items-center gap-2 h-16 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
        
        {/* Play Toggle */}
        <div className="w-[100px] flex justify-center">
            <button 
            onClick={() => setMode(isPlayMode ? 'edit' : 'play')}
            className={`px-4 h-12 rounded-full transition-all duration-200 flex items-center justify-center gap-2 w-full
                ${isPlayMode 
                ? 'bg-green-500 text-white shadow-lg' 
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
            {isPlayMode ? <Icons.Pause /> : <Icons.Play />}
            <span className="text-sm font-bold">{isPlayMode ? "Stop" : "Play"}</span>
            </button>
        </div>

        <div className="w-px h-8 bg-gray-200" />

        {/* Tools */}
        <div className={`flex items-center gap-1 transition-opacity ${isPlayMode ? 'opacity-30 pointer-events-none grayscale' : 'opacity-100'}`}>
          <ToolButton 
            tool="select" 
            icon={ui.transformMode === 'object' ? Icons.Select : Icons.Points} 
            label={ui.transformMode === 'object' ? "Transform" : "Edit Points"} 
            onClick={() => {
                if (ui.selectedTool === 'select') {
                    toggleTransformMode();
                } else {
                    setTool('select');
                }
            }}
          />
          <ToolButton tool="pen" icon={Icons.Pen} label="Pen" />
          <ToolButton tool="polyline" icon={Icons.PolyIcon} label="Polyline" />
          
          <div className="w-px h-6 bg-gray-200 mx-1" />
          
          {/* Properties Group */}
          <div className="flex gap-2 items-center" ref={colorPickerRef}>
              
              {/* Brush Size */}
              <div className="relative">
                <button
                  onClick={() => { setActiveColorPicker(activeColorPicker === 'size' ? null : 'size'); closeAllPanels(); }}
                  className="w-8 h-8 rounded-full border border-gray-200 hover:bg-gray-50 flex items-center justify-center"
                  title="Brush Size"
                >
                  <div className="bg-gray-800 rounded-full" style={{ width: Math.min(16, Math.max(2, ui.brushSize)), height: Math.min(16, Math.max(2, ui.brushSize)) }} />
                </button>
                
                {activeColorPicker === 'size' && (
                  <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-xl border border-gray-200 p-2 flex gap-2 z-50">
                    {STROKE_SIZES.map(size => (
                      <button
                        key={size}
                        onClick={() => { setBrushSize(size); setActiveColorPicker(null); }}
                        className={`w-8 h-8 rounded-full border flex items-center justify-center hover:bg-gray-50 ${ui.brushSize === size ? 'border-blue-500 bg-blue-50' : 'border-gray-100'}`}
                      >
                         <div className="bg-gray-800 rounded-full" style={{ width: size, height: size }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Stroke Color */}
              <div className="relative">
                <button 
                onClick={() => { setActiveColorPicker(activeColorPicker === 'stroke' ? null : 'stroke'); closeAllPanels(); }}
                className="w-8 h-8 rounded-full border-2 border-white shadow-sm relative group overflow-hidden ring-1 ring-gray-200 flex items-center justify-center"
                style={{ backgroundColor: ui.brushColor === 'none' ? 'transparent' : ui.brushColor }}
                title="Stroke Color"
                >
                   {ui.brushColor === 'none' && <div className="absolute inset-0 flex items-center justify-center text-red-500/50"><div className="w-full h-0.5 bg-red-500 rotate-45 transform"></div></div>}
                </button>
              </div>

              {/* Fill Color */}
              <div className="relative">
                <button 
                onClick={() => { setActiveColorPicker(activeColorPicker === 'fill' ? null : 'fill'); closeAllPanels(); }}
                className="w-8 h-8 rounded-full border-2 border-white shadow-sm relative group overflow-hidden ring-1 ring-gray-200 flex items-center justify-center"
                style={{ backgroundColor: ui.fillColor === 'none' ? 'transparent' : ui.fillColor }}
                title="Fill Color"
                >
                    {ui.fillColor === 'none' && <div className="absolute inset-0 flex items-center justify-center text-red-500/50"><div className="w-full h-0.5 bg-red-500 rotate-45 transform"></div></div>}
                </button>
              </div>

              {/* Popover Palette */}
              {(activeColorPicker === 'stroke' || activeColorPicker === 'fill') && (
                <div className="absolute top-14 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-xl border border-gray-200 p-2 grid grid-cols-7 gap-1 w-[210px] z-50">
                   <div className="col-span-7 pb-2 mb-2 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase text-center">
                       Set {activeColorPicker} Color
                   </div>
                   
                   <button
                   className="w-6 h-6 rounded-full border border-gray-200 hover:scale-110 transition-transform flex items-center justify-center text-gray-400"
                   onClick={() => { 
                       if (activeColorPicker === 'stroke') setBrushColor('none');
                       else setFillColor('none');
                       setActiveColorPicker(null); 
                   }}
                   title="No Color"
                   >
                       <Icons.NoFill />
                   </button>

                   {PALETTE_COLORS.map(color => (
                     <button
                       key={color}
                       className="w-6 h-6 rounded-full border border-gray-100 hover:scale-110 transition-transform"
                       style={{ backgroundColor: color }}
                       onClick={() => { 
                           if (activeColorPicker === 'stroke') setBrushColor(color);
                           else setFillColor(color);
                           setActiveColorPicker(null); 
                       }}
                     />
                   ))}
                   
                   <div className="relative w-6 h-6 rounded-full border border-gray-100 overflow-hidden hover:scale-110 transition-transform cursor-pointer shadow-sm group">
                     <div className="absolute inset-0 bg-[conic-gradient(from_90deg,red,orange,yellow,green,blue,purple,red)] opacity-80" />
                     <input 
                        type="color" 
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                        value={activeColorPicker === 'stroke' ? (ui.brushColor === 'none' ? '#000000' : ui.brushColor) : (ui.fillColor === 'none' ? '#ffffff' : ui.fillColor)} 
                        onChange={(e) => {
                            if (activeColorPicker === 'stroke') setBrushColor(e.target.value);
                            else setFillColor(e.target.value);
                        }} 
                     />
                     <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-white font-bold text-[10px] drop-shadow-md">+</div>
                   </div>
                </div>
              )}
          </div>
        </div>

        <div className="w-px h-8 bg-gray-200" />

         {/* Undo/Redo */}
        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={history.past.length === 0} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full disabled:opacity-30">
            <Icons.Undo />
          </button>
          <button onClick={redo} disabled={history.future.length === 0} className="p-2 text-gray-500 hover:bg-gray-100 rounded-full disabled:opacity-30">
            <Icons.Redo />
          </button>
        </div>

        <div className="w-px h-8 bg-gray-200" />

        {/* Settings */}
        <button 
          onClick={(e) => { e.stopPropagation(); toggleSettings(); }}
          className={`p-3 rounded-full transition-colors ${isSettingsOpen ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100'}`}
        >
          <Icons.Settings />
        </button>

      </div>
    </div>
  );
};