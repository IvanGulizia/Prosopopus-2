sed -i '/if (isTimelineMode \&\& updatedAnimations \&\& updatedAnimations.length > 0) {/a \
      if (layerId) {\n        updatedLayers = updatedLayers.map(l => l.id === layerId && l.driverMode !== '"'"'timeline'"'"' ? { ...l, driverMode: '"'"'timeline'"'"' as LayerDriverMode } : l);\n      }' store/useStore.ts
