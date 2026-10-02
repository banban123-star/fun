const videoElement = document.querySelector('.input_video');
const svgElement = document.getElementById('ar-svg');
const landmarksGroup = document.getElementById('landmarks-group');
const connectionsGroup = document.getElementById('connections-group');

const statusText = document.getElementById('status-text');
const coordData = document.getElementById('coord-data');
const targetReticle = document.getElementById('target-reticle');
const nodeTracker = document.getElementById('node-tracker');
const targetStatus = document.getElementById('target-status');

// This function dynamically calculates screen coords based on object-fit: cover cropping
function getMappedCoordinates(normalizedX, normalizedY) {
  const videoRect = videoElement.getBoundingClientRect();
  
  // Guard against video not being loaded yet
  if (!videoElement.videoWidth || !videoElement.videoHeight) return { x: 0, y: 0 };

  const videoRatio = videoElement.videoWidth / videoElement.videoHeight;
  const containerRatio = videoRect.width / videoRect.height;

  let drawWidth, drawHeight, offsetX = 0, offsetY = 0;

  if (videoRatio > containerRatio) {
    // Video is wider than screen (cropped on sides)
    drawHeight = videoRect.height;
    drawWidth = drawHeight * videoRatio;
    offsetX = (videoRect.width - drawWidth) / 2;
  } else {
    // Video is taller than screen (cropped top/bottom)
    drawWidth = videoRect.width;
    drawHeight = drawWidth / videoRatio;
    offsetY = (videoRect.height - drawHeight) / 2;
  }

  // Camera is mirrored, so we invert the X coordinate
  return {
    x: ((1 - normalizedX) * drawWidth) + offsetX,
    y: (normalizedY * drawHeight) + offsetY
  };
}

function drawNanoInterface(results) {
  // Make sure the SVG always matches the screen size
  svgElement.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
  
  landmarksGroup.innerHTML = '';
  connectionsGroup.innerHTML = '';

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    statusText.innerText = "SYS: ANATOMY LOCKED";
    targetReticle.classList.remove('hidden');
    nodeTracker.classList.remove('hidden');

    const landmarks = results.multiHandLandmarks[0];

    // --- PALM TRACKING ---
    const palmBase = landmarks[0], indexBase = landmarks[5], pinkyBase = landmarks[17];
    const avgNormalizedX = (palmBase.x + indexBase.x + pinkyBase.x) / 3;
    const avgNormalizedY = (palmBase.y + indexBase.y + pinkyBase.y) / 3;
    
    const palmCenter = getMappedCoordinates(avgNormalizedX, avgNormalizedY);
    
    targetReticle.style.left = `${palmCenter.x}px`;
    targetReticle.style.top = `${palmCenter.y}px`;

    // --- INDEX FINGER TRACKING ---
    const indexTip = getMappedCoordinates(landmarks[8].x, landmarks[8].y);
    nodeTracker.style.left = `${indexTip.x}px`;
    nodeTracker.style.top = `${indexTip.y}px`;

    // --- GESTURE RECOGNITION (1 Finger) ---
    let fingersRaised = 0;
    const tips = [8, 12, 16, 20];
    const pips = [6, 10, 14, 18];

    for (let i = 0; i < 4; i++) {
      if (landmarks[tips[i]].y < landmarks[pips[i]].y) {
        fingersRaised++;
      }
    }

    if (fingersRaised === 1 && landmarks[8].y < landmarks[6].y) {
      targetStatus.classList.remove('hidden');
      nodeTracker.querySelector('.tracker-label').innerHTML = `TARGET: IVAN<br><span>DOWNLOADING...</span>`;
    } else {
      targetStatus.classList.add('hidden');
      nodeTracker.querySelector('.tracker-label').innerHTML = `NODE_08<br><span>ANALYZING...</span>`;
    }

    // --- HUD DATA ---
    coordData.innerText = `X:${Math.round(palmBase.x * 100)} Y:${Math.round(palmBase.y * 100)} Z:${Math.round(palmBase.z * 100)}`;

    // --- DRAW VEINS & NODES (SVG) ---
    const pathData = HAND_CONNECTIONS.map(connection => {
      const start = getMappedCoordinates(landmarks[connection[0]].x, landmarks[connection[0]].y);
      const end = getMappedCoordinates(landmarks[connection[1]].x, landmarks[connection[1]].y);
      return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    }).join(' ');

    const newPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    newPath.setAttribute('d', pathData);
    connectionsGroup.appendChild(newPath);

    landmarks.forEach((landmark, index) => {
      const point = getMappedCoordinates(landmark.x, landmark.y);
      const newCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      newCircle.setAttribute('cx', point.x);
      newCircle.setAttribute('cy', point.y);
      newCircle.setAttribute('r', [4, 8, 12, 16, 20].includes(index) ? 5 : 3);
      landmarksGroup.appendChild(newCircle);
    });

  } else {
    statusText.innerText = "SYS: SCANNING...";
    coordData.innerText = "X:--- Y:--- Z:---";
    targetReticle.classList.add('hidden');
    nodeTracker.classList.add('hidden');
    targetStatus.classList.add('hidden');
  }
}

const hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
hands.setOptions({ maxNumHands: 1, modelComplexity: 1, minDetectionConfidence: 0.7, minTrackingConfidence: 0.7 });
hands.onResults(drawNanoInterface);

// Using responsive constraints for the camera
const camera = new Camera(videoElement, {
  onFrame: async () => { await hands.send({ image: videoElement }); },
  // Remove fixed width/height so it requests the best available resolution for the device
});
camera.start();

// Ensure UI recalibrates if the user rotates their phone
window.addEventListener('resize', () => {
  svgElement.setAttribute('viewBox', `0 0 ${window.innerWidth} ${window.innerHeight}`);
});