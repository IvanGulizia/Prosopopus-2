sed -i 's/currentLayer?.baseStyle?.strokeColor/ui.strokeColor ?? currentLayer?.baseStyle?.strokeColor/g' components/Panels.tsx
sed -i 's/currentLayer?.baseStyle?.fillColor/ui.fillColor ?? currentLayer?.baseStyle?.fillColor/g' components/Panels.tsx
