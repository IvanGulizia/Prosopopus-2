import { Layer, Stroke, StyleProps } from '../types';

export function resolveStrokeStyle(stroke: Stroke | undefined, layer: Layer | undefined): StyleProps {
  // Default fallback if everything is missing
  const defaultStyle: StyleProps = {
    strokeColor: '#000000',
    strokeWidth: 4,
    fillColor: 'none',
    lineStyle: 'solid'
  };

  const baseStyle = layer?.baseStyle || defaultStyle;

  if (!stroke || !stroke.style) {
    return {
      strokeColor: baseStyle.strokeColor,
      strokeWidth: baseStyle.strokeWidth,
      fillColor: baseStyle.fillColor,
      lineStyle: baseStyle.lineStyle
    };
  }

  return {
    strokeColor: stroke.style.strokeColor ?? baseStyle.strokeColor,
    strokeWidth: stroke.style.strokeWidth ?? baseStyle.strokeWidth,
    fillColor: stroke.style.fillColor ?? baseStyle.fillColor,
    lineStyle: stroke.style.lineStyle ?? baseStyle.lineStyle
  };
}
