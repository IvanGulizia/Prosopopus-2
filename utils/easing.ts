// utils/easing.ts
import { EasingType } from '../types';

export function evaluateEasing(t: number, type: EasingType = 'easeInOut'): number {
  // Clamp input between 0 and 1
  const x = Math.max(0, Math.min(1, t));

  switch (type) {
    case 'linear':
      return x;

    case 'easeIn':
      return x * x * x;

    case 'easeOut':
      return 1 - Math.pow(1 - x, 3);

    case 'easeInOut':
      return x < 0.5
        ? 4 * x * x * x
        : 1 - Math.pow(-2 * x + 2, 3) / 2;

    case 'cubicBezier':
      // Fast approx for standard cubic bezier (0.25, 0.1, 0.25, 1.0)
      return x * x * (3 - 2 * x);

    case 'bounce': {
      const n1 = 7.5625;
      const d1 = 2.75;
      let progress = x;
      if (progress < 1 / d1) {
        return n1 * progress * progress;
      } else if (progress < 2 / d1) {
        progress -= 1.5 / d1;
        return n1 * progress * progress + 0.75;
      } else if (progress < 2.5 / d1) {
        progress -= 2.25 / d1;
        return n1 * progress * progress + 0.9375;
      } else {
        progress -= 2.625 / d1;
        return n1 * progress * progress + 0.984375;
      }
    }

    case 'spring': {
      // Damped harmonic overshoot curve
      if (x === 0 || x === 1) return x;
      const p = 0.3;
      return Math.pow(2, -10 * x) * Math.sin(((x - p / 4) * (2 * Math.PI)) / p) + 1;
    }

    default:
      return x;
  }
}
