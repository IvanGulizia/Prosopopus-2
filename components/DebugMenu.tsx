// components/DebugMenu.tsx
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../store/useStore';
import { Theme } from '../types';

export const DebugMenu: React.FC = () => {
  const { ui, setThemeColor, toggleDebugMenu } = useStore();
  const { theme, isDebugMenuOpen } = ui;

  if (!isDebugMenuOpen) return null;

  const themeKeys: (keyof Theme)[] = [
    'bgApp', 'bgToolbar', 'bgPanel', 'accent', 
    'textMain', 'textMuted', 'border', 
    'hoverBg', 'activeBg', 'canvasBg', 'gridColor'
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        onClick={(e) => e.stopPropagation()}
        className="fixed left-6 top-28 w-72 bg-white/95 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white/50 z-[100] flex flex-col max-h-[70vh] overflow-hidden ring-1 ring-black/5"
      >
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-white/50">
          <div>
            <h2 className="font-black text-gray-900 text-sm tracking-tight">Debug Theme</h2>
          </div>
          <button 
            onClick={toggleDebugMenu}
            className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {themeKeys.map((key) => (
            <div key={key} className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">{key}</label>
              </div>
              <div className="flex items-center gap-2">
                <div 
                  className="w-7 h-7 rounded-lg border-2 border-white shadow-sm ring-1 ring-black/5 shrink-0 relative overflow-hidden"
                  style={{ backgroundColor: theme[key] }}
                >
                  <input 
                    type="color" 
                    value={theme[key]}
                    onChange={(e) => setThemeColor(key, e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer scale-150"
                  />
                </div>
                <input 
                  type="text"
                  value={theme[key]}
                  onChange={(e) => setThemeColor(key, e.target.value)}
                  className="flex-1 bg-gray-50 border border-gray-100 rounded-lg px-2 py-1 text-[10px] font-medium text-gray-700 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                />
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 bg-gray-50/50 border-t border-gray-100 space-y-2">
          <button 
            onClick={() => {
              const data = JSON.stringify(theme, null, 2);
              navigator.clipboard.writeText(data);
              alert("Theme JSON copied to clipboard!");
            }}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white text-[10px] font-black py-2 rounded-xl shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
            Copy JSON
          </button>
          <p className="text-[9px] text-gray-400 text-center font-medium leading-relaxed">
            Press <span className="bg-white px-1.5 py-0.5 rounded border border-gray-200 text-gray-600 font-bold shadow-sm">H</span> to toggle this menu.
            <br/>Changes are live and stored in session.
          </p>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
