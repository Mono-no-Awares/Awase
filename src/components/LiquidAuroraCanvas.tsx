import React, { useEffect, useRef } from "react";

interface LiquidAuroraCanvasProps {
  spectrum: number[];
  peak: number;
  isPlaying: boolean;
  accentColor: string;
  secondaryColor: string;
  gamingMode?: boolean;
  mousePos?: { x: number; y: number } | null;
}

const VERT_SRC = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision highp float;
varying vec2 v_uv;
uniform float u_time;
uniform float u_bass;
uniform float u_energy;
uniform float u_playing;
uniform vec2 u_res;
uniform vec2 u_mouse;
uniform vec3 u_c1;
uniform vec3 u_c2;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  vec2 m = (u_mouse - 0.5) * vec2(aspect, 1.0);
  vec2 diff = p - m;
  float mDist = length(diff);
  float mPull = exp(-mDist * 3.2) * 0.22;
  p -= diff * mPull;

  float t = u_time * 0.22;
  vec2 q = vec2(
    fbm(p * 1.35 + vec2(t * 0.6, -t * 0.4)),
    fbm(p * 1.35 + vec2(-t * 0.5, t * 0.7) + vec2(5.2, 1.3))
  );

  vec2 r = vec2(
    fbm(p * 1.6 + 2.2 * q + vec2(1.7, 9.2) + t * 0.35),
    fbm(p * 1.6 + 2.2 * q + vec2(8.3, 2.8) - t * 0.3)
  );

  float f = fbm(p * 1.2 + 2.4 * r + u_bass * 0.35);

  vec3 base = vec3(0.0196, 0.0196, 0.0275);
  float ribbon1 = smoothstep(0.18, 0.78, f);
  float ribbon2 = smoothstep(0.32, 0.92, length(r) * 0.72);
  float highlight = pow(max(0.0, f * ribbon2), 2.2) * (0.55 + u_bass * 0.95);

  vec3 col = base;
  col = mix(col, u_c1 * 0.62, ribbon1 * (0.48 + u_energy * 0.38));
  col = mix(col, u_c2 * 0.72, ribbon2 * (0.36 + u_bass * 0.42));
  col += mix(u_c1, u_c2, 0.55) * highlight * 0.55;

  float centerGlow = exp(-dot(p, p) * 1.45) * (0.14 + u_bass * 0.28);
  col += u_c1 * centerGlow;

  float vig = 1.0 - smoothstep(0.45, 1.25, length(p));
  col = mix(base, col, mix(0.38, 1.0, vig));
  col *= mix(0.42, 1.0, u_playing);
  col = max(col, base);

  gl_FragColor = vec4(col, 1.0);
}
`;

function hexToRgb01(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) / 255;
    const g = parseInt(clean[1] + clean[1], 16) / 255;
    const b = parseInt(clean[2] + clean[2], 16) / 255;
    return [r, g, b];
  }
  if (clean.length >= 6) {
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    return [r, g, b];
  }
  return [0.22, 0.74, 0.97];
}

export const LiquidAuroraCanvas: React.FC<LiquidAuroraCanvasProps> = ({
  spectrum,
  peak,
  isPlaying,
  accentColor,
  secondaryColor,
  gamingMode = false,
  mousePos = null,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    spectrum,
    peak,
    isPlaying,
    targetC1: hexToRgb01(accentColor),
    targetC2: hexToRgb01(secondaryColor),
    curC1: hexToRgb01(accentColor),
    curC2: hexToRgb01(secondaryColor),
    curBass: 0,
    curEnergy: 0,
    curPlay: isPlaying ? 1 : 0,
    curMouse: [0.5, 0.5] as [number, number],
    targetMouse: [0.5, 0.5] as [number, number],
    simTime: 0,
  });

  stateRef.current.spectrum = spectrum;
  stateRef.current.peak = peak;
  stateRef.current.isPlaying = isPlaying;
  stateRef.current.targetC1 = hexToRgb01(accentColor);
  stateRef.current.targetC2 = hexToRgb01(secondaryColor);
  if (mousePos) {
    stateRef.current.targetMouse = [mousePos.x, 1 - mousePos.y];
  } else {
    stateRef.current.targetMouse = [0.5, 0.5];
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || gamingMode) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      powerPreference: "low-power",
    });

    if (!gl) return;

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(prog, "a_pos");
    const uTime = gl.getUniformLocation(prog, "u_time");
    const uBass = gl.getUniformLocation(prog, "u_bass");
    const uEnergy = gl.getUniformLocation(prog, "u_energy");
    const uPlaying = gl.getUniformLocation(prog, "u_playing");
    const uRes = gl.getUniformLocation(prog, "u_res");
    const uMouse = gl.getUniformLocation(prog, "u_mouse");
    const uC1 = gl.getUniformLocation(prog, "u_c1");
    const uC2 = gl.getUniformLocation(prog, "u_c2");

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = stateRef.current;

      const bins = st.spectrum;
      let bassRaw = 0;
      let energyRaw = 0;
      if (bins.length > 0) {
        const bassCount = Math.min(5, bins.length);
        for (let i = 0; i < bassCount; i++) bassRaw += bins[i];
        bassRaw /= bassCount;
        for (let i = 0; i < bins.length; i++) energyRaw += bins[i];
        energyRaw /= bins.length;
      }
      const targetBass = Math.min(1, bassRaw * 0.7 + st.peak * 0.45);
      const targetEnergy = Math.min(1, energyRaw * 0.8 + st.peak * 0.3);

      st.curBass += (targetBass - st.curBass) * 0.14;
      st.curEnergy += (targetEnergy - st.curEnergy) * 0.1;
      st.curPlay += ((st.isPlaying ? 1 : 0) - st.curPlay) * 0.06;

      for (let i = 0; i < 3; i++) {
        st.curC1[i] += (st.targetC1[i] - st.curC1[i]) * 0.04;
        st.curC2[i] += (st.targetC2[i] - st.curC2[i]) * 0.04;
      }
      st.curMouse[0] += (st.targetMouse[0] - st.curMouse[0]) * 0.08;
      st.curMouse[1] += (st.targetMouse[1] - st.curMouse[1]) * 0.08;

      const speed = (0.35 + st.curPlay * 0.75 + st.curBass * 0.85) * dt;
      st.simTime += speed;

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.uniform1f(uTime, st.simTime);
      gl.uniform1f(uBass, st.curBass);
      gl.uniform1f(uEnergy, st.curEnergy);
      gl.uniform1f(uPlaying, st.curPlay);
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, st.curMouse[0], st.curMouse[1]);
      gl.uniform3f(uC1, st.curC1[0], st.curC1[1], st.curC1[2]);
      gl.uniform3f(uC2, st.curC2[0], st.curC2[1], st.curC2[2]);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [gamingMode]);

  if (gamingMode) return null;

  return <canvas ref={canvasRef} className="w-full h-full block" />;
};
