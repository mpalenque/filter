// Minimal adaptation inspired by threejs_chromakey_video_material
// (No direct copy; simple GLSL shader implementing chroma key.)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js';

export function createChromaKeyMaterial({ texture, keyColor = new THREE.Color('#00ff00'), similarity = 0.15, smoothness = 0.02, debugMode = false }) {
  console.log('Creating chroma key material - debugMode:', debugMode);
  
  const uniforms = {
    map: { value: texture },
    keyColor: { value: keyColor },
    similarity: { value: similarity },
    smoothness: { value: smoothness },
    debugMode: { value: debugMode ? 1.0 : 0.0 }
  };
  
  const material = new THREE.ShaderMaterial({
    transparent: !debugMode, // In debug mode, don't use transparency
    opacity: 1.0,
    side: THREE.DoubleSide,
    uniforms,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
  fragmentShader: /* glsl */`
      precision highp float;
      varying vec2 vUv;
      uniform sampler2D map;
      uniform vec3 keyColor;
      uniform float similarity; // threshold
      uniform float smoothness; // softness edge
      uniform float debugMode; // 1.0 = show video without chroma key

      void main(){
        vec4 color = texture2D(map, vUv);
        
        // Debug mode: show video without any chroma keying - FORCED VISIBLE
        if (debugMode > 0.5) {
          // Force full opacity to ensure visibility
          gl_FragColor = vec4(color.rgb, 1.0);
          return;
        }
        
        // Standard chroma key using HSV color space (more accurate than YCbCr)
        vec3 c = color.rgb;
        vec3 key = keyColor.rgb;
        
        // Convert to HSV for better chroma separation
        float maxC = max(max(c.r, c.g), c.b);
        float minC = min(min(c.r, c.g), c.b);
        float delta = maxC - minC;
        
        float hue = 0.0;
        if (delta > 0.0) {
          if (maxC == c.r) {
            hue = mod((c.g - c.b) / delta, 6.0);
          } else if (maxC == c.g) {
            hue = (c.b - c.r) / delta + 2.0;
          } else {
            hue = (c.r - c.g) / delta + 4.0;
          }
          hue /= 6.0;
        }
        
        float sat = maxC > 0.0 ? delta / maxC : 0.0;
        float val = maxC;
        
        // Key color HSV
        float maxKey = max(max(key.r, key.g), key.b);
        float minKey = min(min(key.r, key.g), key.b);
        float deltaKey = maxKey - minKey;
        
        float keyHue = 0.0;
        if (deltaKey > 0.0) {
          if (maxKey == key.r) {
            keyHue = mod((key.g - key.b) / deltaKey, 6.0);
          } else if (maxKey == key.g) {
            keyHue = (key.b - key.r) / deltaKey + 2.0;
          } else {
            keyHue = (key.r - key.g) / deltaKey + 4.0;
          }
          keyHue /= 6.0;
        }
        
        float keySat = maxKey > 0.0 ? deltaKey / maxKey : 0.0;
        
        // Calculate distance in HSV space
        float hueDist = min(abs(hue - keyHue), 1.0 - abs(hue - keyHue));
        float satDist = abs(sat - keySat);
        float chromaDist = sqrt(hueDist * hueDist + satDist * satDist);
        
        // Create mask
        float mask = smoothstep(similarity - smoothness, similarity + smoothness, chromaDist);
        
        gl_FragColor = vec4(color.rgb, color.a * mask);
      }
    `
  });
  material.userData.update = (params) => {
    if (params.keyColor) material.uniforms.keyColor.value.set(params.keyColor);
    if (params.similarity !== undefined) material.uniforms.similarity.value = params.similarity;
    if (params.smoothness !== undefined) material.uniforms.smoothness.value = params.smoothness;
  };
  return material;
}
