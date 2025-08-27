// Minimal adaptation inspired by threejs_chromakey_video_material
// (No direct copy; simple GLSL shader implementing chroma key.)
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js';

export function createChromaKeyMaterial({ texture, keyColor = new THREE.Color('#00ff00'), similarity = 0.4, smoothness = 0.08 }) {
  const uniforms = {
    map: { value: texture },
    keyColor: { value: keyColor },
    similarity: { value: similarity },
    smoothness: { value: smoothness }
  };
  const material = new THREE.ShaderMaterial({
    transparent: true,
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

      // Convert RGB to YCbCr to better isolate chroma difference
      vec3 rgb2ycbcr(vec3 c){
        float y = dot(c, vec3(0.2989, 0.5866, 0.1145));
        float cb = (c.b - y) * 0.565;
        float cr = (c.r - y) * 0.713;
        return vec3(y, cb, cr);
      }
      void main(){
        vec4 color = texture2D(map, vUv);
        vec3 ycbcr = rgb2ycbcr(color.rgb);
        vec3 keyYcbcr = rgb2ycbcr(keyColor.rgb);
        float chromaDist = distance(ycbcr.yz, keyYcbcr.yz);
        // smoothstep(edge0, edge1, x) requires edge0 <= edge1
        // chromaDist small => near key color (transparent), large => opaque
        float mask = smoothstep(similarity - smoothness, similarity, chromaDist);
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
