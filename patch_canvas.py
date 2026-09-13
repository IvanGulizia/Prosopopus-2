import re

with open('components/Canvas.tsx', 'r') as f:
    content = f.read()

# We need to replace the section starting at `const allowExtrapolation = `
# up to the end of `const activeKeyframes = ...`
# Actually we can replace from `if (layerRelevantKeyframes.length === 0) return;`
# down to the start of `targetStrokeIds.forEach`

regex = re.compile(r'if \(layerRelevantKeyframes\.length === 0\) return;\s*const allowExtrapolation = currentUI\.overshootExtrapolationEnabled \?\? true;\s*const extrapolationFactor = currentUI\.overshootExtrapolationFactor \?\? 0\.2;\s*const weights = calculateInterpolationWeights\([\s\S]*?\);\s*const activeKeyframes = layerRelevantKeyframes\s*\.map\(k => \(\{ \.\.\.k, weight: weights\[k\.id\] \|\| 0 \}\)\)\s*\.filter\(k => Math\.abs\(k\.weight\) > 0\.0001\);\s*const targetStrokeIds: string\[\] = \[\];\s*if \(layer\.type === \'comp\'\) \{\s*layerRelevantKeyframes\.forEach\(kf => \{\s*const ls = kf\.layerStates\.find\(s => s\.layerId === layer\.id\);\s*ls\?\.strokes\.forEach\(st => \{\s*if \(st\.id && !targetStrokeIds\.includes\(st\.id\)\) \{\s*targetStrokeIds\.push\(st\.id\);\s*\}\s*\}\);\s*\}\);\s*\} else \{\s*targetStrokeIds\.push\(`stroke-\$\{layer\.id\}-unique`\);\s*\}\s*if \(targetStrokeIds\.length === 0\) return;\s*targetStrokeIds\.forEach\(strokeId => \{')

replacement = """const targetStrokeIds: string[] = [];
        if (layer.type === 'comp') {
          currentProject.keyframes.forEach(kf => {
            const ls = kf.layerStates.find(s => s.layerId === layer.id);
            ls?.strokes.forEach(st => {
              if (st.id && !targetStrokeIds.includes(st.id)) {
                targetStrokeIds.push(st.id);
              }
            });
          });
        } else {
          targetStrokeIds.push(`stroke-${layer.id}-unique`);
        }

        if (targetStrokeIds.length === 0) return;

        const allowExtrapolation = currentUI.overshootExtrapolationEnabled ?? true;
        const extrapolationFactor = currentUI.overshootExtrapolationFactor ?? 0.2;

        targetStrokeIds.forEach(strokeId => {
          const strokeRelevantKeyframes = currentProject.keyframes.filter(kf => {
            const ls = kf.layerStates.find(s => s.layerId === layer.id);
            if (!ls) return false;
            const st = layer.type === 'comp' ? ls.strokes.find(s => s.id === strokeId) : ls.strokes[0];
            return st && st.points && st.points.length > 0;
          });

          if (strokeRelevantKeyframes.length === 0) return;

          const weights = calculateInterpolationWeights(
              currentAxesDict, 
              strokeRelevantKeyframes, 
              currentUI.interpolationExponent, 
              currentUI.interpolationStrategy,
              allowExtrapolation,
              extrapolationFactor,
              currentUI.gridCurvature ?? 1.0
          );

          const activeKeyframes = strokeRelevantKeyframes
               .map(k => ({ ...k, weight: weights[k.id] || 0 }))
               .filter(k => Math.abs(k.weight) > 0.0001);"""

if match := regex.search(content):
    new_content = content[:match.start()] + replacement + content[match.end():]
    with open('components/Canvas.tsx', 'w') as f:
        f.write(new_content)
    print("Patched interpolation weights.")
else:
    print("Regex missed for interpolation weights.")
