/**
 * 8th Wall Chroma Key Material
 * Based on aframe-chromakey-material approach for maximum compatibility
 * Optimized for mobile devices and iOS
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js';

export function createChromaKeyMaterial({ 
  texture, 
  keyColor = new THREE.Color('#43A34E'), 
  similarity = 0.4, 
  smoothness = 0.1,
  spill = 0.1,
  debugMode = false 
}) {
  console.log('Creating 8th Wall chroma key material - debugMode:', debugMode);
  
  const uniforms = {
    map: { value: texture },
    keyColor: { value: keyColor },
    similarity: { value: similarity },
    smoothness: { value: smoothness },
    spill: { value: spill },
    debugMode: { value: debugMode ? 1.0 : 0.0 },
    // flipY: 1.0 means flip vertically (use 1.0 when texture.flipY === false)
    flipY: { value: 0.0 }
  };
  
  const material = new THREE.ShaderMaterial({
    transparent: true,
    alphaTest: 0.0,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      uniform float flipY;
      void main(){
        // Conditionally flip Y based on uniform. This keeps desktop correct while
        // allowing iOS/canvas-based textures (which set texture.flipY = false)
        // to be flipped back into proper orientation.
        if (flipY > 0.5) {
          vUv = vec2(uv.x, 1.0 - uv.y);
        } else {
          vUv = uv;
        }
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision mediump float;
      varying vec2 vUv;
      uniform sampler2D map;
      uniform vec3 keyColor;
      uniform float similarity;
      uniform float smoothness;
      uniform float spill;
      uniform float debugMode;

      // Convert RGB to HSV (8th Wall method)
      vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        float e = 1.0e-10;
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
      }

      // Calculate chroma key distance in HSV space
      float chromaDistance(vec3 texColor, vec3 keyColor) {
        vec3 texHsv = rgb2hsv(texColor);
        vec3 keyHsv = rgb2hsv(keyColor);
        
        // Hue distance with wraparound
        float hueDist = abs(texHsv.x - keyHsv.x);
        if (hueDist > 0.5) hueDist = 1.0 - hueDist;
        
        // Saturation and value distances
        float satDist = abs(texHsv.y - keyHsv.y);
        float valDist = abs(texHsv.z - keyHsv.z);
        
        // Very aggressive weighting for green screen - prioritize hue matching
        // Reduce saturation and value importance to catch more green variations
        return sqrt(hueDist * hueDist * 8.0 + satDist * satDist * 1.5 + valDist * valDist * 0.8);
      }

      void main(){
        vec4 texColor = texture2D(map, vUv);
        
        // Debug mode: show original video without processing
        if (debugMode > 0.5) {
          gl_FragColor = vec4(texColor.rgb, 1.0);
          return;
        }
        
        // Calculate chroma key distance
        float dist = chromaDistance(texColor.rgb, keyColor);
        
        // Additional RGB distance check for better precision with specific colors
        vec3 colorDiff = abs(texColor.rgb - keyColor);
        float rgbDist = length(colorDiff);
        
        // Combine HSV and RGB distances for better accuracy
        float combinedDist = mix(dist, rgbDist * 2.0, 0.3);
        
        // Create smooth alpha mask
        float alpha = smoothstep(similarity - smoothness, similarity + smoothness, combinedDist);
        
        // Only apply additional transparency for specifically green colors
        float greenness = texColor.g - max(texColor.r, texColor.b);
        float luminance = dot(texColor.rgb, vec3(0.299, 0.587, 0.114));
        
        // More precise green detection - only affect truly green pixels
        if (greenness > 0.15 && texColor.g > 0.4 && combinedDist < similarity * 1.2) {
          // Only enhance transparency for green areas near the key color
          alpha = max(alpha, 0.7);
        }
        
        // Spill removal - reduce key color bleeding
        vec3 finalColor = texColor.rgb;
        if (alpha > 0.1 && spill > 0.0) {
          float spillAmount = clamp((1.0 - combinedDist) * spill, 0.0, 1.0);
          // Remove green tint more effectively
          finalColor.g = mix(finalColor.g, (finalColor.r + finalColor.b) * 0.5, spillAmount);
        }
        
        gl_FragColor = vec4(finalColor, alpha);
      }
    `
  });

  // Add update method for runtime parameter changes
  material.userData.update = (params) => {
    if (params.keyColor) {
      if (typeof params.keyColor === 'string') {
        material.uniforms.keyColor.value.set(params.keyColor);
      } else {
        material.uniforms.keyColor.value.copy(params.keyColor);
      }
    }
    if (params.similarity !== undefined) material.uniforms.similarity.value = params.similarity;
    if (params.smoothness !== undefined) material.uniforms.smoothness.value = params.smoothness;
    if (params.spill !== undefined) material.uniforms.spill.value = params.spill;
    if (params.debugMode !== undefined) material.uniforms.debugMode.value = params.debugMode ? 1.0 : 0.0;
  };

  // Add debug toggle method
  material.userData.toggleDebug = () => {
    const isDebug = material.uniforms.debugMode.value > 0.5;
    material.uniforms.debugMode.value = isDebug ? 0.0 : 1.0;
    console.log('8th Wall Chroma Debug Mode:', !isDebug ? 'ON' : 'OFF');
  };

  return material;
}
