export const STAGE_W = 640;
export const STAGE_H = 480;
export const WORLD_SCALE = 64;
export const DEFAULT_GROUND_Y = 280;
export const DEFAULT_WALL_Z = -4.2;
export const DEFAULT_FLOOR_FRONT_Z = 6.8;

const PITCH_RAD_DEFAULT = 14.5 * Math.PI / 180;
const COS_P_DEFAULT = Math.cos(PITCH_RAD_DEFAULT);
const SIN_P_DEFAULT = Math.sin(PITCH_RAD_DEFAULT);
const CAM_DIST_DEFAULT = 13.5;
const LOOK_Y_DEFAULT = 0.625 / COS_P_DEFAULT;
const DEPTH_GROUND_DEFAULT = CAM_DIST_DEFAULT + LOOK_Y_DEFAULT * SIN_P_DEFAULT;
const FOCAL_Y_DEFAULT = DEPTH_GROUND_DEFAULT * 4 / 15;
export const DEFAULT_FOV_Y = 2 * Math.atan(1 / FOCAL_Y_DEFAULT);
export const DEFAULT_FOV_DEG = DEFAULT_FOV_Y * 180 / Math.PI;

export function screenToWorldX(sx, stageW = STAGE_W, worldScale = WORLD_SCALE) {
  return (sx - stageW / 2) / worldScale;
}

export function screenToWorldY(sy, groundY = DEFAULT_GROUND_Y, worldScale = WORLD_SCALE) {
  return (groundY - sy) / worldScale;
}

export function perspectiveMatrix(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

export function lookAtMatrix(eye, target, up = [0, 1, 0]) {
  let zx = eye[0] - target[0];
  let zy = eye[1] - target[1];
  let zz = eye[2] - target[2];
  const zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  const xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  return new Float32Array([
    xx, yx, zx, 0,
    xy, yy, zy, 0,
    xz, yz, zz, 0,
    -(xx * eye[0] + xy * eye[1] + xz * eye[2]),
    -(yx * eye[0] + yy * eye[1] + yz * eye[2]),
    -(zx * eye[0] + zy * eye[1] + zz * eye[2]),
    1,
  ]);
}

export function multiplyMat4(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    const b0 = b[col * 4], b1 = b[col * 4 + 1], b2 = b[col * 4 + 2], b3 = b[col * 4 + 3];
    out[col * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

export function orthoMatrix(left, right, bottom, top, near, far) {
  const lr = 1 / (left - right);
  const bt = 1 / (bottom - top);
  const nf = 1 / (near - far);
  return new Float32Array([
    -2 * lr, 0, 0, 0,
    0, -2 * bt, 0, 0,
    0, 0, 2 * nf, 0,
    (left + right) * lr, (top + bottom) * bt, (far + near) * nf, 1,
  ]);
}

export function computeLightViewProj(keyDir) {
  const len = Math.hypot(keyDir[0], keyDir[1], keyDir[2]) || 1;
  const kx = keyDir[0] / len;
  const ky = keyDir[1] / len;
  const kz = keyDir[2] / len;
  const target = [0, 0.8, -1.2];
  const eye = [target[0] + kx * 13.0, target[1] + ky * 13.0, target[2] + kz * 13.0];
  const up = Math.abs(ky) > 0.96 ? [0, 0, -1] : [0, 1, 0];
  return multiplyMat4(orthoMatrix(-9.5, 9.5, -6.0, 6.8, 1.0, 30.0), lookAtMatrix(eye, target, up));
}

export function baseCameraParams(stage) {
  const cam = stage.camera ?? {};
  const aspectArr = stage.meta?.aspect ?? [4, 3];
  const aspect = aspectArr[0] / Math.max(0.001, aspectArr[1]);
  const pitchRad = ((cam.pitchDeg ?? 14.5) * Math.PI) / 180;
  const dist = cam.distance ?? CAM_DIST_DEFAULT;
  const target = cam.target ?? [0, LOOK_Y_DEFAULT, 0];
  const fovY = Number.isFinite(cam.fovDeg)
    ? (cam.fovDeg * Math.PI) / 180
    : DEFAULT_FOV_Y;
  const eye = [
    target[0],
    target[1] + dist * Math.sin(pitchRad),
    target[2] + dist * Math.cos(pitchRad),
  ];
  return { eye, target, fovY, aspect, near: 0.4, far: 65, pitchRad, distance: dist };
}

export function computeStageCamera(stage, options = {}) {
  const base = baseCameraParams(stage);
  const t = Number.isFinite(options.time) ? options.time : 0;
  const beats = Number.isFinite(options.beats) ? options.beats : 0;
  const beatPulse = options.beatSync ? Math.exp(-(beats - Math.floor(beats)) * 6.5) * 0.045 : 0;

  let eye;
  let target;
  if (options.orbit) {
    const yaw = options.orbit.yaw ?? 0;
    const pitch = Math.max(0.05, Math.min(1.42, options.orbit.pitch ?? base.pitchRad));
    const dist = Math.max(3, Math.min(40, options.orbit.distance ?? base.distance));
    const panX = options.orbit.panX ?? 0;
    const panY = options.orbit.panY ?? 0;
    const panZ = options.orbit.panZ ?? 0;
    target = [base.target[0] + panX, base.target[1] + panY, base.target[2] + panZ];
    eye = [
      target[0] + dist * Math.cos(pitch) * Math.sin(yaw),
      target[1] + dist * Math.sin(pitch),
      target[2] + dist * Math.cos(pitch) * Math.cos(yaw),
    ];
  } else {
    const swayCfg = stage.camera?.sway ?? { x: 0.4, y: 0.06 };
    const swayScale = options.swayEnabled === false ? 0 : 1;
    const swayX = (Math.sin(t * 0.58) * (swayCfg.x ?? 0) + Math.sin(t * 0.27 + 1.1) * (swayCfg.x ?? 0) * 0.32) * swayScale;
    const swayY = (Math.sin(t * 0.42 + 0.6) * (swayCfg.y ?? 0) - beatPulse) * swayScale;
    const zoom = options.zoomOffset ?? 0;
    eye = [
      base.eye[0] + swayX,
      base.eye[1] + swayY - zoom * 0.08,
      base.eye[2] - zoom,
    ];
    target = [...base.target];
  }

  const proj = perspectiveMatrix(base.fovY, base.aspect, base.near, base.far);
  const view = lookAtMatrix(eye, target);
  return { eye, target, view, proj, viewProj: multiplyMat4(proj, view), aspect: base.aspect };
}

export function neutralViewProj(stage) {
  const base = baseCameraParams(stage);
  return multiplyMat4(
    perspectiveMatrix(base.fovY, base.aspect, base.near, base.far),
    lookAtMatrix(base.eye, base.target),
  );
}

export function projectPoint(vp, x, y, z, width = STAGE_W, height = STAGE_H) {
  const cx = vp[0] * x + vp[4] * y + vp[8] * z + vp[12];
  const cy = vp[1] * x + vp[5] * y + vp[9] * z + vp[13];
  const cz = vp[2] * x + vp[6] * y + vp[10] * z + vp[14];
  const cw = vp[3] * x + vp[7] * y + vp[11] * z + vp[15];
  const invW = cw ? 1 / cw : 1;
  const nx = cx * invW;
  const ny = cy * invW;
  return {
    x: (nx * 0.5 + 0.5) * width,
    y: (0.5 - ny * 0.5) * height,
    ndcX: nx,
    ndcY: ny,
    ndcZ: cz * invW,
  };
}

export function buildFrameLights(stage, opts = {}) {
  const t = Number.isFinite(opts.time) ? opts.time : 0;
  const beats = Number.isFinite(opts.beats) ? opts.beats : 0;
  const beatGlow = opts.beatSync ? Math.exp(-(beats - Math.floor(beats)) * 5.0) * 0.18 : 0;
  const enraged = Boolean(opts.enraged);
  const lights = [];

  for (const src of stage.lighting?.pointLights ?? []) {
    const phase = src.phase ?? 0;
    const flicker = src.flicker ?? 0;
    const wave = Math.sin(t * 6.8 + phase) * 0.6 + Math.sin(t * 13.4 + phase * 1.9) * 0.4;
    const scale = 1 + wave * flicker + beatGlow;
    let [r, g, b] = src.color;
    if (enraged) {
      r = Math.min(1.2, r * 1.15 + 0.18);
      g *= 0.72;
      b *= 0.72;
    }
    lights.push({
      x: src.pos[0],
      y: src.pos[1],
      z: src.pos[2],
      color: [r, g, b],
      intensity: src.intensity * scale,
      radius: src.radius,
    });
  }

  if (opts.flashLight && lights.length < 8) {
    lights.push(opts.flashLight);
  }
  return lights.slice(0, 8);
}

function hash01(n) {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return v - Math.floor(v);
}

export function sampleParticles(stage, opts = {}) {
  const t = Number.isFinite(opts.time) ? opts.time : 0;
  const enraged = Boolean(opts.enraged);
  const cfg = stage.atmosphere?.particles ?? { primary: [1, 0.85, 0.5], secondary: [0.6, 0.8, 1], rise: 0.2, count: 40 };
  const focusZ = stage.camera?.focusZ ?? 0;
  const count = Math.min(120, Math.max(0, opts.count ?? cfg.count ?? 40));
  const out = [];
  for (let i = 0; i < count; i++) {
    const rx = hash01(i * 3 + 1);
    const ry = hash01(i * 3 + 2);
    const rz = hash01(i * 3 + 3);
    const speed = (cfg.rise ?? 0.2) * (0.55 + hash01(i * 7 + 5) * 0.9);
    let life = (ry + t * speed * 0.22) % 1;
    if (life < 0) life += 1;
    const z = -4.2 + rz * 7.2;
    const x = (rx - 0.5) * 12.2 + Math.sin(t * (0.6 + rx * 0.8) + i) * 0.36;
    const y = 0.15 + life * 4.5;
    const edgeFade = Math.sin(life * Math.PI);
    const twinkle = 0.6 + 0.4 * Math.sin(t * (2.4 + ry * 3.0) + i * 2.1);
    const baseColor = enraged && i % 3 === 0 ? [1.0, 0.32, 0.36]
      : i % 3 === 0 ? cfg.secondary : cfg.primary;
    const depthBokeh = Math.abs(z - focusZ) / 3.8;
    out.push({
      x, y, z,
      size: 0.065 + hash01(i * 11 + 2) * 0.07 + depthBokeh * 0.08,
      alpha: edgeFade * twinkle * (z > 1.2 ? 0.42 : 0.65),
      color: baseColor,
      softness: 0.35 + depthBokeh * 0.55,
    });
  }
  return out;
}
