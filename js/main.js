import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160/build/three.module.js';
import { createChromaKeyMaterial } from './ChromaKeyMaterial.js';

console.log('🚀 NUEVA VERSION v2.2 - Basic Material Test (No Chroma Key)');

const webcamEl = document.getElementById('webcam');
const canvas = document.getElementById('three-canvas');
const tapOverlay = document.getElementById('tap-to-start');
const loadingOverlay = document.getElementById('loading-overlay');
const keyColorInput = document.getElementById('keyColor');
const similarityInput = document.getElementById('similarity');
const smoothnessInput = document.getElementById('smoothness');
const videoFileInput = document.getElementById('videoFile');
const offsetXInput = document.getElementById('offsetX');
const recorderButton = document.getElementById('recorder-button');
const recorderContainer = document.querySelector('.recorder-container');
const progressBar = document.querySelector('.progress-bar');
const flashElement = document.querySelector('.flash-element');
const previewContainer = document.getElementById('preview-container');
const previewVideo = document.getElementById('preview-video');
const previewImage = document.getElementById('preview-image');
const previewClose = document.getElementById('preview-close');
const previewShare = document.getElementById('preview-share');
const previewDownload = document.getElementById('preview-download');

let renderer, scene, camera, plane, chromaMaterial, videoTex, overlayVideo;
let recorder, recordedChunks = [], pressTimer, isRecording = false, recordStartTs = 0, progressInterval, recordRAF = 0;
let currentFile = null; // For preview

async function initWebcam() {
  try {
    // Check if we're on HTTPS (required for getUserMedia on GitHub Pages)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      throw new Error('HTTPS required for camera access');
    }
    
    // Check if getUserMedia is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('getUserMedia not supported');
    }
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { 
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }, 
      audio: false 
    });
    webcamEl.srcObject = stream;
    await webcamEl.play();
    console.log('Webcam initialized successfully');
  } catch (error) {
    console.error('Webcam initialization failed:', error);
    
    // Show error message to user
    const errorMsg = document.createElement('div');
    errorMsg.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      background: rgba(255,0,0,0.9); color: white; padding: 20px; border-radius: 10px;
      text-align: center; z-index: 1000; max-width: 90vw;
    `;
    
    if (error.name === 'NotAllowedError') {
      errorMsg.innerHTML = 'Camera access denied.<br>Please allow camera permissions and refresh.';
    } else if (error.name === 'NotFoundError') {
      errorMsg.innerHTML = 'No camera found.<br>Please connect a camera and refresh.';
    } else if (error.message.includes('HTTPS')) {
      errorMsg.innerHTML = 'Camera requires HTTPS.<br>Please visit the HTTPS version of this page.';
    } else {
      errorMsg.innerHTML = `Camera error: ${error.message}<br>Please check browser compatibility.`;
    }
    
    document.body.appendChild(errorMsg);
    throw error;
  }
}

function createFallbackTexture() {
  console.log('Creating fallback texture...');
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  // Create a green screen color (this will be removed by chroma key)
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(0, 0, 512, 512);
  
  // Add some visible pattern that won't be chroma keyed
  ctx.fillStyle = '#ff0000';
  ctx.font = '48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('OVERLAY', 256, 256);
  
  videoTex = new THREE.CanvasTexture(canvas);
  videoTex.colorSpace = THREE.SRGBColorSpace;
  videoTex.generateMipmaps = false;
  videoTex.minFilter = THREE.LinearFilter;
  videoTex.magFilter = THREE.LinearFilter;
  videoTex.wrapS = THREE.ClampToEdgeWrapping;
  videoTex.wrapT = THREE.ClampToEdgeWrapping;
  
  console.log('Fallback texture created');
}

async function loadOverlayVideo(customURL) {
  console.log('Loading overlay video...', customURL || './vid.mp4');
  
  // Check if we're on mobile
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  if (isMobile) {
    console.log('Mobile detected, trying optimized video loading...');
    
    // Try to load video with mobile-specific settings
    overlayVideo = document.createElement('video');
    overlayVideo.setAttribute('playsinline', 'true');
    overlayVideo.setAttribute('webkit-playsinline', 'true');
    overlayVideo.muted = true;
    overlayVideo.loop = true;
    overlayVideo.autoplay = true;
    overlayVideo.preload = 'metadata'; // Less aggressive preload for mobile
    
    // Don't set crossOrigin for same-origin videos on mobile
    const videoSrc = customURL || './vid.mp4';
    
    console.log('Mobile: Video src set to:', videoSrc);
    
    // Create a promise that resolves when video is ready
    let videoReady = false;
    await new Promise((resolve, reject) => {
      let resolved = false;
      
      const onSuccess = () => {
        if (resolved) return;
        resolved = true;
        videoReady = true;
        console.log('Mobile: Overlay video loaded successfully');
        resolve();
      };
      
      const onError = (e) => {
        if (resolved) return;
        resolved = true;
        console.error('Mobile: Error loading overlay video:', e);
        videoReady = false;
        resolve(); // Don't reject, we'll handle fallback below
      };
      
      // Multiple events that indicate the video is ready
      overlayVideo.addEventListener('loadeddata', onSuccess, { once: true }); // Better for mobile
      overlayVideo.addEventListener('canplaythrough', onSuccess, { once: true });
      overlayVideo.addEventListener('error', onError, { once: true });
      
      // Set source after event listeners
      overlayVideo.src = videoSrc;
      
      // Also trigger success if video becomes ready quickly
      overlayVideo.addEventListener('loadstart', () => {
        setTimeout(() => {
          if (!resolved && overlayVideo.readyState >= 3) { // HAVE_FUTURE_DATA
            onSuccess();
          }
        }, 100);
      });
      
      // Timeout fallback
      setTimeout(() => {
        if (!resolved) {
          console.warn('Mobile: Video loading timeout, using fallback');
          onError(new Error('Timeout'));
        }
      }, 8000); // Longer timeout to give video more time
    });
    
    // Try to create video texture if video loaded successfully
    if (videoReady && overlayVideo.readyState >= 1) { // HAVE_METADATA or higher
      try {
        // Wait a bit more for video to be fully ready
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // iOS Safari has issues with VideoTexture, try alternative approach
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        
        if (isIOS) {
          console.log('iOS detected, using canvas-based approach for video texture');
          
          // Ensure video has dimensions
          const videoWidth = overlayVideo.videoWidth || overlayVideo.width || 640;
          const videoHeight = overlayVideo.videoHeight || overlayVideo.height || 480;
          
          console.log('Video dimensions:', videoWidth, 'x', videoHeight);
          
          // Create a canvas to draw video frames
          const canvas = document.createElement('canvas');
          canvas.width = videoWidth;
          canvas.height = videoHeight;
          const ctx = canvas.getContext('2d');
          
          console.log('Canvas created:', canvas.width, 'x', canvas.height);
          
          // Function to update canvas with video frame
          let updateRunning = false;
          const updateCanvas = () => {
            if (!overlayVideo || overlayVideo.paused || overlayVideo.ended || updateRunning) {
              return;
            }
            
            updateRunning = true;
            
            try {
              // Clear canvas first
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              
              // Draw video frame
              ctx.drawImage(overlayVideo, 0, 0, canvas.width, canvas.height);
              
              // Update texture
              if (videoTex) {
                videoTex.needsUpdate = true;
              }
              
              // Schedule next frame
              if (!overlayVideo.paused && !overlayVideo.ended) {
                requestAnimationFrame(() => {
                  updateRunning = false;
                  updateCanvas();
                });
              } else {
                updateRunning = false;
              }
            } catch (e) {
              console.error('Error updating canvas:', e);
              updateRunning = false;
            }
          };
          
          // Create texture from canvas
          videoTex = new THREE.CanvasTexture(canvas);
          videoTex.colorSpace = THREE.SRGBColorSpace;
          videoTex.generateMipmaps = false;
          videoTex.minFilter = THREE.LinearFilter;
          videoTex.magFilter = THREE.LinearFilter;
          videoTex.wrapS = THREE.ClampToEdgeWrapping;
          videoTex.wrapT = THREE.ClampToEdgeWrapping;
          videoTex.flipY = false; // Important for canvas textures
          
          console.log('iOS: Canvas texture created, starting update loop');
          
          // Start the update loop after a small delay
          setTimeout(() => {
            updateCanvas();
          }, 100);
          
          console.log('iOS: Canvas-based video texture created successfully');
        } else {
          // Non-iOS: use direct VideoTexture
          videoTex = new THREE.VideoTexture(overlayVideo);
          videoTex.colorSpace = THREE.SRGBColorSpace;
          videoTex.generateMipmaps = false;
          videoTex.minFilter = THREE.LinearFilter;
          videoTex.magFilter = THREE.LinearFilter;
          videoTex.wrapS = THREE.ClampToEdgeWrapping;
          videoTex.wrapT = THREE.ClampToEdgeWrapping;
          
          console.log('Mobile: Direct video texture created successfully');
        }
        
        // Try to play (might fail but that's OK)
        try {
          await overlayVideo.play();
          console.log('Mobile: Video playing');
        } catch (playError) {
          console.warn('Mobile: Autoplay failed, will play on user interaction:', playError);
        }
        
        return; // Success! Exit here
      } catch (texError) {
        console.error('Mobile: Failed to create video texture:', texError);
      }
    } else {
      console.log('Mobile: Video not ready (ready:', videoReady, 'readyState:', overlayVideo?.readyState, '), using fallback');
    }
    
    // If we get here, create fallback texture
    createFallbackTexture();
    return;
  }
  
  // Desktop: load actual video (original code)
  overlayVideo = document.createElement('video');
  overlayVideo.setAttribute('playsinline', '');
  overlayVideo.muted = true;
  overlayVideo.loop = true;
  overlayVideo.crossOrigin = 'anonymous';
  
  const videoSrc = customURL || './vid.mp4';
  overlayVideo.src = videoSrc;
  console.log('Video src set to:', videoSrc);

  await new Promise((resolve, reject) => {
    overlayVideo.addEventListener('loadeddata', () => {
      console.log('Overlay video loaded successfully');
      resolve();
    }, { once: true });
    overlayVideo.addEventListener('error', (e) => {
      console.error('Error loading overlay video:', e, overlayVideo.error);
      reject(new Error(`Error cargando video overlay: ${overlayVideo.error?.message || 'Unknown error'}`));
    }, { once: true });
    
    // Add timeout for slow connections
    setTimeout(() => {
      reject(new Error('Video loading timeout'));
    }, 10000);
  });
  
  try {
    await overlayVideo.play();
    console.log('Overlay video playing');
  } catch (e) {
    console.warn('Autoplay bloqueado, el video se reproducirá tras interacción del usuario', e);
    // On mobile, video might not autoplay, but that's OK for overlay
  }
  
  videoTex = new THREE.VideoTexture(overlayVideo);
  videoTex.colorSpace = THREE.SRGBColorSpace;
  videoTex.generateMipmaps = false;
  videoTex.minFilter = THREE.LinearFilter;
  videoTex.magFilter = THREE.LinearFilter;
  videoTex.wrapS = THREE.ClampToEdgeWrapping;
  videoTex.wrapT = THREE.ClampToEdgeWrapping;
  videoTex.needsUpdate = true;
}

function initThree() {
  // Use WebGL1 to avoid texImage3D warnings on some platforms and keep UNPACK_* rules simple
  const gl = canvas.getContext('webgl', { alpha:true, antialias:false, preserveDrawingBuffer:true, premultipliedAlpha:false, powerPreference: 'high-performance' });
  renderer = new THREE.WebGLRenderer({ canvas, context: gl });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); // Limit pixel ratio for performance
  resize();
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1,1,1,-1,0,10);
  camera.position.z = 1;

  // Use 8th Wall chroma key method
  console.log('Creating 8th Wall chroma key material...');
  chromaMaterial = createChromaKeyMaterial({ 
    texture: videoTex,
    keyColor: new THREE.Color('#43A34E'), // Specific green color from video
    similarity: 0.5,   // Less aggressive to preserve other colors
    smoothness: 0.2,   // Moderate smooth transition
    spill: 0.3,        // Moderate spill removal
    debugMode: false   // Start with chroma key active
  });
  
  console.log('8th Wall chroma material created with texture:', videoTex);
  console.log('Using more aggressive parameters for better green removal');
  
  // Calculate proper aspect ratio for video plane
  let planeWidth = 2;
  let planeHeight = 2;
  
  // Check if we have video dimensions and adjust for mobile devices
  if (overlayVideo && overlayVideo.videoWidth && overlayVideo.videoHeight) {
    const videoAspect = overlayVideo.videoWidth / overlayVideo.videoHeight;
    const screenAspect = window.innerWidth / window.innerHeight;
    
    console.log('Video aspect:', videoAspect, 'Screen aspect:', screenAspect);
    
    // Adjust plane dimensions to maintain video aspect ratio
    if (videoAspect > screenAspect) {
      // Video is wider than screen
      planeHeight = planeWidth / videoAspect;
    } else {
      // Video is taller than screen or same aspect
      planeWidth = planeHeight * videoAspect;
    }
    
    console.log('Adjusted plane dimensions:', planeWidth, 'x', planeHeight);
  }
  
  const geo = new THREE.PlaneGeometry(planeWidth, planeHeight);
  plane = new THREE.Mesh(geo, chromaMaterial);
  scene.add(plane);
  // Move 30% left (plane spans -1..1 in orthographic; 30% of width = 0.6 * 0.5? Simpler: shift -0.3 * 2 = -0.6 of normalized width?).
  // Since plane width is 2 in clip space mapping, translating by -0.6 moves 30% of full width left.
  plane.position.x = -0.6;
  
  console.log('Plane created and positioned at x:', plane.position.x);

  animate();
}

// Add one-time logging to see if animation is running
let animationLogCount = 0;
function animate(){
  requestAnimationFrame(animate);
  
  if (animationLogCount < 3) {
    console.log('Animation frame:', animationLogCount, 'videoTex:', !!videoTex, 'scene children:', scene?.children?.length);
    animationLogCount++;
  }
  
  if (videoTex) {
    videoTex.needsUpdate = true;
  }
  renderer.render(scene, camera);
}

function resize(){
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  
  // Also update plane aspect ratio if video and plane exist
  if (plane && overlayVideo && overlayVideo.videoWidth && overlayVideo.videoHeight) {
    const videoAspect = overlayVideo.videoWidth / overlayVideo.videoHeight;
    const screenAspect = w / h;
    
    let planeWidth = 2;
    let planeHeight = 2;
    
    // Maintain video aspect ratio
    if (videoAspect > screenAspect) {
      planeHeight = planeWidth / videoAspect;
    } else {
      planeWidth = planeHeight * videoAspect;
    }
    
    // Update plane geometry
    plane.geometry.dispose();
    plane.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    
    console.log('Plane resized to:', planeWidth, 'x', planeHeight, 'for aspect:', videoAspect);
  }
}
window.addEventListener('resize', () => resize());

function wireUI(){
  // Add debug toggle for chroma key (tap screen 5 times quickly)
  let tapCount = 0;
  let tapTimer = null;
  
  document.addEventListener('touchstart', () => {
    tapCount++;
    clearTimeout(tapTimer);
    
    if (tapCount >= 5) {
      // Toggle debug mode after 5 quick taps
      if (chromaMaterial && chromaMaterial.userData.toggleDebug) {
        chromaMaterial.userData.toggleDebug();
      }
      tapCount = 0;
    } else {
      tapTimer = setTimeout(() => {
        tapCount = 0;
      }, 1000);
    }
  });

  // Add click handler to try starting video on any user interaction (iOS requirement)
  const startVideoOnInteraction = async () => {
    if (overlayVideo && overlayVideo.paused) {
      try {
        await overlayVideo.play();
        console.log('Video started playing after user interaction');
      } catch (e) {
        console.warn('Could not start video on interaction:', e);
      }
    }
  };
  
  // Add interaction listeners to key elements
  document.addEventListener('touchstart', startVideoOnInteraction, { once: true });
  document.addEventListener('click', startVideoOnInteraction, { once: true });

  setupCapture();
}

async function autoStart(){
  // Start immediately without waiting for user interaction
  console.log('Starting auto-initialization...');
  try {
    // Show loading state
    recorderContainer.classList.add('loading');
    
    console.log('Initializing webcam and overlay video...');
    await Promise.all([initWebcam(), loadOverlayVideo()]);
    console.log('Webcam and video loaded, initializing Three.js...');
    initThree();
    console.log('Three.js initialized, wiring UI...');
    wireUI();
    
    // Remove loading state and hide overlay
    recorderContainer.classList.remove('loading');
    if (loadingOverlay) {
      loadingOverlay.style.display = 'none';
    }
    console.log('App initialized successfully');
  } catch (e){
    console.error('Auto start failed:', e);
    recorderContainer.classList.remove('loading');
    
    // Show more specific error messages for mobile debugging
    let errorMessage = 'Camera or video loading failed';
    if (e.message.includes('HTTPS')) {
      errorMessage = 'HTTPS required for camera';
    } else if (e.message.includes('getUserMedia')) {
      errorMessage = 'Camera not supported';
    } else if (e.message.includes('video')) {
      errorMessage = 'Video overlay failed to load';
    } else if (e.message.includes('NotAllowed')) {
      errorMessage = 'Camera permission denied';
    }
    
    // Show tap overlay as fallback
    if (loadingOverlay && tapOverlay) {
      loadingOverlay.style.display = 'flex';
      tapOverlay.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 1.5rem; margin-bottom: 10px;">⚠️</div>
          <div>Tap to retry initialization</div>
          <div style="font-size: 0.8rem; margin-top: 10px; opacity: 0.7;">
            ${errorMessage}
          </div>
          <div style="font-size: 0.7rem; margin-top: 15px; opacity: 0.5;">
            ${e.message}
          </div>
        </div>
      `;
    }
  }
}

// Add event listener only if tapOverlay exists
if (tapOverlay) {
  tapOverlay.addEventListener('click', async ()=> {
    console.log('Manual start triggered...');
    if (tapOverlay) {
      tapOverlay.innerHTML = '<div>Starting...</div>';
    }
    recorderContainer.classList.add('loading');
    
    try {
      console.log('Manual initialization: loading webcam and video...');
      await Promise.all([initWebcam(), loadOverlayVideo()]);
      
      // Try to play overlay video on user interaction (iOS requirement)
      if (overlayVideo && overlayVideo.paused) {
        try {
          await overlayVideo.play();
          console.log('Overlay video started playing after user interaction');
        } catch (playError) {
          console.warn('Could not start overlay video:', playError);
        }
      }
      
      console.log('Manual initialization: setting up Three.js...');
      initThree();
      wireUI();
      if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
      }
      recorderContainer.classList.remove('loading');
      console.log('Manual initialization successful');
    } catch (e){
      console.error('Manual start failed:', e);
      recorderContainer.classList.remove('loading');
      if (tapOverlay) {
        tapOverlay.innerHTML = `
          <div style="text-align: center;">
            <div style="font-size: 1.5rem; margin-bottom: 10px;">❌</div>
            <div>Initialization Failed</div>
            <div style="font-size: 0.8rem; margin-top: 10px;">
              ${e.message || 'Unknown error'}
            </div>
            <div style="font-size: 0.7rem; margin-top: 15px; opacity: 0.7;">
              Tap to retry
            </div>
          </div>
        `;
      }
    }
  });
}

window.addEventListener('load', autoStart);

// ---- Capture / Recording ----
function setupCapture(){
  // Modern event handling for the new recorder button
  const startEv = (e)=> { e.preventDefault(); startPress(); };
  const endEv = (e)=> { e.preventDefault(); endPress(); };
  recorderButton.addEventListener('pointerdown', startEv);
  window.addEventListener('pointerup', endEv);
  
  // Preview controls
  previewClose.addEventListener('click', closePreview);
  previewShare.addEventListener('click', shareFromPreview);
  previewDownload.addEventListener('click', downloadFromPreview);
  
  // Close preview when clicking outside
  previewContainer.addEventListener('click', (e) => {
    if (e.target === previewContainer) {
      closePreview();
    }
  });
}

function startPress(){
  if (isRecording) return;
  recorderContainer.classList.add('active');
  pressTimer = setTimeout(()=> {
    pressTimer = null; // Clear timer to indicate we started recording
    beginVideoRecording();
  }, 350); // long press threshold
}

function endPress(){
  recorderContainer.classList.remove('active');
  if (pressTimer){
    // Short press - take photo only
    clearTimeout(pressTimer);
    pressTimer = null;
    if (!isRecording) {
      takePhoto();
    }
  } else if (isRecording){
    // Long press was initiated and we're recording - stop video
    stopVideoRecording();
  }
}

function takePhoto(){
  // Flash effect
  flashElement.classList.add('flashing');
  setTimeout(() => flashElement.classList.remove('flashing'), 200);
  
  const composite = composeFrame();
  composite.toBlob(async blob => {
    const file = new File([blob], `photo_${Date.now()}.png`, { type: 'image/png' });
    showPreview(file, 'image');
  }, 'image/png');
}

function composeFrame(){
  const w = canvas.width;
  const h = canvas.height;
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const ctx = off.getContext('2d');
  // Draw webcam first
  if (webcamEl.videoWidth) drawWebcamCover(ctx, webcamEl, w, h);
  // Draw WebGL overlay
  // Force a render to ensure latest frame before copying
  if (renderer && scene && camera) renderer.render(scene, camera);
  try {
    ctx.drawImage(canvas, 0, 0, w, h);
  } catch (e){
    console.warn('drawImage WebGL canvas failed', e);
  }
  return off;
}

function drawWebcamCover(ctx, video, dw, dh){
  const vw = video.videoWidth; const vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(dw / vw, dh / vh);
  const sw = Math.floor(dw / scale);
  const sh = Math.floor(dh / scale);
  const sx = Math.floor((vw - sw) / 2);
  const sy = Math.floor((vh - sh) / 2);
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, dw, dh);
}

function beginVideoRecording(){
  // Always use composite recording to ensure webcam + overlay are combined visually
  isRecording = true;
  recorderContainer.classList.add('recording');
  recordStartTs = performance.now();
  startProgressLoop();
  recordedChunks = [];
  
  // Auto-stop after 8 seconds max
  setTimeout(() => {
    if (isRecording) {
      stopVideoRecording();
    }
  }, 8000);
  
  beginCompositeRecording();
}

function beginCompositeRecording(){
  // Manual composition to ensure webcam + overlay are visually combined
  const composed = document.createElement('canvas');
  composed.width = Math.min(canvas.width, 1280); // Cap resolution for performance
  composed.height = Math.min(canvas.height, 720);
  const ctx = composed.getContext('2d');
  const fps = 20; // Reasonable FPS for good quality
  
  const draw = ()=> {
    if (!isRecording) return;
    
    // Clear and redraw composite frame
    ctx.clearRect(0,0,composed.width, composed.height);
    
    // 1. Draw webcam background (with cover cropping)
    if (webcamEl.videoWidth) {
      drawWebcamCover(ctx, webcamEl, composed.width, composed.height);
    }
    
    // 2. Force fresh Three.js render to ensure latest overlay frame
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
    
    // 3. Draw WebGL overlay (chroma video + tangram) on top
    try { 
      ctx.drawImage(canvas, 0, 0, composed.width, composed.height); 
    } catch(e) { 
      console.warn('Canvas draw failed:', e);
    }
    
    recordRAF = requestAnimationFrame(draw);
  };

  const stream = composed.captureStream(fps);
  recorder = new MediaRecorder(stream, { 
    mimeType: pickSupportedMime(),
    videoBitsPerSecond: 3000000 // Higher bitrate for MP4 quality
  });
  recorder.ondataavailable = e => { if (e.data && e.data.size > 0) recordedChunks.push(e.data); };
  recorder.onstop = onRecordingStop;
  recorder.start(500); // More frequent data chunks for MP4
  draw();
}

function stopVideoRecording(){
  if (!isRecording) return;
  isRecording = false;
  recorderContainer.classList.remove('recording');
  stopProgressLoop();
  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
  }
  if (recordRAF) {
    cancelAnimationFrame(recordRAF);
    recordRAF = 0;
  }
}

function onRecordingStop(){
  if (recordedChunks.length === 0) {
    console.warn('No recorded data available');
    return;
  }
  const mimeType = recorder.mimeType || 'video/mp4';
  const blob = new Blob(recordedChunks, { type: mimeType });
  console.log(`Recording saved: ${(blob.size/1024/1024).toFixed(2)}MB, type: ${mimeType}`);
  
  // Use .mp4 extension for better compatibility
  const extension = mimeType.includes('mp4') ? 'mp4' : 'webm';
  const file = new File([blob], `video_${Date.now()}.${extension}`, { type: mimeType });
  
  console.log('Created video file:', file.name, file.size, file.type);
  showPreview(file, 'video');
}

async function tryShareOrDownload(file, filename){
  const download = ()=>{
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(()=> URL.revokeObjectURL(url), 5000);
  };
  
  // Try to share first, then fallback to download
  if (navigator.canShare && navigator.canShare({ files:[file] })){
    try {
      await navigator.share({ files:[file], title: filename });
    } catch(err) {
      console.warn('Share canceled or failed:', err);
      download();
    }
  } else {
    download();
  }
}

function pickSupportedMime(){
  const candidates = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4;codecs=avc1.420014', 
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8', 
    'video/webm'
  ];
  return candidates.find(m => MediaRecorder.isTypeSupported(m)) || 'video/mp4';
}

// ---- Recording Progress ----

function startProgressLoop(){
  const circumference = 100.531; // 2*PI*16 for r=16
  progressBar.style.strokeDasharray = `${circumference} ${circumference}`;
  progressBar.style.strokeDashoffset = circumference;
  
  progressInterval = setInterval(()=> {
    if (!isRecording) return;
    const elapsed = performance.now() - recordStartTs;
    // 8 second max cycle for progress ring
    const maxDuration = 8000; // 8 seconds
    const progress = Math.min(elapsed / maxDuration, 1);
    const offset = circumference * (1 - progress);
    progressBar.style.strokeDashoffset = offset;
  }, 50); // Higher frequency for smoother animation
}

function stopProgressLoop(){
  clearInterval(progressInterval);
  const circumference = 100.531;
  progressBar.style.strokeDashoffset = circumference;
}

// ---- Preview System ----
function showPreview(file, type) {
  currentFile = file;
  
  console.log(`Showing preview for ${type}:`, file.name, file.size, file.type);
  
  if (type === 'image') {
    previewImage.src = URL.createObjectURL(file);
    previewImage.style.display = 'block';
    previewVideo.style.display = 'none';
    previewVideo.pause();
  } else if (type === 'video') {
    const videoUrl = URL.createObjectURL(file);
    console.log('Video URL created:', videoUrl);
    
    previewVideo.src = videoUrl;
    previewVideo.style.display = 'block';
    previewImage.style.display = 'none';
    
    // Force video to load and play
    previewVideo.load();
    previewVideo.currentTime = 0;
    
    // Attempt to play when loaded
    previewVideo.addEventListener('loadeddata', () => {
      console.log('Video loaded, attempting to play');
      previewVideo.play().catch(err => {
        console.warn('Autoplay failed:', err);
      });
    }, { once: true });
    
    previewVideo.addEventListener('error', (e) => {
      console.error('Video error:', e, previewVideo.error);
    });
  }
  
  previewContainer.classList.add('show');
}

function closePreview() {
  previewContainer.classList.remove('show');
  
  // Pause video if playing
  if (previewVideo.src) {
    previewVideo.pause();
    previewVideo.currentTime = 0;
  }
  
  // Clean up URLs after a small delay to allow transitions
  setTimeout(() => {
    if (previewImage.src) {
      URL.revokeObjectURL(previewImage.src);
      previewImage.src = '';
      previewImage.style.display = 'none';
    }
    if (previewVideo.src) {
      URL.revokeObjectURL(previewVideo.src);
      previewVideo.src = '';
      previewVideo.style.display = 'none';
    }
  }, 300);
  
  currentFile = null;
}

async function shareFromPreview() {
  if (!currentFile) return;
  
  // Try Web Share API first
  if (navigator.canShare && navigator.canShare({ files: [currentFile] })) {
    try {
      await navigator.share({
        files: [currentFile],
        title: currentFile.name
      });
      closePreview();
      return;
    } catch (err) {
      console.log('Share cancelled or failed:', err);
      // If share was cancelled, don't fallback to download
      if (err.name === 'AbortError') {
        return; // User cancelled, stay in preview
      }
    }
  }
  
  // Fallback to download if share not available or failed (not cancelled)
  downloadFromPreview();
}

function downloadFromPreview() {
  if (!currentFile) return;
  const url = URL.createObjectURL(currentFile);
  const a = document.createElement('a');
  a.href = url;
  a.download = currentFile.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  closePreview();
}
