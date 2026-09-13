import re

with open('components/Panels.tsx', 'r') as f:
    content = f.read()

# Add targetId computation inside isComp condition
regex1 = re.compile(r'let compStrokes: \{ id: string; name: string; visible: boolean; inCurrentState: boolean; strokeRef: Stroke \}\[\] = \[\];\s*if \(isComp\) \{\s*const currentKf = project\.keyframes\.find\(k => k\.id === ui\.selectedKeyframeId\) \|\| project\.keyframes\[0\];\s*const currentLayerState = currentKf\?\.layerStates\.find\(ls => ls\.layerId === layer\.id\);')

replacement1 = """let compStrokes: { id: string; name: string; visible: boolean; inCurrentState: boolean; strokeRef: Stroke }[] = [];
            let activeTargetId: string | null = null;
            if (isComp) {
              const currentKf = project.keyframes.find(k => k.id === ui.selectedKeyframeId) || project.keyframes[0];
              const currentLayerState = currentKf?.layerStates.find(ls => ls.layerId === layer.id);"""

content = content.replace(regex1.search(content).group(0), replacement1)

# At the end of isComp block, compute activeTargetId
regex2 = re.compile(r'strokeRef: s \|\| canonicalStroke // use the current state stroke if available, otherwise the canonical one for reference\s*\};\s*\}\);\s*\}')

replacement2 = """strokeRef: s || canonicalStroke // use the current state stroke if available, otherwise the canonical one for reference
                  };
              });

              if (layer.id === ui.selectedLayerId) {
                  let defaultFreehandTargetId = null;
                  let defaultShapeTargetId = null;
                  let defaultEllipseTargetId = null;
                  let defaultPolygonTargetId = null;
                  
                  // Find first free slot for each tool
                  compStrokes.forEach(s => {
                      if (!s.inCurrentState) {
                         const sc = s.strokeRef.shapeConfig;
                         if (!sc && !defaultFreehandTargetId) defaultFreehandTargetId = s.id;
                         if (sc?.type === 'rectangle' && !defaultShapeTargetId) defaultShapeTargetId = s.id;
                         if (sc?.type === 'ellipse' && !defaultEllipseTargetId) defaultEllipseTargetId = s.id;
                         if (sc?.type === 'polygon' && !defaultPolygonTargetId) defaultPolygonTargetId = s.id;
                      }
                  });
                  
                  if (ui.selectedStrokeId) {
                      activeTargetId = ui.selectedStrokeId;
                  } else {
                      if (ui.tool === 'freehand') activeTargetId = defaultFreehandTargetId;
                      else if (ui.tool === 'shape' && ui.shapeType === 'rectangle') activeTargetId = defaultShapeTargetId;
                      else if (ui.tool === 'shape' && ui.shapeType === 'ellipse') activeTargetId = defaultEllipseTargetId;
                      else if (ui.tool === 'shape' && ui.shapeType === 'polygon') activeTargetId = defaultPolygonTargetId;
                  }
              }
            }"""

content = content.replace(regex2.search(content).group(0), replacement2)

# Update the stroke rendering to show the indicator
regex3 = re.compile(r'\{/\* State presence indicator \*/\}\s*\{\!stroke\.inCurrentState && \(\s*<span \s*className="text-\[9px\] px-1\.5 py-0\.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium"\s*title="Non encore tracé sur cet état\. Le prochain trait dessiné s\'y attachera, ou cliquez pour le sélectionner explicitement\."\s*>\s*À dessiner\s*</span>\s*\)\}')

replacement3 = """{/* Target Indicator */}
                            {stroke.id === activeTargetId && (
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" title="Cible du prochain tracé" />
                            )}
                            {/* State presence indicator */}
                            {!stroke.inCurrentState && (
                              <span 
                                className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium"
                                title="Non encore tracé sur cet état."
                              >
                                À dessiner
                              </span>
                            )}"""

content = content.replace(regex3.search(content).group(0), replacement3)

with open('components/Panels.tsx', 'w') as f:
    f.write(content)
print("Patched Panels.tsx")
