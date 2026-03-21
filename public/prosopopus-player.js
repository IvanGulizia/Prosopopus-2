/**
 * Prosopopus v2 - Standalone Player (JS Version)
 * Optimized for embedding.
 */

export class ProsopopusPlayer {
  constructor(canvas, project) {
    if (!canvas) throw new Error('Canvas element is required');
    if (!project) throw new Error('Project data is required');

    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('Could not get canvas context');
    
    this.project = project;
    this.currentAxes = { 'axis-x': 0.5, 'axis-y': 0.5 };
    this.targetAxes = { 'axis-x': 0.5, 'axis-y': 0.5 };
    this.velocity = { x: 0, y: 0 };
    this.lastTime = 0;
    this.isRunning = false;

    this.setupInteraction();
  }

  setupInteraction() {
    const handleMove = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      const x = (clientX - rect.left) / rect.width;
      const y = (clientY - rect.top) / rect.height;
      
      this.targetAxes['axis-x'] = Math.max(0, Math.min(1, x));
      this.targetAxes['axis-y'] = Math.max(0, Math.min(1, y));
    };

    this.canvas.addEventListener('mousemove', handleMove);
    this.canvas.addEventListener('touchmove', handleMove, { passive: true });
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    requestAnimationFrame((t) => this.loop(t));
  }

  stop() {
    this.isRunning = false;
  }

  loop(time) {
    if (!this.isRunning) return;
    if (!this.lastTime) this.lastTime = time;
    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    this.updatePhysics(dt);
    this.render();
    requestAnimationFrame((t) => this.loop(t));
  }

  updatePhysics(dt) {
    const settings = this.project.settings || {};
    if (settings.playModePhysics) {
      const stiffness = settings.springStiffness || 120;
      const damping = settings.springDamping || 20;
      
      const fx = (this.targetAxes['axis-x'] - this.currentAxes['axis-x']) * stiffness - this.velocity.x * damping;
      const fy = (this.targetAxes['axis-y'] - this.currentAxes['axis-y']) * stiffness - this.velocity.y * damping;
      
      this.velocity.x += fx * dt;
      this.velocity.y += fy * dt;
      this.currentAxes['axis-x'] += this.velocity.x * dt;
      this.currentAxes['axis-y'] += this.velocity.y * dt;
    } else {
      this.currentAxes['axis-x'] = this.targetAxes['axis-x'];
      this.currentAxes['axis-y'] = this.targetAxes['axis-y'];
    }
    
    this.currentAxes['axis-x'] = Math.max(0, Math.min(1, this.currentAxes['axis-x']));
    this.currentAxes['axis-y'] = Math.max(0, Math.min(1, this.currentAxes['axis-y']));
  }

  render() {
    const { canvas, ctx, project, currentAxes } = this;
    const settings = project.settings || {};
    const dpr = window.devicePixelRatio || 1;
    
    // Get the actual display size of the canvas (responsive)
    const rect = canvas.getBoundingClientRect();
    const displayW = rect.width || project.canvasSize?.width || 600;
    const displayH = rect.height || project.canvasSize?.height || 600;
    
    // Internal project dimensions (the "viewbox")
    const projectW = project.canvasSize?.width || 600;
    const projectH = project.canvasSize?.height || 600;

    // Update internal resolution to match display size * DPR
    if (canvas.width !== Math.floor(displayW * dpr) || canvas.height !== Math.floor(displayH * dpr)) {
      canvas.width = Math.floor(displayW * dpr);
      canvas.height = Math.floor(displayH * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    
    // Scale the drawing to fit the display size while keeping project coordinates
    const scaleX = displayW / projectW;
    const scaleY = displayH / projectH;
    ctx.scale(scaleX, scaleY);

    ctx.clearRect(0, 0, projectW, projectH);
    ctx.fillStyle = settings.theme?.canvasBg || '#ffffff';
    ctx.fillRect(0, 0, projectW, projectH);

    if (!project.layers || !project.keyframes) {
      ctx.restore();
      return;
    }

    project.layers.forEach(layer => {
      if (!layer.visible) return;
      
      const relevantKfs = project.keyframes.filter(kf => {
        const state = kf.layerStates?.find(s => s.layerId === layer.id);
        return state && state.strokes && state.strokes.length > 0;
      });
      
      if (relevantKfs.length === 0) return;

      const weights = this.calculateWeights(currentAxes, relevantKfs, settings.interpolationExponent, settings.interpolationStrategy);
      const activeKfs = relevantKfs.map(k => ({ ...k, weight: weights[k.id] || 0 })).filter(k => k.weight > 0.0001);
      
      if (activeKfs.length === 0) return;

      const strokeData = activeKfs.map(kf => {
        const ls = kf.layerStates.find(s => s.layerId === layer.id);
        const s = ls.strokes[0];
        const style = this.resolveStyle(s, layer);
        return { 
          weight: kf.weight, 
          points: s.points, 
          color: style.strokeColor, 
          fillColor: style.fillColor, 
          width: style.strokeWidth, 
          cornerRoundness: style.cornerRoundness || 0 
        };
      });

      const { points, color, fillColor, width, cornerRoundness } = this.interpolate(strokeData, layer.interpolationMode, settings.performanceMode);
      
      if (points.length > 0) {
        ctx.globalAlpha = layer.opacity || 1;
        ctx.lineCap = settings.strokeCap || 'round';
        ctx.lineJoin = 'round';

        if (layer.interpolationMode === 'spline') {
          this.drawSpline(ctx, points);
        } else if (cornerRoundness > 0) {
          this.drawRounded(ctx, points, cornerRoundness);
        } else {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
        }

        if (fillColor !== 'none') {
          ctx.fillStyle = fillColor;
          ctx.fill();
        }
        if (color !== 'none') {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.stroke();
        }
      }
    });

    ctx.restore();
  }

  calculateWeights(axes, keyframes, exponent = 2, strategy = 'bilinear-grid') {
    if (keyframes.length === 0) return {};
    if (keyframes.length === 1) return { [keyframes[0].id]: 1 };

    if (strategy === 'idw') {
      const weights = {};
      let total = 0;
      for (const kf of keyframes) {
        let d = 0;
        for (const id in axes) d += Math.pow((axes[id] || 0) - (kf.axisValues[id] || 0), 2);
        d = Math.sqrt(d);
        if (d < 0.001) return { [kf.id]: 1 };
        const w = 1 / Math.pow(d, exponent);
        weights[kf.id] = w;
        total += w;
      }
      for (const id in weights) weights[id] /= total;
      return weights;
    }

    // Simplified Bilinear for standalone
    const xCoords = [...new Set(keyframes.map(k => k.axisValues['axis-x'] || 0))].sort((a, b) => a - b);
    const yCoords = [...new Set(keyframes.map(k => k.axisValues['axis-y'] || 0))].sort((a, b) => a - b);
    
    const curX = axes['axis-x'] || 0;
    const curY = axes['axis-y'] || 0;

    const getInterval = (val, grid) => {
      if (val <= grid[0]) return { l: grid[0], u: grid[0], t: 0 };
      if (val >= grid[grid.length-1]) return { l: grid[grid.length-1], u: grid[grid.length-1], t: 0 };
      for (let i = 0; i < grid.length - 1; i++) {
        if (val >= grid[i] && val <= grid[i+1]) return { l: grid[i], u: grid[i+1], t: (val - grid[i]) / (grid[i+1] - grid[i]) };
      }
      return { l: grid[0], u: grid[0], t: 0 };
    };

    const x = getInterval(curX, xCoords);
    const y = getInterval(curY, yCoords);

    const weights = {};
    const addW = (tx, ty, w) => {
      const kf = keyframes.find(k => Math.abs((k.axisValues['axis-x'] || 0) - tx) < 0.01 && Math.abs((k.axisValues['axis-y'] || 0) - ty) < 0.01);
      if (kf) weights[kf.id] = (weights[kf.id] || 0) + w;
    };

    addW(x.l, y.l, (1 - x.t) * (1 - y.t));
    addW(x.u, y.l, x.t * (1 - y.t));
    addW(x.l, y.u, (1 - x.t) * y.t);
    addW(x.u, y.u, x.t * y.t);

    return weights;
  }

  resolveStyle(stroke, layer) {
    const base = layer.baseStyle || { strokeColor: '#000000', strokeWidth: 2, fillColor: 'none' };
    if (!stroke || !stroke.style) return base;
    return {
      strokeColor: stroke.style.strokeColor || base.strokeColor,
      strokeWidth: stroke.style.strokeWidth || base.strokeWidth,
      fillColor: stroke.style.fillColor || base.fillColor,
      cornerRoundness: stroke.style.cornerRoundness || base.cornerRoundness || 0
    };
  }

  interpolate(data, mode, perf) {
    const targetCount = perf ? 80 : 200;
    const resample = (pts, count) => {
      if (pts.length < 2) return pts;
      let len = 0;
      for (let i = 1; i < pts.length; i++) len += Math.sqrt(Math.pow(pts[i].x - pts[i-1].x, 2) + Math.pow(pts[i].y - pts[i-1].y, 2));
      const step = len / (count - 1);
      const res = [pts[0]];
      let dSoFar = 0;
      let idx = 1;
      for (let i = 1; i < count - 1; i++) {
        const target = i * step;
        while (idx < pts.length - 1) {
          const d = Math.sqrt(Math.pow(pts[idx].x - pts[idx-1].x, 2) + Math.pow(pts[idx].y - pts[idx-1].y, 2));
          if (dSoFar + d >= target) break;
          dSoFar += d;
          idx++;
        }
        const p1 = pts[idx-1], p2 = pts[idx];
        const d = Math.sqrt(Math.pow(pts[idx].x - pts[idx-1].x, 2) + Math.pow(pts[idx].y - pts[idx-1].y, 2));
        const t = d === 0 ? 0 : (target - dSoFar) / d;
        res.push({ x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t, pressure: (p1.pressure || 0.5) + ((p2.pressure || 0.5) - (p1.pressure || 0.5)) * t });
      }
      res.push(pts[pts.length - 1]);
      return res;
    };

    const mix = (colors) => {
      let r=0, g=0, b=0, a=0, tw=0;
      colors.forEach(c => {
        if (!c.color || c.color === 'none') return;
        
        let rgba = { r: 0, g: 0, b: 0, a: 1 };
        if (c.color.startsWith('rgba')) {
          const m = c.color.match(/[\d.]+/g);
          if (m) rgba = { r: parseFloat(m[0]), g: parseFloat(m[1]), b: parseFloat(m[2]), a: parseFloat(m[3] || 1) };
        } else if (c.color.startsWith('rgb')) {
          const m = c.color.match(/[\d.]+/g);
          if (m) rgba = { r: parseFloat(m[0]), g: parseFloat(m[1]), b: parseFloat(m[2]), a: 1 };
        } else if (c.color.startsWith('#')) {
          let hex = c.color.slice(1);
          if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
          const i = parseInt(hex, 16);
          rgba = { r: (i >> 16) & 255, g: (i >> 8) & 255, b: i & 255, a: 1 };
        }

        r += rgba.r * c.weight;
        g += rgba.g * c.weight;
        b += rgba.b * c.weight;
        a += rgba.a * c.weight;
        tw += c.weight;
      });
      if (tw === 0) return 'none';
      return `rgba(${Math.round(r/tw)}, ${Math.round(g/tw)}, ${Math.round(b/tw)}, ${a/tw})`;
    };

    const points = [];
    for (let i = 0; i < targetCount; i++) {
      let x=0, y=0, p=0, tw=0;
      data.forEach(kf => {
        const pts = resample(kf.points, targetCount);
        x += pts[i].x * kf.weight; y += pts[i].y * kf.weight; p += (pts[i].pressure || 0.5) * kf.weight; tw += kf.weight;
      });
      points.push({ x: x/tw, y: y/tw, pressure: p/tw });
    }

    return {
      points,
      color: mix(data.map(d => ({ color: d.color, weight: d.weight }))),
      fillColor: mix(data.map(d => ({ color: d.fillColor, weight: d.weight }))),
      width: data.reduce((acc, d) => acc + d.width * d.weight, 0),
      cornerRoundness: data.reduce((acc, d) => acc + d.cornerRoundness * d.weight, 0)
    };
  }

  drawSpline(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = i > 0 ? pts[i-1] : pts[0], p1 = pts[i], p2 = pts[i+1], p3 = i < pts.length - 2 ? pts[i+2] : pts[pts.length-1];
      ctx.bezierCurveTo(p1.x + (p2.x - p0.x)/6, p1.y + (p2.y - p0.y)/6, p2.x - (p3.x - p1.x)/6, p2.y - (p3.y - p1.y)/6, p2.x, p2.y);
    }
  }

  drawRounded(ctx, pts, roundness) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i-1], c = pts[i], n = pts[i+1];
      const d1 = Math.sqrt(Math.pow(c.x-p.x,2)+Math.pow(c.y-p.y,2));
      const d2 = Math.sqrt(Math.pow(n.x-c.x,2)+Math.pow(n.y-c.y,2));
      const r = Math.min(d1, d2) * 0.5 * (roundness/100);
      ctx.arcTo(c.x, c.y, n.x, n.y, r);
    }
    ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
  }
}
