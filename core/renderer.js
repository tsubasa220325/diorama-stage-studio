import { buildDioramaAtlasData, generateNormalFromRgba } from './atlasBuilder.js';
import { buildExternalModelVertices } from './glbImporter.js';
import {
  buildFrameLights, computeLightViewProj, computeStageCamera,
  neutralViewProj, sampleParticles, STAGE_H, STAGE_W,
} from './math.js';
import { buildArtDioramaMesh, buildStageMesh } from './meshBuilder.js';
import { buildSampleSpriteRgba, SAMPLE_SPRITE_STYLES } from './sampleSprites.js';

const MAX_LIGHTS = 8;

const SHADOW_MESH_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 3) in vec4 aMat;
uniform mat4 uLightVP;
uniform float uBeats;
uniform vec4 uAnimPivot;
void main() {
  if ((aMat.x > 1.5 && aMat.x < 2.5) || aMat.x > 3.5 || aMat.w > 0.5) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }
  vec3 pos = aPos;
  if (aMat.w < -1.5 && aMat.w > -2.5 && uAnimPivot.w > 0.001) {
    float ang = cos(uBeats * 3.14159265) * uAnimPivot.w;
    float ca = cos(ang);
    float sa = sin(ang);
    vec2 rel = pos.xy - uAnimPivot.xy;
    pos.xy = uAnimPivot.xy + vec2(rel.x * ca - rel.y * sa, rel.x * sa + rel.y * ca);
  } else if (aMat.w < -2.5 && aMat.w > -3.5) {
    pos.y += sin(uBeats * 1.5707963 + pos.x * 1.15) * 0.13;
  } else if (aMat.w < -3.5 && aMat.w > -4.5) {
    pos.x += sin(uBeats * 3.14159265 + pos.x * 0.92) * 0.13 * clamp((4.85 - pos.y) * 0.40, 0.0, 1.0);
  }
  gl_Position = uLightVP * vec4(pos, 1.0);
}`;

const SHADOW_DEPTH_FRAG = `#version 300 es
precision highp float;
void main() {}`;

const SHADOW_SPRITE_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aQuad;
uniform mat4 uLightVP;
uniform vec3 uAnchor;
uniform vec2 uSize;
uniform float uRotRad;
uniform vec2 uPivotUv;
out vec2 vUv;
void main() {
  float lx = (aQuad.x - uPivotUv.x) * uSize.x;
  float ly = (uPivotUv.y - aQuad.y) * uSize.y;
  float ca = cos(uRotRad);
  float sa = sin(uRotRad);
  float rx = lx * ca - ly * sa;
  float ry = lx * sa + ly * ca;
  vUv = aQuad;
  gl_Position = uLightVP * vec4(uAnchor.x + rx, uAnchor.y + ry, uAnchor.z, 1.0);
}`;

const SHADOW_SPRITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
void main() {
  if (texture(uTex, vUv).a < 0.25) discard;
}`;

const STAGE_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNorm;
layout(location = 2) in vec2 aUv;
layout(location = 3) in vec4 aMat;
uniform mat4 uViewProj;
uniform mat4 uNeutralVP;
uniform mat4 uLightVP;
uniform float uBeats;
uniform vec4 uAnimPivot;
out vec3 vWorld;
out vec3 vNorm;
out vec2 vUv;
out vec4 vMat;
out vec4 vLightClip;
out vec4 vNeutralClip;
void main() {
  vec3 pos = aPos;
  vec3 n = normalize(aNorm);
  if (aMat.w < -1.5 && aMat.w > -2.5 && uAnimPivot.w > 0.001) {
    float ang = cos(uBeats * 3.14159265) * uAnimPivot.w;
    float ca = cos(ang);
    float sa = sin(ang);
    vec2 rel = pos.xy - uAnimPivot.xy;
    pos.xy = uAnimPivot.xy + vec2(rel.x * ca - rel.y * sa, rel.x * sa + rel.y * ca);
    n.xy = vec2(n.x * ca - n.y * sa, n.x * sa + n.y * ca);
  } else if (aMat.w < -2.5 && aMat.w > -3.5) {
    pos.y += sin(uBeats * 1.5707963 + pos.x * 1.15) * 0.13;
  } else if (aMat.w < -3.5 && aMat.w > -4.5) {
    pos.x += sin(uBeats * 3.14159265 + pos.x * 0.92) * 0.13 * clamp((4.85 - pos.y) * 0.40, 0.0, 1.0);
  }
  vWorld = pos;
  vNorm = n;
  vUv = aUv;
  vMat = aMat;
  vLightClip = uLightVP * vec4(pos + n * 0.032, 1.0);
  vNeutralClip = uNeutralVP * vec4(pos, 1.0);
  gl_Position = uViewProj * vec4(pos, 1.0);
}`;

const STAGE_FRAG = `#version 300 es
precision highp float;
in vec3 vWorld;
in vec3 vNorm;
in vec2 vUv;
in vec4 vMat;
in vec4 vLightClip;
in vec4 vNeutralClip;
uniform sampler2D uBgTex;
uniform sampler2D uAtlasAlbedo;
uniform sampler2D uAtlasNormal;
uniform sampler2D uShadowMap;
uniform float uHasBgTex;
uniform float uStageMode;
uniform vec2 uBgSize;
uniform vec3 uBgTop;
uniform vec3 uBgBottom;
uniform vec3 uBgAccent;
uniform float uVistaStyle;
uniform float uUseShadows;
uniform float uShadowTexel;
uniform float uTime;
uniform float uBeatPulse;
uniform float uFloorV;
uniform float uWallHorizonSy;
uniform float uFloorGloss;
uniform vec3 uCamPos;
uniform vec3 uAmbient;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uFloorSpecTint;
uniform float uWallShade;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uPillarTint;
uniform vec3 uCurbTint;
uniform float uEnraged;
uniform float uDofStrength;
uniform float uFocusZ;
uniform vec4 uHeroRing;
uniform vec3 uHeroRingCol;
uniform vec4 uEnemyRing;
uniform vec3 uEnemyRingCol;
uniform vec4 uLightPos[${MAX_LIGHTS}];
uniform vec4 uLightCol[${MAX_LIGHTS}];
uniform int uLightCount;
out vec4 fragColor;

float mirror01(float x) {
  float t = mod(abs(x), 2.0);
  return t > 1.0 ? 2.0 - t : t;
}

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 sampleSharp(sampler2D tex, vec2 uv, vec2 size) {
  vec2 p = uv * size;
  vec2 fw = max(fwidth(p), vec2(0.0005));
  vec2 f = fract(p);
  vec2 sharp = (floor(p) + clamp((f - 0.5) / fw + 0.5, 0.0, 1.0)) / size;
  float mag = clamp(1.35 - max(fw.x, fw.y), 0.0, 1.0);
  return mix(texture(tex, uv).rgb, texture(tex, sharp).rgb, mag);
}

float sampleShadow(vec3 fn) {
  if (uUseShadows < 0.5) return 1.0;
  vec3 sc = vLightClip.xyz / max(0.0001, vLightClip.w) * 0.5 + 0.5;
  if (sc.x <= 0.01 || sc.x >= 0.99 || sc.y <= 0.01 || sc.y >= 0.99 || sc.z <= 0.0 || sc.z >= 1.0) return 1.0;
  float ndl = max(dot(fn, normalize(uKeyDir)), 0.0);
  float bias = max(0.0038 * (1.0 - ndl), 0.0018);
  float d = sc.z - bias;
  float s = 0.0;
  s += d <= texture(uShadowMap, sc.xy).r ? 1.0 : 0.0;
  s += d <= texture(uShadowMap, sc.xy + vec2(uShadowTexel, uShadowTexel)).r ? 1.0 : 0.0;
  s += d <= texture(uShadowMap, sc.xy + vec2(-uShadowTexel, uShadowTexel)).r ? 1.0 : 0.0;
  s += d <= texture(uShadowMap, sc.xy + vec2(uShadowTexel, -uShadowTexel)).r ? 1.0 : 0.0;
  s += d <= texture(uShadowMap, sc.xy + vec2(-uShadowTexel, -uShadowTexel)).r ? 1.0 : 0.0;
  return mix(0.32, 1.0, s * 0.2);
}

vec3 proceduralVista(vec2 uv) {
  float h = clamp(1.0 - uv.y, 0.0, 1.0);
  vec3 sky = mix(uBgBottom, uBgTop, pow(h, 0.72));
  if (uVistaStyle > 0.5 && uVistaStyle < 1.5) {
    // Sunset coastal amphitheater horizon
    float cloudBand = sin(uv.x * 11.0 + sin(uv.y * 18.0) * 0.9 + uTime * 0.08) * 0.5 + 0.5;
    float cloudMask = smoothstep(0.32, 0.72, cloudBand) * smoothstep(0.18, 0.42, h) * (1.0 - smoothstep(0.58, 0.86, h));
    sky = mix(sky, mix(uBgBottom, uBgAccent, 0.42), cloudMask * 0.34);
    float headland = 0.22 + 0.06 * sin(uv.x * 6.5 + 1.2) + 0.03 * sin(uv.x * 17.0);
    float seaHorizon = smoothstep(0.20, 0.17, h);
    float ridge = smoothstep(headland + 0.012, headland - 0.012, h) * (1.0 - seaHorizon);
    sky = mix(sky, uBgTop * 0.55 + vec3(0.08, 0.04, 0.07), ridge * 0.78);
    sky = mix(sky, mix(uBgTop * 0.45, uBgBottom * 0.65, 0.5 + 0.3 * sin(uv.x * 38.0 + uTime * 1.4)), seaHorizon * 0.75);
    float sunD = length((uv - vec2(0.36, 0.56)) * vec2(1.35, 1.0));
    sky += uBgAccent * (exp(-sunD * sunD * 18.0) * 0.58 + smoothstep(0.082, 0.070, sunD) * 0.75);
    float sunReflect = exp(-abs(uv.x - 0.36) * 14.0) * seaHorizon;
    sky += uBgAccent * sunReflect * (0.45 + 0.25 * sin(uv.y * 90.0 - uTime * 3.0));
    return sky;
  }
  if (uVistaStyle > 1.5 && uVistaStyle < 2.5) {
    // Glacial aurora borealis sanctuary
    float wave1 = sin(uv.x * 7.5 + uTime * 0.35 + sin(uv.x * 3.2) * 1.4);
    float curtain = exp(-pow((h - (0.58 + wave1 * 0.12)) * 4.4, 2.0));
    float streaks = 0.6 + 0.4 * sin(uv.x * 46.0 + wave1 * 3.0 + uTime * 0.5);
    vec3 auroraCol = mix(vec3(0.24, 0.96, 0.88), vec3(0.56, 0.52, 1.0), clamp(uv.x * 1.1, 0.0, 1.0));
    sky += auroraCol * curtain * streaks * 0.52;
    float peak = 0.28 + 0.11 * abs(sin(uv.x * 6.8 + 0.6)) + 0.05 * sin(uv.x * 19.0);
    float mountain = smoothstep(peak + 0.012, peak - 0.012, h);
    sky = mix(sky, mix(uBgTop * 0.62, uBgBottom * 0.72, smoothstep(peak - 0.14, peak, h)), mountain * 0.82);
    vec2 sg = floor(uv * vec2(128.0, 72.0));
    float starH = fract(sin(dot(sg, vec2(127.1, 311.7))) * 43758.5453);
    if (starH > 0.988 && h > 0.34) {
      float tw = 0.55 + 0.45 * sin(uTime * 2.8 + starH * 80.0);
      sky += uBgAccent * tw * 0.92;
    }
    return sky;
  }
  if (uVistaStyle > 2.5 && uVistaStyle < 3.5) {
    // Crimson clocktower giant gear vault
    vec2 gc = (uv - vec2(0.50, 0.46)) * vec2(1.33, 1.0);
    float r = length(gc);
    float ang = atan(gc.y, gc.x) + uTime * 0.12;
    float teeth = 0.5 + 0.5 * cos(ang * 16.0);
    float gearRim = smoothstep(0.36, 0.34, r) * smoothstep(0.25, 0.27, r);
    float gearTeeth = smoothstep(0.41, 0.39, r) * smoothstep(0.34, 0.35, r) * smoothstep(0.45, 0.65, teeth);
    float spokes = smoothstep(0.34, 0.32, r) * smoothstep(0.06, 0.08, r) * smoothstep(0.86, 0.94, abs(cos(ang * 4.0)));
    float gearMask = clamp(gearRim + gearTeeth + spokes, 0.0, 1.0);
    float hearthGlow = exp(-pow(h * 2.6, 2.0)) * 0.62 + exp(-r * r * 6.5) * 0.45;
    sky += uBgAccent * hearthGlow * 0.52;
    sky = mix(sky, vec3(0.05, 0.015, 0.025), gearMask * 0.72);
    float archX = abs(fract(uv.x * 4.0) - 0.5) * 2.0;
    sky = mix(sky, sky * 0.58, smoothstep(0.76, 0.84, archX) * 0.55);
    return sky;
  }
  if (uVistaStyle > 3.5 && uVistaStyle < 4.5) {
    // Midnight starlight carnival sky (crescent moon left, tent skyline, dark top-right for HUD)
    float ribbon = exp(-pow((h - (0.37 + 0.08 * sin(uv.x * 5.2 + uTime * 0.24))) * 6.0, 2.0));
    float ribbonMask = smoothstep(0.86, 0.30, uv.x);
    sky += mix(vec3(0.24, 0.88, 0.74), vec3(0.72, 0.36, 0.96), uv.x) * ribbon * ribbonMask * 0.28;
    float tent = 0.16 + 0.08 * pow(max(0.0, 1.0 - abs(fract(uv.x * 4.5 + 0.15) - 0.5) * 2.6), 1.6);
    float skyline = smoothstep(tent + 0.012, tent - 0.012, h);
    sky = mix(sky, vec3(0.05, 0.03, 0.12), skyline * 0.84);
    vec2 mPos = (uv - vec2(0.32, 0.57)) * vec2(1.33, 1.0);
    float mOut = smoothstep(0.068, 0.056, length(mPos));
    float mCut = smoothstep(0.060, 0.048, length(mPos - vec2(0.026, -0.012)));
    float crescent = clamp(mOut - mCut, 0.0, 1.0);
    sky += uBgAccent * (exp(-dot(mPos, mPos) * 30.0) * 0.44 + crescent * 0.96);
    vec2 sg = floor(uv * vec2(124.0, 72.0));
    float starH = fract(sin(dot(sg, vec2(127.1, 311.7))) * 43758.5453);
    if (starH > 0.985 && h > 0.20) {
      float tw = 0.48 + 0.52 * sin(uTime * 3.1 + starH * 90.0);
      vec3 sCol = starH > 0.992 ? vec3(0.45, 1.0, 0.84) : uBgAccent;
      sky += sCol * tw * (uv.x > 0.52 && h > 0.38 ? 0.30 : 0.90);
    }
    return sky;
  }
  if (uVistaStyle > 4.5) {
    // Moonlit gothic belfry sky (giant silver moon centered inside the 7-bell arch)
    float mist = sin(uv.x * 8.5 + uTime * 0.14 + sin(uv.y * 12.0) * 1.1) * 0.5 + 0.5;
    float cloudBand = smoothstep(0.36, 0.78, mist) * smoothstep(0.16, 0.38, h) * (1.0 - smoothstep(0.52, 0.76, h));
    sky = mix(sky, mix(uBgBottom, uBgAccent, 0.25), cloudBand * 0.28);
    vec2 mc = (uv - vec2(0.50, 0.60)) * vec2(1.33, 1.0);
    float mr = length(mc);
    float moonDisk = smoothstep(0.122, 0.110, mr);
    float crater = 0.88 + 0.12 * sin(mc.x * 52.0 + 1.0) * cos(mc.y * 48.0 - 0.5);
    sky += uBgAccent * (exp(-mr * mr * 14.0) * 0.54 + moonDisk * crater * 0.80);
    float spireL = smoothstep(0.24, 0.16, uv.x) * smoothstep(0.42, 0.14, h + abs(uv.x - 0.11) * 2.4);
    float spireR = smoothstep(0.76, 0.84, uv.x) * smoothstep(0.40, 0.14, h + abs(uv.x - 0.89) * 2.4);
    float ridge = smoothstep(0.18 + 0.04 * sin(uv.x * 13.0), 0.15, h);
    sky = mix(sky, vec3(0.03, 0.04, 0.10), clamp(spireL + spireR + ridge * 0.78, 0.0, 1.0));
    vec2 sg = floor(uv * vec2(128.0, 72.0));
    float starH = fract(sin(dot(sg, vec2(127.1, 311.7))) * 43758.5453);
    if (starH > 0.990 && h > 0.28 && mr > 0.15) {
      float tw = 0.5 + 0.5 * sin(uTime * 2.4 + starH * 75.0);
      sky += uBgAccent * tw * (uv.x > 0.50 && h > 0.36 ? 0.26 : 0.74);
    }
    return sky;
  }
  float archX = abs(fract(uv.x * 5.0) - 0.5) * 2.0;
  float archMask = smoothstep(0.68, 0.74, archX) * smoothstep(0.08, 0.78, h);
  float peak = 0.26 + 0.10 * sin(uv.x * 9.0 + 0.4) + 0.06 * sin(uv.x * 21.0);
  float mountain = smoothstep(peak + 0.015, peak - 0.015, h);
  sky = mix(sky, uBgBottom * 0.58, mountain * 0.65);
  sky = mix(sky, sky * 0.76, archMask * 0.42);
  float moonD = length((uv - vec2(0.52, 0.24)) * vec2(1.4, 1.0));
  sky += uBgAccent * (exp(-moonD * moonD * 22.0) * 0.55 + smoothstep(0.095, 0.082, moonD) * 0.72);
  vec2 sg = floor(uv * vec2(120.0, 68.0));
  float starH = fract(sin(dot(sg, vec2(127.1, 311.7))) * 43758.5453);
  if (starH > 0.992 && h > 0.36) {
    float tw = 0.55 + 0.45 * sin(uTime * 2.4 + starH * 80.0);
    sky += uBgAccent * tw * 0.85;
  }
  return sky;
}

void main() {
  float matType = vMat.x;
  vec3 fogCol = mix(uFogColor, vec3(0.28, 0.04, 0.09), uEnraged * 0.48);

  if (uStageMode < 0.5) {
    vec2 ndc = vNeutralClip.xy / max(0.0001, vNeutralClip.w);
    float nsx = (ndc.x * 0.5 + 0.5) * 640.0;
    float nsy = (0.5 - ndc.y * 0.5) * 480.0;
    float uProj = mirror01(nsx / 640.0);
    float vProj = nsy <= uWallHorizonSy
      ? (nsy / max(1.0, uWallHorizonSy)) * uFloorV
      : uFloorV + ((nsy - uWallHorizonSy) / max(1.0, 480.0 - uWallHorizonSy)) * (1.0 - uFloorV);
    vec2 texUv = matType < 0.5
      ? vec2(clamp(uProj, 0.002, 0.998), clamp(vProj, uFloorV + 0.002, 0.998))
      : vec2(clamp(uProj, 0.002, 0.998), clamp(vProj, 0.002, 0.998));

    vec3 albedo = sampleSharp(uBgTex, texUv, uBgSize);
    vec2 stepUv = 1.0 / max(uBgSize, vec2(64.0));
    float hL = luma(texture(uBgTex, texUv - vec2(stepUv.x, 0.0)).rgb);
    float hR = luma(texture(uBgTex, texUv + vec2(stepUv.x, 0.0)).rgb);
    float hD = luma(texture(uBgTex, texUv - vec2(0.0, stepUv.y)).rgb);
    float hU = luma(texture(uBgTex, texUv + vec2(0.0, stepUv.y)).rgb);
    float hTL = luma(texture(uBgTex, texUv + vec2(-stepUv.x, -stepUv.y)).rgb);
    float hTR = luma(texture(uBgTex, texUv + vec2(stepUv.x, -stepUv.y)).rgb);
    float hBL = luma(texture(uBgTex, texUv + vec2(-stepUv.x, stepUv.y)).rgb);
    float hBR = luma(texture(uBgTex, texUv + vec2(stepUv.x, stepUv.y)).rgb);
    float gx = (hL * 2.0 + hTL + hBL) - (hR * 2.0 + hTR + hBR);
    float gy = (hD * 2.0 + hTL + hTR) - (hU * 2.0 + hBL + hBR);
    vec3 fn = normalize(vNorm);
    vec3 N = matType < 0.5 ? normalize(vec3(gx * 0.62, 1.0, gy * 0.62)) : normalize(vec3(gx * 0.34, -gy * 0.34, 1.0));

    vec3 V = normalize(uCamPos - vWorld);
    vec3 Lkey = normalize(uKeyDir);
    float shadow = matType < 0.5 ? sampleShadow(fn) : 1.0;
    float keyDiff = max(dot(N, Lkey), 0.0);
    vec3 shadowTint = mix(uAmbient * 0.42 + uFogColor * 0.48 + vec3(0.05, 0.04, 0.12), vec3(1.0), shadow);
    vec3 lightSum = uAmbient * 0.70 + vec3(0.26) + uKeyColor * (0.18 + 0.58 * keyDiff) * shadowTint;
    vec3 specSum = vec3(0.0);
    float gloss = matType < 0.5 ? uFloorGloss : vMat.y;
    if (gloss > 0.12 && keyDiff > 0.0) {
      vec3 Hk = normalize(Lkey + V);
      float spk = pow(max(dot(N, Hk), 0.0), 18.0 + gloss * 44.0);
      specSum += uKeyColor * spk * gloss * 0.42 * shadow;
    }
    if (matType < 0.5 && gloss > 0.24) {
      float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);
      float shimmer = pow(clamp(abs(gx) + abs(gy), 0.0, 1.0), 1.35)
        * (0.58 + 0.42 * sin(vWorld.x * 8.5 + vWorld.z * 6.5 + uTime * 1.9));
      specSum += (uKeyColor * 0.48 + uFloorSpecTint * 0.52) * fres * gloss * (0.14 + shimmer * 0.28) * shadow;
    }
    for (int i = 0; i < ${MAX_LIGHTS}; i++) {
      if (i >= uLightCount) break;
      vec3 toL = uLightPos[i].xyz - vWorld;
      float dist = length(toL);
      float rad = max(0.5, uLightPos[i].w);
      float att = clamp(1.0 - dist / rad, 0.0, 1.0);
      att = att * att / (1.0 + 0.14 * dist * dist);
      vec3 L = toL / max(0.001, dist);
      float ndl = max(dot(N, L), 0.0);
      lightSum += uLightCol[i].rgb * uLightCol[i].a * att * (0.26 + 0.80 * ndl);
      if (gloss > 0.05) {
        vec3 H = normalize(L + V);
        float sp = pow(max(dot(N, H), 0.0), 18.0 + gloss * 44.0);
        specSum += uLightCol[i].rgb * uLightCol[i].a * att * sp * gloss * 1.05;
      }
    }
    float brightSrc = smoothstep(0.68, 0.95, luma(albedo));
    float shadeMul = matType >= 0.5 ? uWallShade : 0.96;
    vec3 lit = albedo * lightSum * shadeMul + specSum * uFloorSpecTint * (0.34 + 0.66 * luma(albedo));
    lit += albedo * brightSrc * (matType >= 0.5 ? 0.68 : 0.22) * (0.94 + uBeatPulse * 0.16);
    if (matType < 0.5 && vMat.w < -0.5) {
      if (uHeroRing.w > 0.01) {
        float hd = length(vWorld.xz - uHeroRing.xy) / max(0.25, uHeroRing.z);
        float hr = exp(-pow((hd - 0.92) * 14.0, 2.0)) * 0.44 + exp(-pow((hd - 0.62) * 16.0, 2.0)) * 0.16;
        lit += uHeroRingCol * hr * uHeroRing.w;
      }
      if (uEnemyRing.w > 0.01) {
        float ed = length(vWorld.xz - uEnemyRing.xy) / max(0.25, uEnemyRing.z);
        float er = exp(-pow((ed - 0.94) * 13.0, 2.0)) * 0.48 + exp(-ed * ed * 2.4) * 0.12;
        lit += uEnemyRingCol * er * uEnemyRing.w;
      }
    }
    if (matType < 0.5) {
      float foreDark = smoothstep(1.85, 5.4, vWorld.z);
      lit *= mix(1.0, 0.46, foreDark);
      float backCrease = 1.0 - smoothstep(0.0, 0.72, vWorld.z + 3.35);
      lit *= mix(1.0, 0.76, backCrease);
    }
    float fogDist = max(0.0, -vWorld.z - 1.2);
    float fogAmt = 1.0 - exp(-fogDist * uFogDensity * 1.45);
    float mist = matType < 0.5 ? (1.0 - smoothstep(-4.2, -1.2, vWorld.z)) * 0.14 : exp(-max(0.0, vWorld.y) * 1.25) * 0.18;
    lit = mix(lit, fogCol, clamp(fogAmt + mist * 0.35, 0.0, 0.38));
    float coc = smoothstep(0.95, 4.4, abs(vWorld.z - uFocusZ)) * uDofStrength;
    if (matType >= 0.5) coc *= 0.42;
    fragColor = vec4(lit, clamp(coc, 0.0, 1.0));
    return;
  }

  if (matType > 1.5 && matType < 2.5) {
    vec3 bg;
    if (uHasBgTex > 0.5) {
      vec2 vistaUv = vec2(clamp(vUv.x, 0.004, 0.996), clamp(vUv.y * (uFloorV + 0.04), 0.004, min(0.996, uFloorV + 0.04)));
      bg = sampleSharp(uBgTex, vistaUv, uBgSize);
    } else {
      bg = proceduralVista(vUv);
    }
    float bright = smoothstep(0.72, 0.96, luma(bg));
    vec3 litBg = bg * (uAmbient * 0.85 + uKeyColor * 0.54 + vec3(0.22)) * uWallShade + bg * bright * 0.52;
    float lowMist = exp(-max(0.0, vWorld.y) * 0.85) * 0.34;
    litBg = mix(litBg, fogCol, clamp(0.22 + lowMist, 0.0, 0.62));
    fragColor = vec4(litBg, clamp(0.74 * uDofStrength, 0.0, 1.0));
    return;
  }

  vec3 albedo = sampleSharp(uAtlasAlbedo, vUv, vec2(256.0));
  if (matType > 4.5) {
    vec2 p = vWorld.xz * 0.95;
    float w1 = sin(p.x * 2.1 + uTime * 0.85 + sin(p.y * 1.9 - uTime * 0.6) * 1.5);
    float w2 = cos(p.y * 2.4 - uTime * 0.65 + sin(p.x * 2.2 + uTime * 0.5) * 1.4);
    float flow = (w1 + w2) * 0.25 + 0.5;
    float vein = smoothstep(0.42, 0.84, flow);
    float core = smoothstep(0.74, 0.96, flow);
    vec3 crust = vec3(0.08, 0.03, 0.035) * (0.65 + 0.5 * luma(albedo));
    vec3 magma = mix(crust, vec3(1.18, 0.17, 0.03), vein);
    magma = mix(magma, vec3(1.78, 0.64, 0.09), core);
    magma *= 0.92 + 0.12 * sin(uTime * 3.4 + vWorld.x * 1.4 + vWorld.z);
    float fogDistL = max(0.0, -vWorld.z - 1.1);
    float fogAmtL = 1.0 - exp(-fogDistL * uFogDensity * 1.8);
    magma = mix(magma, fogCol, clamp(fogAmtL * 0.65, 0.0, 0.48));
    float cocL = smoothstep(0.95, 4.4, abs(vWorld.z - uFocusZ)) * uDofStrength;
    fragColor = vec4(magma, clamp(cocL, 0.0, 1.0));
    return;
  }

  if (matType > 2.5 && matType < 3.5) {
    float pulse = (0.88 + 0.12 * sin(uTime * 5.8 + vWorld.x * 2.1 + vWorld.z)) * (0.94 + uBeatPulse * 0.22);
    vec3 em = albedo * vMat.z * pulse;
    if (uEnraged > 0.5) em = mix(em, em * vec3(1.22, 0.72, 0.78), 0.35);
    float cocEm = smoothstep(0.85, 4.2, abs(vWorld.z - uFocusZ)) * uDofStrength;
    if (vMat.w > 0.5) cocEm = max(cocEm, 0.90 * uDofStrength);
    fragColor = vec4(em, clamp(cocEm, 0.0, 1.0));
    return;
  }

  bool isWater = matType > 3.5 && matType < 4.5;
  vec3 fn = normalize(vNorm);
  vec3 N;
  float ao = 1.0;
  if (isWater) {
    vec2 wp = vWorld.xz;
    float rx = cos(wp.x * 3.2 + uTime * 1.5 + sin(wp.y * 2.3 - uTime * 1.1) * 1.4) * 0.16;
    float rz = sin(wp.y * 3.8 - uTime * 1.25 + cos(wp.x * 2.5 + uTime * 0.9) * 1.3) * 0.16;
    N = normalize(vec3(rx, 1.0, rz));
    float caustic = pow(clamp(0.5 + 0.5 * sin(wp.x * 4.2 - uTime * 1.6) * cos(wp.y * 4.6 + uTime * 1.3), 0.0, 1.0), 3.0);
    albedo = mix(vec3(0.05, 0.14, 0.24), albedo * 0.72 + vec3(0.05, 0.12, 0.18), 0.55) + uFloorSpecTint * caustic * 0.14;
  } else {
    vec3 tn = texture(uAtlasNormal, vUv).rgb * 2.0 - 1.0;
    vec3 T = abs(fn.y) > 0.5 ? vec3(1.0, 0.0, 0.0) : (abs(fn.z) > 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, -sign(fn.x)));
    vec3 B = abs(fn.y) > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, -1.0, 0.0);
    N = normalize(T * tn.x * 0.72 + B * tn.y * 0.72 + fn * tn.z);
    ao = vMat.z > 0.01 ? vMat.z : 1.0;
    if (matType < 0.5) {
      albedo = mix(albedo, albedo * (0.70 + uCurbTint * 0.78), 0.30);
    } else {
      albedo = mix(albedo, albedo * (0.62 + uPillarTint * 0.96), 0.38);
    }
  }

  vec3 V = normalize(uCamPos - vWorld);
  vec3 Lkey = normalize(uKeyDir);
  float shadow = isWater ? 1.0 : sampleShadow(fn);
  float keyDiff = max(dot(N, Lkey), 0.0);
  vec3 shadowTint = mix(uAmbient * 0.42 + uFogColor * 0.48 + vec3(0.05, 0.04, 0.12), vec3(1.0), shadow);
  vec3 lightSum = uAmbient * 0.90 * ao + uKeyColor * (0.16 * ao + 0.68 * keyDiff * mix(0.55, 1.0, ao)) * shadowTint;
  vec3 specSum = vec3(0.0);
  float gloss = isWater ? max(0.88, vMat.y) : vMat.y;
  if (gloss > 0.08 && keyDiff > 0.0) {
    vec3 Hk = normalize(Lkey + V);
    float spk = pow(max(dot(N, Hk), 0.0), (isWater ? 42.0 : 16.0) + gloss * 40.0);
    specSum += uKeyColor * spk * gloss * (isWater ? 0.95 : 0.42) * shadow;
  }

  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 toL = uLightPos[i].xyz - vWorld;
    float dist = length(toL);
    float rad = max(0.5, uLightPos[i].w);
    float att = clamp(1.0 - dist / rad, 0.0, 1.0);
    att = att * att / (1.0 + 0.14 * dist * dist);
    vec3 L = toL / max(0.001, dist);
    float ndl = max(dot(N, L), 0.0);
    lightSum += uLightCol[i].rgb * uLightCol[i].a * att * (0.20 + 0.80 * ndl) * mix(0.72, 1.0, ao);
    if (gloss > 0.05) {
      vec3 H = normalize(L + V);
      float sp = pow(max(dot(N, H), 0.0), (isWater ? 34.0 : 18.0) + gloss * 42.0);
      specSum += uLightCol[i].rgb * uLightCol[i].a * att * sp * gloss * (isWater ? 1.35 : 1.0);
    }
  }

  vec3 lit = albedo * lightSum + specSum * uFloorSpecTint * (isWater ? 0.85 : (0.28 + 0.72 * luma(albedo)));
  if (isWater) {
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.8);
    lit = mix(lit, mix(uBgBottom, uKeyColor, 0.35) * 0.72, fresnel * 0.56);
    float foam = exp(-pow((vWorld.z - 2.68) * 5.2, 2.0)) * 0.24 + exp(-pow((vWorld.z + 2.38) * 5.2, 2.0)) * 0.18;
    lit += mix(uBgAccent, vec3(0.95, 0.98, 1.0), 0.5) * foam * (0.7 + 0.3 * sin(vWorld.x * 5.0 + uTime * 2.2));
  }

  if (matType < 0.5 && vMat.w < -0.5) {
    if (uHeroRing.w > 0.01) {
      float hd = length(vWorld.xz - uHeroRing.xy) / max(0.25, uHeroRing.z);
      float hr = exp(-pow((hd - 0.92) * 14.0, 2.0)) * 0.44 + exp(-pow((hd - 0.62) * 16.0, 2.0)) * 0.16;
      lit += uHeroRingCol * hr * uHeroRing.w;
    }
    if (uEnemyRing.w > 0.01) {
      float ed = length(vWorld.xz - uEnemyRing.xy) / max(0.25, uEnemyRing.z);
      float er = exp(-pow((ed - 0.94) * 13.0, 2.0)) * 0.48 + exp(-ed * ed * 2.4) * 0.12;
      lit += uEnemyRingCol * er * uEnemyRing.w;
    }
  }

  if (matType < 0.5) {
    float foreDark = smoothstep(2.35, 5.4, vWorld.z);
    lit *= mix(1.0, 0.42, foreDark);
    if (vWorld.y < -0.1) lit *= 0.66;
  }
  if (vMat.w > 0.5) {
    lit *= 0.38;
  }

  float fogDist = max(0.0, -vWorld.z - 1.1);
  float fogAmt = 1.0 - exp(-fogDist * uFogDensity * 1.9);
  float mist = exp(-max(0.0, vWorld.y + 0.25) * 1.4) * (1.0 - smoothstep(-4.8, -1.6, vWorld.z)) * 0.20;
  lit = mix(lit, fogCol, clamp(fogAmt + mist, 0.0, 0.52));

  float zDist = abs(vWorld.z - uFocusZ);
  float coc = smoothstep(0.95, 4.4, zDist) * uDofStrength;
  if (vMat.w > 0.5) coc = max(coc, 0.94 * uDofStrength);
  fragColor = vec4(lit, clamp(coc, 0.0, 1.0));
}`;

const CONTACT_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aQuad;
uniform mat4 uViewProj;
uniform vec3 uActorFoot;
uniform vec2 uActorSize;
out vec2 vUv;
void main() {
  vec2 p = aQuad * 2.0 - 1.0;
  vec3 w = vec3(uActorFoot.x + p.x * uActorSize.x, uActorFoot.y + 0.014, uActorFoot.z + p.y * uActorSize.y);
  vUv = p;
  gl_Position = uViewProj * vec4(w, 1.0);
}`;

const CONTACT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform float uAlpha;
out vec4 fragColor;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = pow(1.0 - r * r, 1.6) * uAlpha;
  fragColor = vec4(0.03, 0.02, 0.07, a);
}`;

const SPRITE_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aQuad;
uniform mat4 uViewProj;
uniform vec3 uAnchor;
uniform vec2 uSize;
uniform float uFlipY;
uniform float uRotRad;
uniform vec2 uPivotUv;
out vec2 vUv;
out vec2 vLocal;
out vec3 vWorld;
void main() {
  float lx = (aQuad.x - uPivotUv.x) * uSize.x;
  float ly = uFlipY > 0.5 ? -(1.0 - aQuad.y) * uSize.y : (uPivotUv.y - aQuad.y) * uSize.y;
  float ca = cos(uRotRad);
  float sa = sin(uRotRad);
  float rx = lx * ca - ly * sa;
  float ry = lx * sa + ly * ca;
  vec3 worldPos = vec3(uAnchor.x + rx, uAnchor.y + ry, uAnchor.z);
  vWorld = worldPos;
  vLocal = aQuad;
  vUv = aQuad;
  gl_Position = uViewProj * vec4(worldPos, 1.0);
}`;

const SPRITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vLocal;
in vec3 vWorld;
uniform sampler2D uTex;
uniform vec2 uTexSize;
uniform vec3 uAmbient;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec4 uLightPos[${MAX_LIGHTS}];
uniform vec4 uLightCol[${MAX_LIGHTS}];
uniform int uLightCount;
uniform float uReflectAlpha;
uniform float uRimBoost;
uniform vec3 uRimColor;
uniform float uEmissive;
uniform float uBrightness;
uniform float uDofAmount;
out vec4 fragColor;

void main() {
  vec4 tex = texture(uTex, vUv);
  if (tex.a < 0.15) discard;
  vec3 base = tex.rgb;
  if (uEmissive > 0.5) {
    fragColor = vec4(base * uBrightness, clamp(uDofAmount, 0.0, 1.0));
    return;
  }
  if (uReflectAlpha > 0.005) {
    float fade = pow(vLocal.y, 1.45) * uReflectAlpha;
    fragColor = vec4(base * uKeyColor * 0.72, tex.a * fade);
    return;
  }
  vec2 stepUv = 1.0 / max(uTexSize, vec2(16.0));
  float aL = texture(uTex, vUv - vec2(stepUv.x, 0.0)).a;
  float aR = texture(uTex, vUv + vec2(stepUv.x, 0.0)).a;
  float aU = texture(uTex, vUv - vec2(0.0, stepUv.y)).a;
  float aD = texture(uTex, vUv + vec2(0.0, stepUv.y)).a;
  float rimMask = clamp(4.0 - (aL + aR + aU + aD), 0.0, 1.0);
  vec2 edgeDir = vec2(aR - aL, aD - aU);
  vec3 N = normalize(vec3(-edgeDir.x * 0.55, -edgeDir.y * 0.45 + 0.12, 0.85));

  vec3 lightSum = uAmbient * 0.45 + vec3(0.56) + uKeyColor * (0.18 + 0.22 * max(dot(N, normalize(uKeyDir)), 0.0));
  vec3 rimLight = uKeyColor * rimMask * max(0.0, dot(normalize(vec3(-edgeDir, 0.22)), normalize(uKeyDir))) * 0.45;
  for (int i = 0; i < ${MAX_LIGHTS}; i++) {
    if (i >= uLightCount) break;
    vec3 toL = uLightPos[i].xyz - vWorld;
    float dist = length(toL);
    float rad = max(0.5, uLightPos[i].w);
    float att = clamp(1.0 - dist / rad, 0.0, 1.0);
    att = att * att / (1.0 + 0.16 * dist * dist);
    vec3 L = toL / max(0.001, dist);
    lightSum += uLightCol[i].rgb * uLightCol[i].a * att * 0.24;
    float side = max(0.0, dot(normalize(vec3(-edgeDir, 0.28)), L));
    rimLight += uLightCol[i].rgb * uLightCol[i].a * att * rimMask * (0.28 + 0.72 * side);
  }
  float lum = dot(base, vec3(0.299, 0.587, 0.114));
  float outlineKeep = smoothstep(0.08, 0.24, lum);
  vec3 lit = base * mix(vec3(0.76), min(lightSum, vec3(1.18)), outlineKeep);
  lit += rimLight * outlineKeep * 0.42 + uRimColor * rimMask * uRimBoost;
  lit *= uBrightness;
  fragColor = vec4(lit, clamp(uDofAmount, 0.0, 1.0));
}`;

const ADDITIVE_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec2 aUv;
layout(location = 2) in vec4 aCol;
layout(location = 3) in float aSoft;
uniform mat4 uViewProj;
out vec2 vUv;
out vec4 vCol;
out float vSoft;
void main() {
  vUv = aUv;
  vCol = aCol;
  vSoft = aSoft;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}`;

const ADDITIVE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in vec4 vCol;
in float vSoft;
out vec4 fragColor;
void main() {
  if (vSoft < 0.0) {
    float across = sin(vUv.x * 3.14159265);
    float down = pow(1.0 - vUv.y, 1.25) * smoothstep(0.0, 0.14, vUv.y);
    float shape = pow(max(0.0, across), 1.8) * down;
    fragColor = vec4(vCol.rgb * shape * vCol.a, 0.0);
    return;
  }
  vec2 d = vUv * 2.0 - 1.0;
  float r = length(d);
  if (r > 1.0) discard;
  float core = smoothstep(1.0, clamp(1.0 - vSoft, 0.05, 0.9), r);
  float glow = exp(-r * r * (2.6 + (1.0 - vSoft) * 2.8));
  float a = (core * 0.65 + glow * 0.55) * vCol.a;
  fragColor = vec4(vCol.rgb * a, 0.0);
}`;

const QUAD_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uStep;
uniform float uBrightOnly;
out vec4 fragColor;

vec3 sampleSrc(vec2 uv) {
  vec3 c = texture(uTex, clamp(uv, vec2(0.002), vec2(0.998))).rgb;
  if (uBrightOnly > 0.5) {
    float l = dot(c, vec3(0.299, 0.587, 0.114));
    float hi = max(c.r, max(c.g, c.b));
    float knee = smoothstep(0.74, 1.15, l) * 0.85 + max(0.0, hi - 0.90) * 1.4;
    return c * knee;
  }
  return c;
}

void main() {
  vec3 sum = sampleSrc(vUv) * 0.227027;
  sum += sampleSrc(vUv + uStep * 1.384615) * 0.316216;
  sum += sampleSrc(vUv - uStep * 1.384615) * 0.316216;
  sum += sampleSrc(vUv + uStep * 3.230769) * 0.070270;
  sum += sampleSrc(vUv - uStep * 3.230769) * 0.070270;
  fragColor = vec4(sum, 1.0);
}`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uSceneTex;
uniform sampler2D uDofTex;
uniform sampler2D uBloomTex;
uniform sampler2D uBloomWideTex;
uniform float uBloomStrength;
uniform float uVignette;
uniform vec3 uGrade;
uniform float uEnraged;
uniform float uImpactFlash;
out vec4 fragColor;

vec3 filmic(vec3 x) {
  vec3 a = x * (2.51 * x + 0.03);
  vec3 b = x * (2.43 * x + 0.59) + 0.14;
  return clamp(a / b, 0.0, 1.0);
}

void main() {
  vec4 scene = texture(uSceneTex, vUv);
  vec3 dof = texture(uDofTex, vUv).rgb;
  vec3 bloom = texture(uBloomTex, vUv).rgb;
  vec3 bloomWide = texture(uBloomWideTex, vUv).rgb;
  vec3 col = mix(scene.rgb, dof, clamp(scene.a, 0.0, 0.88));
  col += (bloom * 0.54 + bloomWide * 0.44) * uBloomStrength;
  col *= uGrade;
  if (uEnraged > 0.5) {
    col = mix(col, col * vec3(1.16, 0.88, 0.92), 0.42);
  }
  if (uImpactFlash > 0.01) {
    col *= 1.0 + uImpactFlash * 0.24;
  }
  col = filmic(col * 1.14);
  col = pow(col, vec3(1.04));
  vec2 centered = (vUv - 0.5) * vec2(1.18, 1.04);
  float vig = 1.0 - dot(centered, centered) * uVignette;
  col *= clamp(vig, 0.36, 1.0);
  fragColor = vec4(col, 1.0);
}`;

function compileShader(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(log || 'Shader compile error');
  }
  return s;
}

function createProgram(gl, vs, fs) {
  const p = gl.createProgram();
  const v = compileShader(gl, gl.VERTEX_SHADER, vs);
  const f = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(log || 'Program link error');
  }
  return p;
}

function createTarget(gl, w, h, withDepth) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  let depth = null;
  if (withDepth) {
    depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, depth, w, h };
}

function destroyTarget(gl, t) {
  if (!t) return;
  if (t.fbo) gl.deleteFramebuffer(t.fbo);
  if (t.tex) gl.deleteTexture(t.tex);
  if (t.depth) gl.deleteRenderbuffer(t.depth);
}

function createShadowTarget(gl, size) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, size, size, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);
  const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex, size, ok };
}

function uploadRgbaTex(gl, w, h, data, smooth = false) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
  const filter = smooth ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, smooth ? gl.LINEAR_MIPMAP_LINEAR : gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  if (smooth) gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return { tex, w, h };
}

export function createStudioRenderer(canvas) {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: true,
    stencil: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const stageProg = createProgram(gl, STAGE_VERT, STAGE_FRAG);
  const shadowMeshProg = createProgram(gl, SHADOW_MESH_VERT, SHADOW_DEPTH_FRAG);
  const shadowSpriteProg = createProgram(gl, SHADOW_SPRITE_VERT, SHADOW_SPRITE_FRAG);
  const contactProg = createProgram(gl, CONTACT_VERT, CONTACT_FRAG);
  const spriteProg = createProgram(gl, SPRITE_VERT, SPRITE_FRAG);
  const additiveProg = createProgram(gl, ADDITIVE_VERT, ADDITIVE_FRAG);
  const blurProg = createProgram(gl, QUAD_VERT, BLUR_FRAG);
  const compProg = createProgram(gl, QUAD_VERT, COMPOSITE_FRAG);

  const stageLoc = Object.fromEntries([
    'uViewProj', 'uNeutralVP', 'uLightVP', 'uBeats', 'uAnimPivot', 'uBgTex', 'uAtlasAlbedo', 'uAtlasNormal', 'uShadowMap',
    'uHasBgTex', 'uStageMode', 'uBgSize', 'uBgTop', 'uBgBottom', 'uBgAccent', 'uVistaStyle',
    'uUseShadows', 'uShadowTexel', 'uTime', 'uBeatPulse', 'uFloorV', 'uWallHorizonSy', 'uFloorGloss', 'uCamPos', 'uAmbient', 'uKeyDir',
    'uKeyColor', 'uFloorSpecTint', 'uWallShade', 'uFogColor', 'uFogDensity', 'uPillarTint',
    'uCurbTint', 'uEnraged', 'uDofStrength', 'uFocusZ', 'uHeroRing', 'uHeroRingCol',
    'uEnemyRing', 'uEnemyRingCol', 'uLightPos', 'uLightCol', 'uLightCount',
  ].map(n => [n, gl.getUniformLocation(stageProg, n)]));

  const shadowMeshLoc = {
    uLightVP: gl.getUniformLocation(shadowMeshProg, 'uLightVP'),
    uBeats: gl.getUniformLocation(shadowMeshProg, 'uBeats'),
    uAnimPivot: gl.getUniformLocation(shadowMeshProg, 'uAnimPivot'),
  };
  const shadowSpriteLoc = {
    uLightVP: gl.getUniformLocation(shadowSpriteProg, 'uLightVP'),
    uAnchor: gl.getUniformLocation(shadowSpriteProg, 'uAnchor'),
    uSize: gl.getUniformLocation(shadowSpriteProg, 'uSize'),
    uRotRad: gl.getUniformLocation(shadowSpriteProg, 'uRotRad'),
    uPivotUv: gl.getUniformLocation(shadowSpriteProg, 'uPivotUv'),
    uTex: gl.getUniformLocation(shadowSpriteProg, 'uTex'),
  };
  const contactLoc = {
    uViewProj: gl.getUniformLocation(contactProg, 'uViewProj'),
    uActorFoot: gl.getUniformLocation(contactProg, 'uActorFoot'),
    uActorSize: gl.getUniformLocation(contactProg, 'uActorSize'),
    uAlpha: gl.getUniformLocation(contactProg, 'uAlpha'),
  };
  const spriteLoc = Object.fromEntries([
    'uViewProj', 'uAnchor', 'uSize', 'uFlipY', 'uRotRad', 'uPivotUv', 'uTex', 'uTexSize', 'uAmbient',
    'uKeyDir', 'uKeyColor', 'uLightPos', 'uLightCol', 'uLightCount',
    'uReflectAlpha', 'uRimBoost', 'uRimColor', 'uEmissive', 'uBrightness', 'uDofAmount',
  ].map(n => [n, gl.getUniformLocation(spriteProg, n)]));
  const addLoc = { uViewProj: gl.getUniformLocation(additiveProg, 'uViewProj') };
  const blurLoc = {
    uTex: gl.getUniformLocation(blurProg, 'uTex'),
    uStep: gl.getUniformLocation(blurProg, 'uStep'),
    uBrightOnly: gl.getUniformLocation(blurProg, 'uBrightOnly'),
  };
  const compLoc = Object.fromEntries([
    'uSceneTex', 'uDofTex', 'uBloomTex', 'uBloomWideTex', 'uBloomStrength', 'uVignette', 'uGrade', 'uEnraged', 'uImpactFlash',
  ].map(n => [n, gl.getUniformLocation(compProg, n)]));

  let atlasData = buildDioramaAtlasData(2.2);
  let atlasAlbedo = uploadRgbaTex(gl, atlasData.width, atlasData.height, atlasData.albedo, true);
  let atlasNormal = uploadRgbaTex(gl, atlasData.width, atlasData.height, atlasData.normal, false);
  const dummyBg = uploadRgbaTex(gl, 2, 2, new Uint8Array(16).fill(255), false);
  const flatNormal = uploadRgbaTex(gl, 2, 2, new Uint8Array([
    128, 128, 255, 255, 128, 128, 255, 255, 128, 128, 255, 255, 128, 128, 255, 255,
  ]), false);
  let customBg = null;
  const externalAssets = new Map();
  let externalDrawList = [];

  const sampleSprites = new Map();
  for (const style of SAMPLE_SPRITE_STYLES) {
    const s = buildSampleSpriteRgba(style);
    sampleSprites.set(style, uploadRgbaTex(gl, s.width, s.height, s.rgba, false));
  }
  const customSprites = new Map();
  const cutoutTextures = new Map();

  const artBuilt = buildArtDioramaMesh();
  const artMeshVao = gl.createVertexArray();
  const artMeshVbo = gl.createBuffer();
  gl.bindVertexArray(artMeshVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, artMeshVbo);
  gl.bufferData(gl.ARRAY_BUFFER, artBuilt.data, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 48, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 48, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 48, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 48, 32);
  gl.bindVertexArray(null);
  const artMeshVertexCount = artBuilt.vertexCount;

  const unitQuadVao = gl.createVertexArray();
  gl.bindVertexArray(unitQuadVao);
  const unitQuadVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, unitQuadVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const screenQuadVao = gl.createVertexArray();
  gl.bindVertexArray(screenQuadVao);
  const screenQuadVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, screenQuadVbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const maxAddVerts = 1600;
  const addBuf = new Float32Array(maxAddVerts * 10);
  const addVao = gl.createVertexArray();
  gl.bindVertexArray(addVao);
  const addVbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, addVbo);
  gl.bufferData(gl.ARRAY_BUFFER, addBuf.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 40, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 40, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 40, 20);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 40, 36);
  gl.bindVertexArray(null);

  const meshVao = gl.createVertexArray();
  const meshVbo = gl.createBuffer();
  gl.bindVertexArray(meshVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, meshVbo);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 48, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 48, 12);
  gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 48, 24);
  gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 48, 32);
  gl.bindVertexArray(null);
  let meshVertexCount = 0;
  let meshAnimPivot = [0, 0, 0, 0];

  let outW = 1280;
  let outH = 960;
  let sceneTarget = null;
  let dofA = null, dofB = null, bloomA = null, bloomB = null, bloomWideA = null, bloomWideB = null;
  const shadowTarget = createShadowTarget(gl, 1024);

  function ensureSize(w, h) {
    if (sceneTarget && outW === w && outH === h) return;
    outW = w;
    outH = h;
    canvas.width = w;
    canvas.height = h;
    destroyTarget(gl, sceneTarget);
    destroyTarget(gl, dofA);
    destroyTarget(gl, dofB);
    destroyTarget(gl, bloomA);
    destroyTarget(gl, bloomB);
    destroyTarget(gl, bloomWideA);
    destroyTarget(gl, bloomWideB);
    sceneTarget = createTarget(gl, w, h, true);
    dofA = createTarget(gl, Math.round(w / 2), Math.round(h / 2), false);
    dofB = createTarget(gl, Math.round(w / 2), Math.round(h / 2), false);
    bloomA = createTarget(gl, Math.round(w / 4), Math.round(h / 4), false);
    bloomB = createTarget(gl, Math.round(w / 4), Math.round(h / 4), false);
    bloomWideA = createTarget(gl, Math.max(40, Math.round(w / 8)), Math.max(30, Math.round(h / 8)), false);
    bloomWideB = createTarget(gl, Math.max(40, Math.round(w / 8)), Math.max(30, Math.round(h / 8)), false);
  }
  ensureSize(1280, 960);

  const lightPosArr = new Float32Array(MAX_LIGHTS * 4);
  const lightColArr = new Float32Array(MAX_LIGHTS * 4);

  function registerExternalModelAsset(assetId, parsedGlb, img = null) {
    const prev = externalAssets.get(assetId);
    if (prev?.tex) gl.deleteTexture(prev.tex);
    let texEntry;
    if (img) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      texEntry = { tex, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
    } else {
      const c = parsedGlb.baseColorFactor ?? [0.85, 0.85, 0.9, 1];
      const rgba = new Uint8Array(16);
      for (let i = 0; i < 4; i++) {
        rgba[i * 4] = Math.round(c[0] * 255);
        rgba[i * 4 + 1] = Math.round(c[1] * 255);
        rgba[i * 4 + 2] = Math.round(c[2] * 255);
        rgba[i * 4 + 3] = 255;
      }
      texEntry = uploadRgbaTex(gl, 2, 2, rgba, false);
    }
    externalAssets.set(assetId, { parsed: parsedGlb, tex: texEntry.tex });
  }

  function rebuildExternalDraws(stage) {
    for (const item of externalDrawList) {
      gl.deleteVertexArray(item.vao);
      gl.deleteBuffer(item.vbo);
    }
    externalDrawList = [];
    for (const placement of stage.geometry?.externalModels ?? []) {
      if (placement.hidden) continue;
      const asset = externalAssets.get(placement.assetId);
      if (!asset || !asset.parsed.vertexCount) continue;
      const verts = buildExternalModelVertices(asset.parsed, placement);
      const vao = gl.createVertexArray();
      const vbo = gl.createBuffer();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 48, 0);
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 48, 12);
      gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 48, 24);
      gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 48, 32);
      gl.bindVertexArray(null);
      externalDrawList.push({ vao, vbo, count: asset.parsed.vertexCount, tex: asset.tex });
    }
  }

  function uploadStageGeometry(stage) {
    const built = buildStageMesh(stage);
    gl.bindBuffer(gl.ARRAY_BUFFER, meshVbo);
    gl.bufferData(gl.ARRAY_BUFFER, built.data, gl.DYNAMIC_DRAW);
    meshVertexCount = built.vertexCount;
    meshAnimPivot = built.animPivot ?? [0, 0, 0, 0];
    rebuildExternalDraws(stage);
    return built;
  }

  function updateAtlas(normalStrength = 2.2, customAlbedoRgba = null, customNormalRgba = null) {
    atlasData = customAlbedoRgba
      ? { width: 256, height: 256, albedo: customAlbedoRgba, normal: customNormalRgba }
      : buildDioramaAtlasData(normalStrength);
    gl.deleteTexture(atlasAlbedo.tex);
    gl.deleteTexture(atlasNormal.tex);
    atlasAlbedo = uploadRgbaTex(gl, atlasData.width, atlasData.height, atlasData.albedo, true);
    atlasNormal = uploadRgbaTex(gl, atlasData.width, atlasData.height, atlasData.normal, false);
  }

  function setBackdropImage(img) {
    if (customBg) {
      gl.deleteTexture(customBg.tex);
      customBg = null;
    }
    if (!img) return;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    customBg = { tex, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
  }

  function setCustomAtlasImage(img, normalStrength = 2.4) {
    if (!img) {
      updateAtlas(normalStrength);
      return;
    }
    const w = img.naturalWidth || img.width || 256;
    const h = img.naturalHeight || img.height || 256;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const rgba = new Uint8Array(ctx.getImageData(0, 0, w, h).data);
    const norm = generateNormalFromRgba(rgba, w, h, normalStrength, true);
    atlasData = { width: w, height: h, albedo: rgba, normal: norm };
    gl.deleteTexture(atlasAlbedo.tex);
    gl.deleteTexture(atlasNormal.tex);
    atlasAlbedo = uploadRgbaTex(gl, w, h, rgba, true);
    atlasNormal = uploadRgbaTex(gl, w, h, norm, false);
  }

  function setCutoutImage(cutoutId, img) {
    const prev = cutoutTextures.get(cutoutId);
    if (prev) {
      gl.deleteTexture(prev.tex);
      cutoutTextures.delete(cutoutId);
    }
    if (!img) return;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    cutoutTextures.set(cutoutId, { tex, w: img.naturalWidth || img.width || 64, h: img.naturalHeight || img.height || 64 });
  }

  function setAnchorSpriteImage(anchorId, img) {
    const prev = customSprites.get(anchorId);
    if (prev) {
      gl.deleteTexture(prev.tex);
      customSprites.delete(anchorId);
    }
    if (!img) return;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    customSprites.set(anchorId, { tex, w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });
  }

  function spriteEntryFor(anchor) {
    return customSprites.get(anchor.id)
      ?? sampleSprites.get(anchor.spriteStyle)
      ?? sampleSprites.get(anchor.role === 'player' ? 'adventurer' : anchor.role === 'enemy' ? 'slime_orb' : 'npc_villager');
  }

  function runBlur(srcTex, dst, sx, sy, brightOnly) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.useProgram(blurProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, srcTex);
    gl.uniform1i(blurLoc.uTex, 0);
    gl.uniform2f(blurLoc.uStep, sx, sy);
    gl.uniform1f(blurLoc.uBrightOnly, brightOnly ? 1 : 0);
    gl.bindVertexArray(screenQuadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  function render(stage, state = {}) {
    const aspect = stage.meta?.aspect ?? [4, 3];
    const targetH = Math.round(1280 * (aspect[1] / Math.max(0.01, aspect[0])));
    ensureSize(1280, Math.max(480, Math.min(1080, targetH)));

    const cam = computeStageCamera(stage, state);
    const keyDir = stage.lighting?.keyLight?.dir ?? [0.22, 0.8, 0.56];
    const keyColor = stage.lighting?.keyLight?.color ?? [1, 0.85, 0.65];
    const lightVP = computeLightViewProj(keyDir);
    const lights = buildFrameLights(stage, state);

    lightPosArr.fill(0);
    lightColArr.fill(0);
    const lightCount = Math.min(MAX_LIGHTS, lights.length);
    for (let i = 0; i < lightCount; i++) {
      const l = lights[i];
      lightPosArr[i * 4] = l.x;
      lightPosArr[i * 4 + 1] = l.y;
      lightPosArr[i * 4 + 2] = l.z;
      lightPosArr[i * 4 + 3] = l.radius;
      lightColArr[i * 4] = l.color[0];
      lightColArr[i * 4 + 1] = l.color[1];
      lightColArr[i * 4 + 2] = l.color[2];
      lightColArr[i * 4 + 3] = l.intensity;
    }

    const anchors = stage.anchors ?? [];
    const cutouts = (stage.geometry?.cutouts ?? []).filter(c => !c.hidden);
    const beats = state.beats ?? 0;
    const beatPulse = state.beatSync ? Math.exp(-(beats - Math.floor(beats)) * 5.0) : 0.35;
    const useArtProjection = Boolean(stage.backdrop?.artFirst && customBg);
    const nvp = neutralViewProj(stage);
    const wallZ = -3.35;
    const wallBaseClipY = (nvp[9] * wallZ + nvp[13]) / (nvp[11] * wallZ + nvp[15]);
    const wallHorizonSy = (0.5 - wallBaseClipY * 0.5) * STAGE_H;

    function cutoutTransform(c) {
      let y = c.pos[1];
      let rot = 0;
      const ph = c.phase ?? 0;
      const amp = c.swingAmp ?? 0.36;
      if (state.beatSync) {
        if (c.beatAnim === 'pendulum') rot = Math.cos(beats * Math.PI + ph) * amp;
        else if (c.beatAnim === 'sway') rot = Math.sin(beats * Math.PI + ph) * amp;
        else if (c.beatAnim === 'bob') y += Math.sin(beats * Math.PI * 0.5 + ph) * 0.13;
      }
      return { x: c.pos[0], y, z: c.pos[2], rot };
    }
    function cutoutEntryFor(c) {
      return cutoutTextures.get(c.id) ?? sampleSprites.get('slime_orb');
    }

    // 1. Shadow Pass
    if (shadowTarget.ok) {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, shadowTarget.fbo);
      gl.viewport(0, 0, shadowTarget.size, shadowTarget.size);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      gl.clear(gl.DEPTH_BUFFER_BIT);

      if (!useArtProjection) {
        gl.useProgram(shadowMeshProg);
        gl.uniformMatrix4fv(shadowMeshLoc.uLightVP, false, lightVP);
        gl.uniform1f(shadowMeshLoc.uBeats, beats);
        gl.uniform4fv(shadowMeshLoc.uAnimPivot, meshAnimPivot);
        gl.bindVertexArray(meshVao);
        gl.drawArrays(gl.TRIANGLES, 0, meshVertexCount);
        for (const ext of externalDrawList) {
          gl.bindVertexArray(ext.vao);
          gl.drawArrays(gl.TRIANGLES, 0, ext.count);
        }
      }

      gl.useProgram(shadowSpriteProg);
      gl.uniformMatrix4fv(shadowSpriteLoc.uLightVP, false, lightVP);
      gl.bindVertexArray(unitQuadVao);
      for (const anchor of anchors) {
        if (anchor.role === 'trigger') continue;
        const entry = spriteEntryFor(anchor);
        if (!entry) continue;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, entry.tex);
        gl.uniform1i(shadowSpriteLoc.uTex, 0);
        gl.uniform3f(shadowSpriteLoc.uAnchor, anchor.pos[0], anchor.pos[1], anchor.pos[2]);
        gl.uniform2f(shadowSpriteLoc.uSize, anchor.widthWorld ?? 1.8, anchor.heightWorld ?? 1.8);
        gl.uniform1f(shadowSpriteLoc.uRotRad, 0);
        gl.uniform2f(shadowSpriteLoc.uPivotUv, 0.5, 1.0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      for (const c of cutouts) {
        if (c.castShadow === false) continue;
        const cEntry = cutoutEntryFor(c);
        if (!cEntry) continue;
        const tr = cutoutTransform(c);
        const pv = c.pivotUv ?? [0.5, 1.0];
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, cEntry.tex);
        gl.uniform1i(shadowSpriteLoc.uTex, 0);
        gl.uniform3f(shadowSpriteLoc.uAnchor, tr.x, tr.y, tr.z);
        gl.uniform2f(shadowSpriteLoc.uSize, c.size[0], c.size[1]);
        gl.uniform1f(shadowSpriteLoc.uRotRad, tr.rot);
        gl.uniform2f(shadowSpriteLoc.uPivotUv, pv[0], pv[1]);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }

    // 2. Main Scene Pass
    const fogColor = stage.atmosphere?.fogColor ?? [0.08, 0.05, 0.16];
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTarget.fbo);
    gl.viewport(0, 0, outW, outH);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.clearColor(fogColor[0], fogColor[1], fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.useProgram(stageProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, customBg ? customBg.tex : dummyBg.tex);
    gl.uniform1i(stageLoc.uBgTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, atlasAlbedo.tex);
    gl.uniform1i(stageLoc.uAtlasAlbedo, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, atlasNormal.tex);
    gl.uniform1i(stageLoc.uAtlasNormal, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, shadowTarget.tex);
    gl.uniform1i(stageLoc.uShadowMap, 3);

    gl.uniform1f(stageLoc.uHasBgTex, customBg ? 1 : 0);
    gl.uniform1f(stageLoc.uStageMode, useArtProjection ? 0 : 1);
    gl.uniform2f(stageLoc.uBgSize, customBg ? customBg.w : 256, customBg ? customBg.h : 256);
    gl.uniform3fv(stageLoc.uBgTop, stage.backdrop?.colorTop ?? [0.06, 0.05, 0.16]);
    gl.uniform3fv(stageLoc.uBgBottom, stage.backdrop?.colorBottom ?? [0.16, 0.10, 0.28]);
    gl.uniform3fv(stageLoc.uBgAccent, stage.backdrop?.accentColor ?? [0.95, 0.85, 1.0]);
    const vistaStyleMap = { default: 0, sunset: 1, aurora: 2, clocktower: 3, carnival: 4, belfry: 5 };
    gl.uniform1f(stageLoc.uVistaStyle, vistaStyleMap[stage.backdrop?.vistaStyle] ?? 0);
    gl.uniform1f(stageLoc.uUseShadows, shadowTarget.ok ? 1 : 0);
    gl.uniform1f(stageLoc.uShadowTexel, 1 / shadowTarget.size);
    gl.uniform1f(stageLoc.uTime, state.time ?? 0);
    gl.uniform1f(stageLoc.uBeats, beats);
    gl.uniform1f(stageLoc.uBeatPulse, beatPulse);
    gl.uniform4fv(stageLoc.uAnimPivot, meshAnimPivot);
    gl.uniformMatrix4fv(stageLoc.uViewProj, false, cam.viewProj);
    gl.uniformMatrix4fv(stageLoc.uNeutralVP, false, nvp);
    gl.uniformMatrix4fv(stageLoc.uLightVP, false, lightVP);
    gl.uniform1f(stageLoc.uFloorV, stage.backdrop?.floorV ?? 0.65);
    gl.uniform1f(stageLoc.uWallHorizonSy, wallHorizonSy);
    gl.uniform1f(stageLoc.uFloorGloss, stage.lighting?.floorGloss ?? 0.4);
    gl.uniform3fv(stageLoc.uCamPos, cam.eye);
    gl.uniform3fv(stageLoc.uAmbient, stage.lighting?.ambient ?? [0.22, 0.18, 0.34]);
    gl.uniform3fv(stageLoc.uKeyDir, keyDir);
    gl.uniform3fv(stageLoc.uKeyColor, keyColor);
    gl.uniform3fv(stageLoc.uFloorSpecTint, stage.lighting?.floorSpecTint ?? [1, 0.82, 0.55]);
    gl.uniform1f(stageLoc.uWallShade, stage.backdrop?.wallShade ?? 0.78);
    gl.uniform3fv(stageLoc.uFogColor, fogColor);
    gl.uniform1f(stageLoc.uFogDensity, stage.atmosphere?.fogDensity ?? 0.06);
    gl.uniform3fv(stageLoc.uPillarTint, stage.lighting?.pillarTint ?? [0.42, 0.36, 0.56]);
    gl.uniform3fv(stageLoc.uCurbTint, stage.lighting?.curbTint ?? [0.5, 0.42, 0.64]);
    gl.uniform1f(stageLoc.uEnraged, state.enraged ? 1 : 0);
    gl.uniform1f(stageLoc.uDofStrength, stage.postProcess?.dofStrength ?? 0.78);
    gl.uniform1f(stageLoc.uFocusZ, stage.camera?.focusZ ?? 0);

    const playerAnchor = anchors.find(a => a.role === 'player');
    const enemyAnchor = anchors.find(a => a.role === 'enemy');
    if (playerAnchor) {
      gl.uniform4f(stageLoc.uHeroRing, playerAnchor.pos[0], playerAnchor.pos[2], 0.82 + beatPulse * 0.08, 0.38 + beatPulse * 0.42);
      gl.uniform3fv(stageLoc.uHeroRingCol, playerAnchor.ringColor ?? [0.42, 0.94, 0.68]);
    } else {
      gl.uniform4f(stageLoc.uHeroRing, 0, 0, 1, 0);
      gl.uniform3f(stageLoc.uHeroRingCol, 0, 0, 0);
    }
    if (enemyAnchor) {
      gl.uniform4f(stageLoc.uEnemyRing, enemyAnchor.pos[0], enemyAnchor.pos[2], 0.94, state.enraged ? 0.88 : 0.32 + beatPulse * 0.2);
      gl.uniform3fv(stageLoc.uEnemyRingCol, state.enraged ? [1.0, 0.28, 0.36] : (enemyAnchor.ringColor ?? [0.76, 0.56, 1.0]));
    } else {
      gl.uniform4f(stageLoc.uEnemyRing, 0, 0, 1, 0);
      gl.uniform3f(stageLoc.uEnemyRingCol, 0, 0, 0);
    }

    gl.uniform4fv(stageLoc.uLightPos, lightPosArr);
    gl.uniform4fv(stageLoc.uLightCol, lightColArr);
    gl.uniform1i(stageLoc.uLightCount, lightCount);
    gl.bindVertexArray(useArtProjection ? artMeshVao : meshVao);
    gl.drawArrays(gl.TRIANGLES, 0, useArtProjection ? artMeshVertexCount : meshVertexCount);
    if (!useArtProjection && externalDrawList.length > 0) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, flatNormal.tex);
      for (const ext of externalDrawList) {
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, ext.tex);
        gl.bindVertexArray(ext.vao);
        gl.drawArrays(gl.TRIANGLES, 0, ext.count);
      }
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasAlbedo.tex);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, atlasNormal.tex);
    }

    // 3. Contact shadows
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    gl.depthMask(false);
    gl.useProgram(contactProg);
    gl.uniformMatrix4fv(contactLoc.uViewProj, false, cam.viewProj);
    gl.bindVertexArray(unitQuadVao);
    for (const anchor of anchors) {
      if (anchor.role === 'trigger') continue;
      gl.uniform3f(contactLoc.uActorFoot, anchor.pos[0], anchor.pos[1], anchor.pos[2]);
      gl.uniform2f(contactLoc.uActorSize, (anchor.widthWorld ?? 1.8) * 0.42, 0.28);
      gl.uniform1f(contactLoc.uAlpha, 0.54);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // 4. Volumetric light rays
    let addVerts = 0;
    function pushAddQuad(p0, p1, p2, p3, col, alpha, soft) {
      if (addVerts + 6 > maxAddVerts) return;
      const pts = [
        [p0, 0, 0], [p1, 1, 0], [p2, 1, 1],
        [p0, 0, 0], [p2, 1, 1], [p3, 0, 1],
      ];
      for (const [p, u, v] of pts) {
        const o = addVerts * 10;
        addBuf[o] = p[0]; addBuf[o + 1] = p[1]; addBuf[o + 2] = p[2];
        addBuf[o + 3] = u; addBuf[o + 4] = v;
        addBuf[o + 5] = col[0]; addBuf[o + 6] = col[1]; addBuf[o + 7] = col[2]; addBuf[o + 8] = alpha;
        addBuf[o + 9] = soft;
        addVerts++;
      }
    }

    const rayPulse = 0.88 + 0.12 * Math.sin((state.time ?? 0) * 1.4) + beatPulse * 0.1;
    for (const ray of stage.lighting?.lightRays ?? []) {
      const hw = ray.width * 0.5;
      const col = state.enraged ? [Math.min(1, ray.color[0] * 1.15 + 0.2), ray.color[1] * 0.65, ray.color[2] * 0.65] : ray.color;
      pushAddQuad(
        [ray.top[0] - hw * 0.7, ray.top[1], ray.z],
        [ray.top[0] + hw * 0.7, ray.top[1], ray.z],
        [ray.bot[0] + hw, ray.bot[1], ray.z + 0.8],
        [ray.bot[0] - hw, ray.bot[1], ray.z + 0.8],
        col, ray.alpha * rayPulse, -1,
      );
    }
    if (addVerts > 0) {
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
      gl.useProgram(additiveProg);
      gl.uniformMatrix4fv(addLoc.uViewProj, false, cam.viewProj);
      gl.bindVertexArray(addVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, addVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, addBuf.subarray(0, addVerts * 10));
      gl.drawArrays(gl.TRIANGLES, 0, addVerts);
    }

    // 5. Billboard Pixel Sprites + Glossy Floor Reflections
    gl.useProgram(spriteProg);
    gl.uniformMatrix4fv(spriteLoc.uViewProj, false, cam.viewProj);
    gl.uniform3fv(spriteLoc.uAmbient, stage.lighting?.ambient ?? [0.22, 0.18, 0.34]);
    gl.uniform3fv(spriteLoc.uKeyDir, keyDir);
    gl.uniform3fv(spriteLoc.uKeyColor, keyColor);
    gl.uniform4fv(spriteLoc.uLightPos, lightPosArr);
    gl.uniform4fv(spriteLoc.uLightCol, lightColArr);
    gl.uniform1i(spriteLoc.uLightCount, lightCount);
    gl.bindVertexArray(unitQuadVao);

    const floorGloss = stage.lighting?.floorGloss ?? 0.4;
    const dofStrength = stage.postProcess?.dofStrength ?? 0.78;
    const focusZ = stage.camera?.focusZ ?? 0;

    function drawCutoutLayer(foreground) {
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.depthMask(true);
      for (const c of cutouts) {
        const isFg = c.pos[2] > 0.1;
        if (isFg !== foreground) continue;
        const cEntry = cutoutEntryFor(c);
        if (!cEntry) continue;
        const tr = cutoutTransform(c);
        const pv = c.pivotUv ?? [0.5, 1.0];
        const zDist = Math.abs(tr.z - focusZ);
        const dof = foreground
          ? Math.min(0.96, Math.max(0.42, (zDist - 0.8) / 2.6) * dofStrength + (c.dofBoost ?? 0))
          : Math.min(0.94, Math.max(0, (zDist - 0.95) / 3.45) * dofStrength * 0.72 + (c.dofBoost ?? 0));
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, cEntry.tex);
        gl.uniform1i(spriteLoc.uTex, 0);
        gl.uniform2f(spriteLoc.uTexSize, cEntry.w, cEntry.h);
        gl.uniform3f(spriteLoc.uAnchor, tr.x, tr.y, tr.z);
        gl.uniform2f(spriteLoc.uSize, c.size[0], c.size[1]);
        gl.uniform1f(spriteLoc.uFlipY, 0);
        gl.uniform1f(spriteLoc.uRotRad, tr.rot);
        gl.uniform2f(spriteLoc.uPivotUv, pv[0], pv[1]);
        gl.uniform1f(spriteLoc.uReflectAlpha, 0);
        gl.uniform1f(spriteLoc.uEmissive, c.emissive ? 1 : 0);
        gl.uniform1f(spriteLoc.uBrightness, (c.brightness ?? 1) * (foreground ? 0.72 : 1.0));
        gl.uniform1f(spriteLoc.uDofAmount, dof);
        const isSel = c.id === state.selectedId;
        gl.uniform1f(spriteLoc.uRimBoost, isSel ? 0.55 : 0.08);
        gl.uniform3fv(spriteLoc.uRimColor, isSel ? [0.28, 0.86, 1.0] : [1.0, 0.9, 0.72]);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }

    drawCutoutLayer(false);

    if (floorGloss >= 0.48) {
      const refAlpha = Math.min(0.28, (floorGloss - 0.34) * 0.42);
      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
      gl.depthMask(false);
      for (const anchor of anchors) {
        if (anchor.role === 'trigger') continue;
        const entry = spriteEntryFor(anchor);
        if (!entry) continue;
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, entry.tex);
        gl.uniform1i(spriteLoc.uTex, 0);
        gl.uniform2f(spriteLoc.uTexSize, entry.w, entry.h);
        gl.uniform3f(spriteLoc.uAnchor, anchor.pos[0], anchor.pos[1] - 0.01, anchor.pos[2]);
        gl.uniform2f(spriteLoc.uSize, anchor.widthWorld ?? 1.8, (anchor.heightWorld ?? 1.8) * 0.65);
        gl.uniform1f(spriteLoc.uFlipY, 1);
        gl.uniform1f(spriteLoc.uRotRad, 0);
        gl.uniform2f(spriteLoc.uPivotUv, 0.5, 1.0);
        gl.uniform1f(spriteLoc.uReflectAlpha, refAlpha);
        gl.uniform1f(spriteLoc.uEmissive, 0);
        gl.uniform1f(spriteLoc.uBrightness, 1);
        gl.uniform1f(spriteLoc.uDofAmount, 0);
        gl.uniform1f(spriteLoc.uRimBoost, 0);
        gl.uniform3f(spriteLoc.uRimColor, 1, 1, 1);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    }

    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.depthMask(true);
    for (const anchor of anchors) {
      if (anchor.role === 'trigger') continue;
      const entry = spriteEntryFor(anchor);
      if (!entry) continue;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, entry.tex);
      gl.uniform1i(spriteLoc.uTex, 0);
      gl.uniform2f(spriteLoc.uTexSize, entry.w, entry.h);
      gl.uniform3f(spriteLoc.uAnchor, anchor.pos[0], anchor.pos[1], anchor.pos[2]);
      gl.uniform2f(spriteLoc.uSize, anchor.widthWorld ?? 1.8, anchor.heightWorld ?? 1.8);
      gl.uniform1f(spriteLoc.uFlipY, 0);
      gl.uniform1f(spriteLoc.uRotRad, 0);
      gl.uniform2f(spriteLoc.uPivotUv, 0.5, 1.0);
      gl.uniform1f(spriteLoc.uReflectAlpha, 0);
      gl.uniform1f(spriteLoc.uEmissive, 0);
      gl.uniform1f(spriteLoc.uBrightness, 1);
      gl.uniform1f(spriteLoc.uDofAmount, 0);
      gl.uniform1f(spriteLoc.uRimBoost, anchor.id === state.selectedId ? 0.55 : 0.12);
      gl.uniform3fv(spriteLoc.uRimColor, anchor.id === state.selectedId ? [0.28, 0.86, 1.0] : (anchor.ringColor ?? [1, 0.9, 0.7]));
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    drawCutoutLayer(true);

    // 6. Brazier glows + Foreground Depth-Bokeh Orbs + Floating Particles
    addVerts = 0;
    const sconcePulse = 0.84 + 0.16 * Math.sin((state.time ?? 0) * 7.2);
    const sconceColor = stage.lighting?.sconceColor ?? [1.0, 0.68, 0.28];
    for (const prop of stage.geometry?.props ?? []) {
      if (prop.hidden) continue;
      if (prop.type === 'brazier' || prop.type === 'lantern_post') {
        const s = prop.scale ?? 1;
        const py = prop.pos[1] + ((prop.height ?? (prop.type === 'brazier' ? 1.28 : 2.1)) + 0.14) * s;
        pushAddQuad(
          [prop.pos[0] - 0.42 * s, py + 0.42 * s, prop.pos[2] + 0.04],
          [prop.pos[0] + 0.42 * s, py + 0.42 * s, prop.pos[2] + 0.04],
          [prop.pos[0] + 0.42 * s, py - 0.42 * s, prop.pos[2] + 0.04],
          [prop.pos[0] - 0.42 * s, py - 0.42 * s, prop.pos[2] + 0.04],
          sconceColor, 0.74 * sconcePulse, 0.55,
        );
      }
    }
    const mc1 = stage.atmosphere?.particles?.primary ?? [1.0, 0.82, 0.42];
    const mc2 = stage.atmosphere?.particles?.secondary ?? [0.68, 0.82, 1.0];
    const tSec = state.time ?? 0;
    for (let i = 0; i < 10; i++) {
      const bx = Math.sin(i * 2.37 + tSec * (0.18 + (i % 3) * 0.05)) * 4.9;
      const by = ((i * 0.61 + tSec * (0.14 + (i % 4) * 0.03)) % 3.6) + 0.2;
      const bz = 2.25 + (i % 4) * 0.34;
      const bs = 0.22 + (i % 3) * 0.11;
      const col = i % 2 === 0 ? mc1 : mc2;
      const ba = (0.11 + 0.05 * Math.sin(tSec * 1.4 + i * 1.7)) * (0.85 + beatPulse * 0.3);
      pushAddQuad(
        [bx - bs, by + bs, bz], [bx + bs, by + bs, bz],
        [bx + bs, by - bs, bz], [bx - bs, by - bs, bz],
        col, ba, 0.98,
      );
    }
    const particles = sampleParticles(stage, state);
    for (const p of particles) {
      const hs = p.size;
      pushAddQuad(
        [p.x - hs, p.y + hs, p.z],
        [p.x + hs, p.y + hs, p.z],
        [p.x + hs, p.y - hs, p.z],
        [p.x - hs, p.y - hs, p.z],
        p.color, p.alpha, p.softness,
      );
    }
    if (addVerts > 0) {
      gl.enable(gl.BLEND);
      gl.depthMask(false);
      gl.blendFuncSeparate(gl.ONE, gl.ONE, gl.ZERO, gl.ONE);
      gl.useProgram(additiveProg);
      gl.uniformMatrix4fv(addLoc.uViewProj, false, cam.viewProj);
      gl.bindVertexArray(addVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, addVbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, addBuf.subarray(0, addVerts * 10));
      gl.drawArrays(gl.TRIANGLES, 0, addVerts);
    }

    // 7. Post-process DoF + Dual-Scale Selective HDR Bloom + Filmic Composite
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    runBlur(sceneTarget.tex, dofA, 1.85 / dofA.w, 0, false);
    runBlur(dofA.tex, dofB, 0, 1.85 / dofB.h, false);
    runBlur(sceneTarget.tex, bloomA, 1.8 / bloomA.w, 0, true);
    runBlur(bloomA.tex, bloomB, 0, 1.8 / bloomB.h, false);
    runBlur(bloomB.tex, bloomWideA, 2.6 / bloomWideA.w, 0, false);
    runBlur(bloomWideA.tex, bloomWideB, 0, 2.6 / bloomWideB.h, false);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, outW, outH);
    gl.useProgram(compProg);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, sceneTarget.tex); gl.uniform1i(compLoc.uSceneTex, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, dofB.tex); gl.uniform1i(compLoc.uDofTex, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, bloomB.tex); gl.uniform1i(compLoc.uBloomTex, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, bloomWideB.tex); gl.uniform1i(compLoc.uBloomWideTex, 3);
    gl.uniform1f(compLoc.uBloomStrength, stage.postProcess?.bloomStrength ?? 0.42);
    gl.uniform1f(compLoc.uVignette, stage.postProcess?.vignette ?? 0.48);
    gl.uniform3fv(compLoc.uGrade, stage.postProcess?.grade ?? [1, 1, 1]);
    gl.uniform1f(compLoc.uEnraged, state.enraged ? 1 : 0);
    gl.uniform1f(compLoc.uImpactFlash, state.impactFlash ?? 0);
    gl.bindVertexArray(screenQuadVao);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.bindVertexArray(null);

    return { cam, width: outW, height: outH, vertexCount: useArtProjection ? artMeshVertexCount : meshVertexCount, lightCount };
  }

  return {
    render,
    uploadStageGeometry,
    registerExternalModelAsset,
    updateAtlas,
    setCustomAtlasImage,
    setBackdropImage,
    setCutoutImage,
    setAnchorSpriteImage,
    getAtlasData: () => atlasData,
    neutralViewProj: stage => neutralViewProj(stage),
    stageSize: () => ({ width: outW, height: outH, logicalW: STAGE_W, logicalH: STAGE_H }),
  };
}
