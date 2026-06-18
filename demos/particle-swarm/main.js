import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.152.0/build/three.module.js';
import { FilesetResolver, HandLandmarker } from 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8';

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    // Particle System
    PARTICLE_COUNT: 350,
    PARTICLE_SIZE: 40,
    PARTICLE_SIZE_VARIANCE: 15,

    // Physics
    ATTRACT_STRENGTH: 0.018,
    REPEL_STRENGTH: 0.028,
    MAX_SPEED: 0.06,
    FRICTION: 0.985,
    DRIFT_STRENGTH: 0.0015,

    // Flocking (Boids)
    COHESION_RADIUS: 0.12,
    SEPARATION_RADIUS: 0.05,
    ALIGNMENT_RADIUS: 0.1,
    COHESION_STRENGTH: 0.0002,
    SEPARATION_STRENGTH: 0.0015,
    ALIGNMENT_STRENGTH: 0.0003,

    // Force Falloff
    FORCE_RADIUS: 0.25,
    FALLOFF_POWER: 1.0,

    // All black particles
    COLORS: [
        0x000000,  // Black
        0x000000,  // Black
        0x000000,  // Black
        0x000000,  // Black
        0x000000,  // Black
        0x000000,  // Black
        0x000000,  // Black
        0x000000,  // Black
    ],

    // Visual
    GLOW_INTENSITY: 0.85,
    PULSE_SPEED: 0.003,
    PULSE_AMPLITUDE: 0.25,

    // Hand Tracking
    SMOOTHING_FACTOR: 0.12,
    FIST_THRESHOLD: 1.2,

    // Boundaries
    SOFT_BOUNCE_STRENGTH: 0.015,
    BOUNDARY_MARGIN: 0.08,

    // Geometric Pattern
    PATTERN_RADIUS: 0.08,
    PATTERN_STRENGTH: 0.035,
    PATTERN_ROTATION_SPEED: 0.03,
    PATTERN_TILT_SPEED: 0.015
};

// ============================================
// GLOBAL STATE
// ============================================
let scene, camera, renderer;
let particleSystem;
let handLandmarker;
let videoElement;
let lastVideoTime = -1;

// Hand tracking state
let handState = {
    detected: false,
    palmPosition: { x: 0.5, y: 0.5 },
    smoothedPosition: { x: 0.5, y: 0.5 },
    isFist: false
};

// Particle data arrays
let positions, velocities, colors, sizes, baseColors;
let colorIndices;
let velocitiesZ; // Z-axis velocity for 3D movement

// FPS tracking
let frameCount = 0;
let lastFpsTime = performance.now();
let currentFps = 0;

// Animation time
let time = 0;
let patternTime = 0;
let patternTilt = 0;

// ============================================
// INITIALIZATION
// ============================================
async function init() {
    try {
        await setupWebcam();
        setupThreeJS();
        createParticleSystem();
        await setupMediaPipe();

        document.body.classList.remove('loading');
        animate();
    } catch (error) {
        console.error('Initialization failed:', error);
        document.body.classList.remove('loading');
        document.getElementById('hand-status').textContent = 'Error: ' + error.message;
    }
}

// ============================================
// WEBCAM SETUP
// ============================================
async function setupWebcam() {
    videoElement = document.getElementById('webcam');

    const constraints = {
        video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
        }
    };

    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        videoElement.srcObject = stream;

        return new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                resolve();
            };
        });
    } catch (error) {
        throw new Error('Camera access denied. Please allow camera access.');
    }
}

// ============================================
// THREE.JS SETUP
// ============================================
function setupThreeJS() {
    scene = new THREE.Scene();

    // Orthographic camera for 2D overlay
    const aspect = window.innerWidth / window.innerHeight;
    camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10);
    camera.position.z = 1;

    renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    document.getElementById('particle-canvas').appendChild(renderer.domElement);

    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

function onWindowResize() {
    const aspect = window.innerWidth / window.innerHeight;
    camera.left = -aspect;
    camera.right = aspect;
    camera.top = 1;
    camera.bottom = -1;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// MEDIAPIPE SETUP
// ============================================
async function setupMediaPipe() {
    const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
            delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: 1,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    document.getElementById('hand-status').textContent = 'Hand: Ready';
}

// ============================================
// PARTICLE SYSTEM
// ============================================
function createParticleSystem() {
    const geometry = new THREE.BufferGeometry();
    const count = CONFIG.PARTICLE_COUNT;

    positions = new Float32Array(count * 3);
    velocities = new Float32Array(count * 2);
    velocitiesZ = new Float32Array(count); // Z velocity
    colors = new Float32Array(count * 3);
    sizes = new Float32Array(count);
    baseColors = new Float32Array(count * 3);
    colorIndices = new Uint8Array(count);

    const aspect = window.innerWidth / window.innerHeight;

    for (let i = 0; i < count; i++) {
        // Random position in 3D view space
        positions[i * 3] = (Math.random() - 0.5) * 2 * aspect;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 2;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 2; // Random Z depth

        // Small random initial velocity in 3D
        velocities[i * 2] = (Math.random() - 0.5) * 0.01;
        velocities[i * 2 + 1] = (Math.random() - 0.5) * 0.01;
        velocitiesZ[i] = (Math.random() - 0.5) * 0.01;

        // Random color from palette
        const colorIndex = Math.floor(Math.random() * CONFIG.COLORS.length);
        colorIndices[i] = colorIndex;
        const color = new THREE.Color(CONFIG.COLORS[colorIndex]);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
        baseColors[i * 3] = color.r;
        baseColors[i * 3 + 1] = color.g;
        baseColors[i * 3 + 2] = color.b;

        // Random size
        sizes[i] = CONFIG.PARTICLE_SIZE + (Math.random() - 0.5) * CONFIG.PARTICLE_SIZE_VARIANCE;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Custom shader for soft particles with black/white support
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 }
        },
        vertexShader: `
            attribute float size;
            varying vec3 vColor;

            void main() {
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;

            void main() {
                vec2 center = gl_PointCoord - vec2(0.5);
                float dist = length(center);

                // White outer glow/shadow
                float outerGlow = exp(-dist * 3.0) * 0.9;
                float outerAlpha = smoothstep(0.5, 0.2, dist);

                // Black core
                float coreAlpha = 1.0 - smoothstep(0.0, 0.35, dist);

                // White ring/edge between core and glow
                float ring = smoothstep(0.25, 0.35, dist) * (1.0 - smoothstep(0.35, 0.5, dist));

                // Combine: white glow outside, white ring, black core inside
                vec3 white = vec3(1.0);
                vec3 black = vec3(0.0);

                // Layer the effects
                vec3 finalColor = mix(white, black, coreAlpha);
                finalColor = mix(finalColor, white, ring * 0.8);

                float finalAlpha = max(coreAlpha, outerAlpha * 0.7);
                finalAlpha = max(finalAlpha, ring * 0.9);

                gl_FragColor = vec4(finalColor, finalAlpha * 0.95);
            }
        `,
        transparent: true,
        blending: THREE.NormalBlending,
        depthWrite: false,
        vertexColors: true
    });

    particleSystem = new THREE.Points(geometry, material);
    scene.add(particleSystem);
}

// ============================================
// HAND DETECTION
// ============================================
function detectHand() {
    if (!handLandmarker || !videoElement.videoWidth) return;

    const currentTime = performance.now();
    if (videoElement.currentTime === lastVideoTime) return;
    lastVideoTime = videoElement.currentTime;

    const results = handLandmarker.detectForVideo(videoElement, currentTime);

    if (results.landmarks && results.landmarks.length > 0) {
        const landmarks = results.landmarks[0];

        // Get palm position (landmark 9 = middle finger MCP)
        const palm = landmarks[9];

        // Mirror X coordinate and convert to target position
        const targetX = 1 - palm.x;
        const targetY = palm.y;

        // Smooth the position
        handState.smoothedPosition.x += (targetX - handState.smoothedPosition.x) * CONFIG.SMOOTHING_FACTOR;
        handState.smoothedPosition.y += (targetY - handState.smoothedPosition.y) * CONFIG.SMOOTHING_FACTOR;

        handState.palmPosition = { x: targetX, y: targetY };
        handState.detected = true;
        handState.isFist = isFist(landmarks);

        // Update UI
        document.getElementById('hand-status').textContent = 'Hand: Detected';
        document.getElementById('gesture').textContent =
            'Gesture: ' + (handState.isFist ? 'Fist (Collect)' : 'Open (Repel)');
    } else {
        handState.detected = false;
        document.getElementById('hand-status').textContent = 'Hand: Not detected';
        document.getElementById('gesture').textContent = 'Gesture: --';
    }
}

function isFist(landmarks) {
    const wrist = landmarks[0];

    // Fingertip landmarks
    const fingertips = [
        landmarks[4],   // Thumb
        landmarks[8],   // Index
        landmarks[12],  // Middle
        landmarks[16],  // Ring
        landmarks[20]   // Pinky
    ];

    // Finger base landmarks (MCP joints)
    const fingerBases = [
        landmarks[2],   // Thumb CMC
        landmarks[5],   // Index MCP
        landmarks[9],   // Middle MCP
        landmarks[13],  // Ring MCP
        landmarks[17]   // Pinky MCP
    ];

    let closedFingers = 0;

    for (let i = 0; i < 5; i++) {
        const tipToWrist = distance(fingertips[i].x, fingertips[i].y, wrist.x, wrist.y);
        const baseToWrist = distance(fingerBases[i].x, fingerBases[i].y, wrist.x, wrist.y);

        // Finger is closed if tip is closer to wrist than base
        if (tipToWrist < baseToWrist * CONFIG.FIST_THRESHOLD) {
            closedFingers++;
        }
    }

    // Fist if 4+ fingers closed
    return closedFingers >= 4;
}

// ============================================
// PARTICLE PHYSICS
// ============================================
function updateParticles() {
    const aspect = window.innerWidth / window.innerHeight;

    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
        // Apply forces
        applyHandForce(i, aspect);
        applyFlocking(i);
        applyRandomDrift(i);

        // Apply friction
        velocities[i * 2] *= CONFIG.FRICTION;
        velocities[i * 2 + 1] *= CONFIG.FRICTION;
        velocitiesZ[i] *= CONFIG.FRICTION;

        // Clamp velocity (3D)
        const vx = velocities[i * 2];
        const vy = velocities[i * 2 + 1];
        const vz = velocitiesZ[i];
        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
        if (speed > CONFIG.MAX_SPEED) {
            const scale = CONFIG.MAX_SPEED / speed;
            velocities[i * 2] = vx * scale;
            velocities[i * 2 + 1] = vy * scale;
            velocitiesZ[i] = vz * scale;
        }

        // Update position (3D)
        positions[i * 3] += velocities[i * 2];
        positions[i * 3 + 1] += velocities[i * 2 + 1];
        positions[i * 3 + 2] += velocitiesZ[i];

        // Handle boundaries
        handleBoundary(i, aspect);
    }

    particleSystem.geometry.attributes.position.needsUpdate = true;
}

function applyHandForce(i, aspect) {
    if (!handState.detected) return;

    // Convert particle position to normalized space
    const px = (positions[i * 3] / aspect + 1) / 2;
    const py = (-positions[i * 3 + 1] + 1) / 2;

    const hx = handState.smoothedPosition.x;
    const hy = handState.smoothedPosition.y;

    const dx = px - hx;
    const dy = py - hy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.001 || dist > CONFIG.FORCE_RADIUS) return;

    // Direction from hand to particle (for repulsion)
    const nx = dx / dist;
    const ny = dy / dist;

    // Force falloff
    const falloff = Math.pow(1 - dist / CONFIG.FORCE_RADIUS, CONFIG.FALLOFF_POWER);

    if (handState.isFist) {
        // COLLECT MODE: Form 3D sphere pattern around hand
        // Use golden ratio spiral for even sphere distribution
        const goldenRatio = (1 + Math.sqrt(5)) / 2;
        const goldenAngle = 2 * Math.PI / (goldenRatio * goldenRatio);

        // Sphere point distribution using Fibonacci sphere
        const t = i / CONFIG.PARTICLE_COUNT;
        const inclination = Math.acos(1 - 2 * t); // 0 to PI
        const azimuth = goldenAngle * i + patternTime; // rotating around Y axis

        // Convert spherical to 2D projection (simulate 3D sphere)
        const sphereRadius = CONFIG.PATTERN_RADIUS * 0.8;

        // Base 3D sphere coordinates
        let x3d = Math.sin(inclination) * Math.cos(azimuth);
        let y3d = Math.sin(inclination) * Math.sin(azimuth);
        let z3d = Math.cos(inclination);

        // Apply rotation around X axis (tilt)
        const cosT = Math.cos(patternTilt);
        const sinT = Math.sin(patternTilt);
        const y3dRotated = y3d * cosT - z3d * sinT;
        const z3dRotated = y3d * sinT + z3d * cosT;
        y3d = y3dRotated;
        z3d = z3dRotated;

        // Apply rotation around Z axis for more dynamic movement
        const cosZ = Math.cos(patternTime * 0.7);
        const sinZ = Math.sin(patternTime * 0.7);
        const x3dRotated = x3d * cosZ - y3d * sinZ;
        const y3dRotated2 = x3d * sinZ + y3d * cosZ;
        x3d = x3dRotated;
        y3d = y3dRotated2;

        // Project to 2D with perspective (z affects size, handled in visual effects)
        const perspective = 1 + z3d * 0.3; // slight depth scaling
        const targetX = hx + x3d * sphereRadius * perspective;
        const targetY = hy + y3d * sphereRadius * perspective;

        // Store z depth for particle sizing (front particles bigger)
        positions[i * 3 + 2] = z3d;

        // Steer toward target position in 3D
        const toTargetX = targetX - px;
        const toTargetY = targetY - py;
        const currentZ = positions[i * 3 + 2];
        const toTargetZ = z3d - currentZ;
        const targetDist = Math.sqrt(toTargetX * toTargetX + toTargetY * toTargetY + toTargetZ * toTargetZ);

        if (targetDist > 0.001) {
            const steerStrength = CONFIG.PATTERN_STRENGTH * (1 + falloff);
            velocities[i * 2] += (toTargetX / targetDist) * steerStrength * aspect;
            velocities[i * 2 + 1] -= (toTargetY / targetDist) * steerStrength;
            velocitiesZ[i] += (toTargetZ / targetDist) * steerStrength;
        }
    } else {
        // REPEL MODE: Push particles away in 3D
        velocities[i * 2] += nx * CONFIG.REPEL_STRENGTH * falloff * aspect;
        velocities[i * 2 + 1] -= ny * CONFIG.REPEL_STRENGTH * falloff;
        // Add some random Z push when repelling
        velocitiesZ[i] += (Math.random() - 0.5) * CONFIG.REPEL_STRENGTH * falloff;
    }
}

function applyFlocking(i) {
    const px = positions[i * 3];
    const py = positions[i * 3 + 1];

    let cohesionX = 0, cohesionY = 0, cohesionCount = 0;
    let separationX = 0, separationY = 0;
    let alignmentX = 0, alignmentY = 0, alignmentCount = 0;

    // Sample subset for performance
    const sampleSize = Math.min(25, CONFIG.PARTICLE_COUNT);
    const step = Math.floor(CONFIG.PARTICLE_COUNT / sampleSize);

    for (let j = 0; j < CONFIG.PARTICLE_COUNT; j += step) {
        if (j === i) continue;

        const ox = positions[j * 3];
        const oy = positions[j * 3 + 1];
        const dist = distance(px, py, ox, oy);

        // Cohesion
        if (dist < CONFIG.COHESION_RADIUS) {
            cohesionX += ox;
            cohesionY += oy;
            cohesionCount++;
        }

        // Separation
        if (dist < CONFIG.SEPARATION_RADIUS && dist > 0.001) {
            separationX += (px - ox) / dist;
            separationY += (py - oy) / dist;
        }

        // Alignment
        if (dist < CONFIG.ALIGNMENT_RADIUS) {
            alignmentX += velocities[j * 2];
            alignmentY += velocities[j * 2 + 1];
            alignmentCount++;
        }
    }

    // Apply cohesion
    if (cohesionCount > 0) {
        cohesionX = cohesionX / cohesionCount - px;
        cohesionY = cohesionY / cohesionCount - py;
        velocities[i * 2] += cohesionX * CONFIG.COHESION_STRENGTH;
        velocities[i * 2 + 1] += cohesionY * CONFIG.COHESION_STRENGTH;
    }

    // Apply separation
    velocities[i * 2] += separationX * CONFIG.SEPARATION_STRENGTH;
    velocities[i * 2 + 1] += separationY * CONFIG.SEPARATION_STRENGTH;

    // Apply alignment
    if (alignmentCount > 0) {
        alignmentX /= alignmentCount;
        alignmentY /= alignmentCount;
        velocities[i * 2] += (alignmentX - velocities[i * 2]) * CONFIG.ALIGNMENT_STRENGTH;
        velocities[i * 2 + 1] += (alignmentY - velocities[i * 2 + 1]) * CONFIG.ALIGNMENT_STRENGTH;
    }
}

function applyRandomDrift(i) {
    velocities[i * 2] += (Math.random() - 0.5) * CONFIG.DRIFT_STRENGTH;
    velocities[i * 2 + 1] += (Math.random() - 0.5) * CONFIG.DRIFT_STRENGTH;
    velocitiesZ[i] += (Math.random() - 0.5) * CONFIG.DRIFT_STRENGTH;
}

function handleBoundary(i, aspect) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const margin = CONFIG.BOUNDARY_MARGIN;

    // Soft bounce at edges (X, Y, Z)
    if (x < -aspect + margin) velocities[i * 2] += CONFIG.SOFT_BOUNCE_STRENGTH;
    if (x > aspect - margin) velocities[i * 2] -= CONFIG.SOFT_BOUNCE_STRENGTH;
    if (y < -1 + margin) velocities[i * 2 + 1] += CONFIG.SOFT_BOUNCE_STRENGTH;
    if (y > 1 - margin) velocities[i * 2 + 1] -= CONFIG.SOFT_BOUNCE_STRENGTH;
    if (z < -1 + margin) velocitiesZ[i] += CONFIG.SOFT_BOUNCE_STRENGTH;
    if (z > 1 - margin) velocitiesZ[i] -= CONFIG.SOFT_BOUNCE_STRENGTH;

    // Hard clamp to prevent escape
    positions[i * 3] = clamp(x, -aspect * 1.1, aspect * 1.1);
    positions[i * 3 + 1] = clamp(y, -1.1, 1.1);
    positions[i * 3 + 2] = clamp(z, -1.1, 1.1);
}

// ============================================
// VISUAL EFFECTS
// ============================================
function updateVisualEffects() {
    time += CONFIG.PULSE_SPEED;

    const sizeAttr = particleSystem.geometry.attributes.size;
    const colorAttr = particleSystem.geometry.attributes.color;

    for (let i = 0; i < CONFIG.PARTICLE_COUNT; i++) {
        // Individual phase offset for organic feel
        const phase = i * 0.15;

        // Base size
        let baseSize = CONFIG.PARTICLE_SIZE +
            (colorIndices[i] / CONFIG.COLORS.length - 0.5) * CONFIG.PARTICLE_SIZE_VARIANCE;

        // Z-depth based sizing for 3D sphere effect (front = bigger, back = smaller)
        const zDepth = positions[i * 3 + 2];
        const depthScale = 0.6 + (zDepth + 1) * 0.4; // Range from 0.6 to 1.4
        baseSize *= depthScale;

        // Pulse size
        const pulse = Math.sin(time + phase) * CONFIG.PULSE_AMPLITUDE;
        sizeAttr.array[i] = baseSize * (1 + pulse * 0.3);

        // Velocity-based brightness boost
        const vx = velocities[i * 2];
        const vy = velocities[i * 2 + 1];
        const speed = Math.sqrt(vx * vx + vy * vy);
        const brightness = 1 + speed * 8;

        // Z-depth based opacity (front brighter, back dimmer) for 3D effect
        const depthBrightness = 0.5 + (zDepth + 1) * 0.5; // Range 0.5 to 1.5

        // Apply brightness to color
        colorAttr.array[i * 3] = Math.min(1, baseColors[i * 3] * brightness * depthBrightness);
        colorAttr.array[i * 3 + 1] = Math.min(1, baseColors[i * 3 + 1] * brightness * depthBrightness);
        colorAttr.array[i * 3 + 2] = Math.min(1, baseColors[i * 3 + 2] * brightness * depthBrightness);
    }

    sizeAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
}

// ============================================
// ANIMATION LOOP
// ============================================
function animate() {
    requestAnimationFrame(animate);

    // Update FPS
    frameCount++;
    const now = performance.now();
    if (now - lastFpsTime >= 1000) {
        currentFps = frameCount;
        frameCount = 0;
        lastFpsTime = now;
        document.getElementById('fps').textContent = 'FPS: ' + currentFps;
    }

    // Detect hand
    detectHand();

    // Update pattern rotation (only when collecting)
    if (handState.detected && handState.isFist) {
        patternTime += CONFIG.PATTERN_ROTATION_SPEED;
        patternTilt += CONFIG.PATTERN_TILT_SPEED;
    }

    // Update particles
    updateParticles();

    // Update visual effects
    updateVisualEffects();

    // Render
    renderer.render(scene, camera);
}

// ============================================
// UTILITIES
// ============================================
function lerp(a, b, t) {
    return a + (b - a) * t;
}

function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
}

function distance(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// ============================================
// START APPLICATION
// ============================================
document.addEventListener('DOMContentLoaded', init);
