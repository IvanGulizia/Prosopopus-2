sed -i 's/const rRadii = resolvedStyle.cornerRadii;/const rRadii = s.shapeConfig?.cornerRadii || resolvedStyle.cornerRadii;/g' components/Canvas.tsx
