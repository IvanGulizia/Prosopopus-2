import React from 'react';
import { Toolbar } from './components/Toolbar';
import { Canvas } from './components/Canvas';
import { LayerPanel, SettingsPanel } from './components/Panels';
import { AxisMap } from './components/AxisMap';
import { useStore } from './store/useStore';

function App() {
  const { closeAllPanels, ui } = useStore();
  
  // IMMERSION: Hide AxisMap in Play Mode, but keep Panels accessible
  const isEditMode = ui.mode === 'edit';

  return (
    <div 
      className="w-screen h-screen overflow-hidden bg-[#EAEAEA] font-sans text-gray-900 selection:bg-blue-200 relative"
      onClick={closeAllPanels} // Global click listener
    >
      <Canvas />
      <Toolbar />
      
      {/* Panels are always available (via toggle) */}
      <LayerPanel />
      <SettingsPanel />
      
      {/* Matrix is strictly for Editing */}
      {isEditMode && <AxisMap />}
      
      {/* Footer / Status Bar */}
      {isEditMode && (
          <div className="fixed bottom-4 right-6 z-40 pointer-events-none">
             <div className="bg-white/80 backdrop-blur rounded-full px-4 py-1 text-xs text-gray-400 border border-gray-100 shadow-sm">
               Prosopopus v2.9 • Pro Vector Engine
             </div>
          </div>
      )}
    </div>
  );
}

export default App;