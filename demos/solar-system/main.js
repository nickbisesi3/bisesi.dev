/**
 * Solar System Explorer
 * An educational hand-gesture controlled tour of our solar system
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const videoElement = document.getElementById('webcam');
    const canvasElement = document.getElementById('canvas');
    const canvasCtx = canvasElement.getContext('2d');
    const statusElement = document.getElementById('status');
    const planetInfoElement = document.getElementById('planet-info');
    const planetNameElement = document.getElementById('planet-name');
    const planetFactsElement = document.getElementById('planet-facts');
    const zoomLevelElement = document.getElementById('zoom-level');

    // Three.js variables
    let scene, camera, renderer;
    let planets = [];
    let sun;
    let starField;
    let selectedPlanet = null;
    let hoveredPlanet = null;

    // Hand tracking state
    let isTracking = false;
    let handPosition = { x: 0.5, y: 0.5 };
    let smoothedPosition = { x: 0.5, y: 0.5 };
    let isPinching = false;
    let wasPinching = false;
    let pinchDistance = 0;
    let zoomLevel = 1;
    let targetZoom = 1;

    // Position smoothing - history buffer for averaging
    const positionHistory = [];
    const HISTORY_SIZE = 5;
    let lastRawPosition = { x: 0.5, y: 0.5 };
    let handVelocity = 0;

    // Pinch detection with hysteresis
    const PINCH_ACTIVATE = 0.05;    // Distance to start pinch
    const PINCH_DEACTIVATE = 0.09;  // Distance to end pinch
    const PINCH_DEBOUNCE = 50;      // ms
    let pinchStartTime = 0;
    let pinchConfirmed = false;

    // Two-hand tracking for pan gesture
    // Store hands by index (not handedness) to avoid duplicate label issues
    let handsData = [];
    let isTwoHandPinching = false;
    let twoHandPinchStart = null;  // Starting midpoint when two-hand pinch began
    let twoHandStartDistance = 0;  // Starting distance between hands for zoom
    let zoomStart = 1;             // Starting zoom level when two-hand gesture began
    let orbitAngleStart = 0;
    let orbitTiltStart = 0;

    // Grab/drag state
    let grabbedPlanet = null;
    let grabOffset = new THREE.Vector3();
    let originalOrbitPaused = false;

    // Audio
    let audioInitialized = false;
    let selectSynth = null;

    // Configuration
    const CONFIG = {
        smoothingFactor: 0.12,
        pinchThreshold: 0.07,
        zoomSpeed: 0.02,
        minZoom: 0.5,
        maxZoom: 3,
        orbitSpeed: 0.001
    };

    // Planet data with educational facts
    const PLANET_DATA = [
        {
            name: 'Mercury',
            color: 0xB5B5B5,
            size: 0.15,
            distance: 2,
            orbitSpeed: 4.15,
            facts: {
                'Distance from Sun': '57.9 million km',
                'Day Length': '59 Earth days',
                'Year Length': '88 Earth days',
                'Fun Fact': 'Mercury has no atmosphere, so its temperature swings from -180°C to 430°C!'
            }
        },
        {
            name: 'Venus',
            color: 0xE6C87A,
            size: 0.25,
            distance: 3,
            orbitSpeed: 1.62,
            facts: {
                'Distance from Sun': '108.2 million km',
                'Day Length': '243 Earth days',
                'Year Length': '225 Earth days',
                'Fun Fact': 'Venus spins backwards compared to most planets!'
            }
        },
        {
            name: 'Earth',
            color: 0x6B93D6,
            size: 0.27,
            distance: 4,
            orbitSpeed: 1,
            facts: {
                'Distance from Sun': '149.6 million km',
                'Day Length': '24 hours',
                'Year Length': '365.25 days',
                'Fun Fact': 'Earth is the only planet not named after a Greek or Roman god!'
            }
        },
        {
            name: 'Mars',
            color: 0xC1440E,
            size: 0.2,
            distance: 5.2,
            orbitSpeed: 0.53,
            facts: {
                'Distance from Sun': '227.9 million km',
                'Day Length': '24.6 hours',
                'Year Length': '687 Earth days',
                'Fun Fact': 'Mars has the tallest volcano in the solar system - Olympus Mons!'
            }
        },
        {
            name: 'Jupiter',
            color: 0xD8CA9D,
            size: 0.7,
            distance: 7,
            orbitSpeed: 0.084,
            facts: {
                'Distance from Sun': '778.5 million km',
                'Day Length': '10 hours',
                'Year Length': '12 Earth years',
                'Fun Fact': 'Jupiter\'s Great Red Spot is a storm that has lasted over 400 years!'
            }
        },
        {
            name: 'Saturn',
            color: 0xEAD6B8,
            size: 0.6,
            distance: 9,
            orbitSpeed: 0.034,
            hasRings: true,
            facts: {
                'Distance from Sun': '1.4 billion km',
                'Day Length': '10.7 hours',
                'Year Length': '29 Earth years',
                'Fun Fact': 'Saturn is so light it would float if you could put it in a giant bathtub!'
            }
        },
        {
            name: 'Uranus',
            color: 0xD1E7E7,
            size: 0.4,
            distance: 11,
            orbitSpeed: 0.012,
            facts: {
                'Distance from Sun': '2.9 billion km',
                'Day Length': '17 hours',
                'Year Length': '84 Earth years',
                'Fun Fact': 'Uranus rotates on its side like a rolling ball!'
            }
        },
        {
            name: 'Neptune',
            color: 0x5B5DDF,
            size: 0.38,
            distance: 13,
            orbitSpeed: 0.006,
            facts: {
                'Distance from Sun': '4.5 billion km',
                'Day Length': '16 hours',
                'Year Length': '165 Earth years',
                'Fun Fact': 'Neptune has the strongest winds in the solar system - up to 2,100 km/h!'
            }
        }
    ];

    // ==========================================
    // CANVAS SIZE
    // ==========================================

    function updateCanvasSize() {
        canvasElement.width = window.innerWidth;
        canvasElement.height = window.innerHeight;
    }

    // Convert normalized landmark coords to canvas pixels
    // Accounts for object-fit: cover on the webcam
    function landmarkToCanvas(normX, normY) {
        const videoAspect = 1280 / 720;  // Webcam aspect ratio
        const canvasAspect = canvasElement.width / canvasElement.height;

        let x, y;

        if (canvasAspect > videoAspect) {
            // Canvas is wider - video is cropped top/bottom
            const scale = canvasElement.width / 1280;
            const videoHeight = 720 * scale;
            const offsetY = (canvasElement.height - videoHeight) / 2;

            x = normX * canvasElement.width;
            y = offsetY + normY * videoHeight;
        } else {
            // Canvas is taller - video is cropped left/right
            const scale = canvasElement.height / 720;
            const videoWidth = 1280 * scale;
            const offsetX = (canvasElement.width - videoWidth) / 2;

            x = offsetX + normX * videoWidth;
            y = normY * canvasElement.height;
        }

        return { x, y };
    }

    // ==========================================
    // AUDIO INITIALIZATION
    // ==========================================

    async function initAudio() {
        if (audioInitialized) return;
        try {
            await Tone.start();
            selectSynth = new Tone.PolySynth(Tone.Synth, {
                oscillator: { type: 'sine' },
                envelope: { attack: 0.01, decay: 0.3, sustain: 0.2, release: 0.5 }
            }).toDestination();
            selectSynth.volume.value = -10;
            audioInitialized = true;
        } catch (e) {
            console.log('Audio not available');
        }
    }

    function playSelectSound() {
        if (selectSynth) {
            selectSynth.triggerAttackRelease(['C5', 'E5', 'G5'], '8n');
        }
    }

    function playHoverSound() {
        if (selectSynth) {
            selectSynth.triggerAttackRelease('G5', '16n');
        }
    }

    function playGrabSound() {
        if (selectSynth) {
            selectSynth.triggerAttackRelease(['E4', 'G4'], '16n');
        }
    }

    function playDropSound() {
        if (selectSynth) {
            selectSynth.triggerAttackRelease(['G4', 'C4'], '8n');
        }
    }

    // ==========================================
    // WEBCAM INITIALIZATION
    // ==========================================

    async function initWebcam() {
        statusElement.textContent = 'Requesting camera access...';
        statusElement.classList.add('loading');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
            });
            videoElement.srcObject = stream;
            return new Promise((resolve) => {
                videoElement.onloadedmetadata = () => {
                    updateCanvasSize();
                    resolve();
                };
            });
        } catch (error) {
            statusElement.classList.remove('loading');
            statusElement.textContent = 'Camera access denied. Please allow camera.';
            throw error;
        }
    }

    // ==========================================
    // THREE.JS SCENE SETUP
    // ==========================================

    function initThreeJS() {
        scene = new THREE.Scene();

        camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        camera.position.set(0, 8, 18);
        camera.lookAt(0, 0, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000, 0);
        document.getElementById('three-canvas').appendChild(renderer.domElement);

        // Ambient light
        const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
        scene.add(ambientLight);

        // Create sun
        createSun();

        // Create planets
        createPlanets();

        // Create star field
        createStarField();

        // Start animation
        animate();
    }

    function createSun() {
        const geometry = new THREE.SphereGeometry(1, 32, 32);
        const material = new THREE.MeshBasicMaterial({
            color: 0xFFDD00,
            transparent: true,
            opacity: 0.9
        });
        sun = new THREE.Mesh(geometry, material);
        scene.add(sun);

        // Sun glow
        const glowGeometry = new THREE.SphereGeometry(1.3, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: 0xFFAA00,
            transparent: true,
            opacity: 0.3
        });
        const glow = new THREE.Mesh(glowGeometry, glowMaterial);
        sun.add(glow);

        // Point light from sun
        const sunLight = new THREE.PointLight(0xFFFFFF, 1.5, 100);
        sun.add(sunLight);
    }

    function createPlanets() {
        PLANET_DATA.forEach((data, index) => {
            // Planet group (for orbit)
            const orbitGroup = new THREE.Group();
            scene.add(orbitGroup);

            // Planet mesh
            const geometry = new THREE.SphereGeometry(data.size, 32, 32);
            const material = new THREE.MeshStandardMaterial({
                color: data.color,
                roughness: 0.8,
                metalness: 0.2
            });
            const planet = new THREE.Mesh(geometry, material);
            planet.position.x = data.distance;
            planet.userData = { ...data, index };
            orbitGroup.add(planet);

            // Saturn's rings
            if (data.hasRings) {
                const ringGeometry = new THREE.RingGeometry(data.size * 1.4, data.size * 2.2, 64);
                const ringMaterial = new THREE.MeshBasicMaterial({
                    color: 0xC4A484,
                    side: THREE.DoubleSide,
                    transparent: true,
                    opacity: 0.7
                });
                const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                ring.rotation.x = Math.PI / 2.5;
                planet.add(ring);
            }

            // Orbit line
            const orbitCurve = new THREE.EllipseCurve(0, 0, data.distance, data.distance, 0, 2 * Math.PI, false, 0);
            const orbitPoints = orbitCurve.getPoints(100);
            const orbitGeometry = new THREE.BufferGeometry().setFromPoints(
                orbitPoints.map(p => new THREE.Vector3(p.x, 0, p.y))
            );
            const orbitMaterial = new THREE.LineBasicMaterial({
                color: 0x444444,
                transparent: true,
                opacity: 0.3
            });
            const orbitLine = new THREE.Line(orbitGeometry, orbitMaterial);
            scene.add(orbitLine);

            // Highlight ring (hidden by default)
            const highlightGeometry = new THREE.RingGeometry(data.size * 1.5, data.size * 1.8, 32);
            const highlightMaterial = new THREE.MeshBasicMaterial({
                color: 0x64c8ff,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0
            });
            const highlight = new THREE.Mesh(highlightGeometry, highlightMaterial);
            highlight.rotation.x = -Math.PI / 2;
            planet.add(highlight);

            // Invisible hitbox for easier selection (much larger than visual planet)
            const hitboxSize = Math.max(data.size * 3, 0.8); // Minimum size for small planets
            const hitboxGeometry = new THREE.SphereGeometry(hitboxSize, 16, 16);
            const hitboxMaterial = new THREE.MeshBasicMaterial({
                visible: false
            });
            const hitbox = new THREE.Mesh(hitboxGeometry, hitboxMaterial);
            hitbox.userData = { isPlanetHitbox: true, planetIndex: index };
            planet.add(hitbox);

            planets.push({
                mesh: planet,
                orbitGroup,
                highlight,
                hitbox,
                data,
                angle: Math.random() * Math.PI * 2
            });
        });
    }

    function createStarField() {
        const starsGeometry = new THREE.BufferGeometry();
        const starPositions = [];

        for (let i = 0; i < 2000; i++) {
            const x = (Math.random() - 0.5) * 200;
            const y = (Math.random() - 0.5) * 200;
            const z = (Math.random() - 0.5) * 200;
            starPositions.push(x, y, z);
        }

        starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
        const starsMaterial = new THREE.PointsMaterial({
            color: 0xFFFFFF,
            size: 0.2,
            transparent: true,
            opacity: 0.8
        });
        starField = new THREE.Points(starsGeometry, starsMaterial);
        scene.add(starField);
    }

    // ==========================================
    // ANIMATION LOOP
    // ==========================================

    let time = 0;

    function animate() {
        requestAnimationFrame(animate);
        time += 0.016;

        // Rotate sun
        sun.rotation.y += 0.002;

        // Orbit and rotate planets
        planets.forEach(planet => {
            // Skip orbit update if this planet is grabbed
            if (planet !== grabbedPlanet) {
                planet.angle += CONFIG.orbitSpeed * planet.data.orbitSpeed;
                planet.mesh.position.x = Math.cos(planet.angle) * planet.data.distance;
                planet.mesh.position.z = Math.sin(planet.angle) * planet.data.distance;
            }
            planet.mesh.rotation.y += 0.01;
        });

        // Update grabbed planet position to follow hand
        if (grabbedPlanet) {
            updateGrabbedPlanetPosition();
        }

        // Smooth zoom
        zoomLevel += (targetZoom - zoomLevel) * 0.1;
        zoomLevelElement.textContent = zoomLevel.toFixed(1) + 'x';

        // Camera orbit controlled by trackpad
        const cameraDistance = 20 / zoomLevel;
        camera.position.x = Math.sin(orbitAngle) * Math.cos(orbitTilt) * cameraDistance;
        camera.position.z = Math.cos(orbitAngle) * Math.cos(orbitTilt) * cameraDistance;
        camera.position.y = Math.sin(orbitTilt) * cameraDistance;
        camera.lookAt(0, 0, 0);

        // Check for planet hover
        checkPlanetHover();

        // Update highlight animations
        planets.forEach(planet => {
            if (planet === grabbedPlanet) {
                // Bright pulsing highlight for grabbed planet
                planet.highlight.material.opacity = 0.8 + Math.sin(time * 8) * 0.2;
                planet.highlight.material.color.setHex(0x39FF14);
            } else if (planet === hoveredPlanet) {
                planet.highlight.material.opacity = 0.5 + Math.sin(time * 5) * 0.3;
                planet.highlight.material.color.setHex(0x64c8ff);
            } else if (planet.mesh.userData.name === selectedPlanet?.mesh.userData.name) {
                planet.highlight.material.opacity = 0.8;
                planet.highlight.material.color.setHex(0x64c8ff);
            } else {
                planet.highlight.material.opacity = 0;
            }
        });

        renderer.render(scene, camera);
    }

    // ==========================================
    // PLANET INTERACTION
    // ==========================================

    function checkPlanetHover() {
        // Convert hand position to ray
        const x = (1 - smoothedPosition.x) * 2 - 1;
        const y = -(smoothedPosition.y * 2 - 1);

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

        // Collect all hitboxes and planet meshes for intersection
        const hitTargets = [];
        planets.forEach(p => {
            hitTargets.push(p.mesh);
            hitTargets.push(p.hitbox);
        });

        const intersects = raycaster.intersectObjects(hitTargets);

        const previousHover = hoveredPlanet;

        if (intersects.length > 0) {
            const hitObject = intersects[0].object;
            let hitPlanet = null;

            // Check if we hit a hitbox
            if (hitObject.userData && hitObject.userData.isPlanetHitbox) {
                hitPlanet = planets[hitObject.userData.planetIndex];
            } else {
                // Direct planet mesh hit
                hitPlanet = planets.find(p => p.mesh === hitObject);
            }

            if (hitPlanet && hitPlanet !== hoveredPlanet) {
                hoveredPlanet = hitPlanet;
                if (previousHover !== hoveredPlanet) {
                    playHoverSound();
                }
            }
        } else {
            hoveredPlanet = null;
        }
    }

    function selectPlanet(planet) {
        selectedPlanet = planet;
        playSelectSound();

        // Show planet info
        planetNameElement.textContent = planet.data.name;
        planetNameElement.style.color = '#' + planet.data.color.toString(16).padStart(6, '0');

        let factsHTML = '';
        for (const [label, value] of Object.entries(planet.data.facts)) {
            factsHTML += `<p><span class="fact-label">${label}</span><br>${value}</p>`;
        }
        planetFactsElement.innerHTML = factsHTML;

        planetInfoElement.classList.remove('hidden');

        // Flash effect
        const flash = document.getElementById('flash-overlay');
        flash.style.backgroundColor = 'rgba(100, 200, 255, 0.2)';
        flash.style.opacity = '1';
        setTimeout(() => flash.style.opacity = '0', 150);
    }

    function deselectPlanet() {
        selectedPlanet = null;
        planetInfoElement.classList.add('hidden');
    }

    // ==========================================
    // PLANET GRABBING
    // ==========================================

    function grabPlanet(planet) {
        grabbedPlanet = planet;
        playGrabSound();
        statusElement.textContent = `Holding ${planet.data.name}! Move your hand to reposition.`;

        // Also select it to show info
        selectPlanet(planet);
    }

    function dropPlanet() {
        if (!grabbedPlanet) return;

        // Return to y=0 plane
        grabbedPlanet.mesh.position.y = 0;

        playDropSound();
        statusElement.textContent = `Released ${grabbedPlanet.data.name}!`;

        grabbedPlanet = null;
    }

    function updateGrabbedPlanetPosition() {
        if (!grabbedPlanet) return;

        // Convert hand position to 3D world coordinates
        const x = (1 - smoothedPosition.x) * 2 - 1;
        const y = -(smoothedPosition.y * 2 - 1);

        // Create a ray from camera through hand position
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

        // Find intersection with horizontal plane at y=0
        const planeNormal = new THREE.Vector3(0, 1, 0);
        const planePoint = new THREE.Vector3(0, 0, 0);
        const ray = raycaster.ray;

        const denominator = planeNormal.dot(ray.direction);
        if (Math.abs(denominator) > 0.0001) {
            const t = planePoint.clone().sub(ray.origin).dot(planeNormal) / denominator;
            if (t > 0) {
                const intersectPoint = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));

                // Calculate angle from sun to intersection point
                const targetAngle = Math.atan2(intersectPoint.z, intersectPoint.x);

                // Smoothly update the planet's orbit angle
                // Handle angle wrapping
                let angleDiff = targetAngle - grabbedPlanet.angle;
                while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
                while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

                grabbedPlanet.angle += angleDiff * 0.15;

                // Keep planet on its current orbital path (constrained to orbit)
                const orbitRadius = grabbedPlanet.data.distance;
                grabbedPlanet.mesh.position.x = Math.cos(grabbedPlanet.angle) * orbitRadius;
                grabbedPlanet.mesh.position.z = Math.sin(grabbedPlanet.angle) * orbitRadius;

                // Keep planet slightly elevated while grabbed
                grabbedPlanet.mesh.position.y += (0.5 - grabbedPlanet.mesh.position.y) * 0.1;
            }
        }
    }

    // ==========================================
    // GESTURE DETECTION
    // ==========================================

    function calculateDistance(p1, p2) {
        return Math.sqrt(
            Math.pow(p1.x - p2.x, 2) +
            Math.pow(p1.y - p2.y, 2) +
            Math.pow((p1.z || 0) - (p2.z || 0), 2)
        );
    }

    function detectPinch(landmarks) {
        // Use hysteresis for stable pinch detection
        const distance = calculateDistance(landmarks[4], landmarks[8]);

        if (!pinchConfirmed) {
            // Not currently pinching - need to go below activate threshold
            if (distance < PINCH_ACTIVATE) {
                if (pinchStartTime === 0) {
                    pinchStartTime = Date.now();
                } else if (Date.now() - pinchStartTime > PINCH_DEBOUNCE) {
                    pinchConfirmed = true;
                }
            } else {
                pinchStartTime = 0;
            }
        } else {
            // Currently pinching - need to go above deactivate threshold to release
            if (distance > PINCH_DEACTIVATE) {
                pinchConfirmed = false;
                pinchStartTime = 0;
            }
        }

        return pinchConfirmed;
    }

    function smoothPosition(rawX, rawY) {
        // Calculate velocity for adaptive smoothing
        handVelocity = Math.hypot(rawX - lastRawPosition.x, rawY - lastRawPosition.y);
        lastRawPosition = { x: rawX, y: rawY };

        // Add to history buffer
        positionHistory.push({ x: rawX, y: rawY });
        if (positionHistory.length > HISTORY_SIZE) {
            positionHistory.shift();
        }

        // Average the history
        const avg = positionHistory.reduce(
            (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
            { x: 0, y: 0 }
        );
        avg.x /= positionHistory.length;
        avg.y /= positionHistory.length;

        // Adaptive smoothing: more smoothing when moving slowly (reduces jitter)
        const smoothFactor = handVelocity < 0.01 ? 0.08 : handVelocity < 0.03 ? 0.12 : 0.2;

        smoothedPosition.x += (avg.x - smoothedPosition.x) * smoothFactor;
        smoothedPosition.y += (avg.y - smoothedPosition.y) * smoothFactor;
    }

    function getHandSpread(landmarks) {
        // Distance between thumb and pinky
        const thumbTip = landmarks[4];
        const pinkyTip = landmarks[20];
        return calculateDistance(thumbTip, pinkyTip);
    }

    function isHandPinching(landmarks) {
        // Simple pinch check for a single hand (used for two-hand detection)
        const distance = calculateDistance(landmarks[4], landmarks[8]);
        return distance < PINCH_ACTIVATE;
    }

    function getTwoHandMidpoint(left, right) {
        // Get midpoint between index fingers of both hands
        const leftIndex = left[8];
        const rightIndex = right[8];
        return {
            x: (leftIndex.x + rightIndex.x) / 2,
            y: (leftIndex.y + rightIndex.y) / 2
        };
    }

    function getTwoHandDistance(left, right) {
        // Get distance between index fingers of both hands
        const leftIndex = left[8];
        const rightIndex = right[8];
        return Math.hypot(leftIndex.x - rightIndex.x, leftIndex.y - rightIndex.y);
    }

    function handleTwoHandPan(leftLandmarks, rightLandmarks) {
        const leftPinching = isHandPinching(leftLandmarks);
        const rightPinching = isHandPinching(rightLandmarks);

        if (leftPinching && rightPinching) {
            const currentMidpoint = getTwoHandMidpoint(leftLandmarks, rightLandmarks);
            const currentDistance = getTwoHandDistance(leftLandmarks, rightLandmarks);

            if (!isTwoHandPinching) {
                // Just started two-hand pinch
                isTwoHandPinching = true;
                twoHandPinchStart = currentMidpoint;
                twoHandStartDistance = currentDistance;
                zoomStart = targetZoom;
                orbitAngleStart = orbitAngle;
                orbitTiltStart = orbitTilt;
                statusElement.textContent = 'Pan & zoom...';
            } else {
                // Continue panning - calculate delta from start
                const deltaX = (currentMidpoint.x - twoHandPinchStart.x) * 3;
                const deltaY = (currentMidpoint.y - twoHandPinchStart.y) * 2;

                orbitAngle = orbitAngleStart - deltaX;
                orbitTilt = Math.max(0.1, Math.min(1.2, orbitTiltStart + deltaY));

                // Zoom based on hand distance change
                // Spreading hands apart = zoom in, pinching together = zoom out
                const distanceRatio = currentDistance / twoHandStartDistance;
                targetZoom = Math.max(CONFIG.minZoom, Math.min(CONFIG.maxZoom, zoomStart * distanceRatio));
            }

            return true;  // Two-hand gesture active
        } else {
            if (isTwoHandPinching) {
                // Just released two-hand pinch
                isTwoHandPinching = false;
                twoHandPinchStart = null;
                statusElement.textContent = 'Exploring the Solar System!';
            }
            return false;
        }
    }

    // ==========================================
    // MEDIAPIPE INITIALIZATION
    // ==========================================

    async function initMediaPipeHands() {
        statusElement.textContent = 'Loading hand tracking...';

        const hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,  // Full model for better accuracy
            minDetectionConfidence: 0.7,  // Higher confidence = less false positives
            minTrackingConfidence: 0.6
        });

        await hands.initialize();
        statusElement.classList.remove('loading');
        statusElement.textContent = 'Show your hand to explore!';

        return hands;
    }

    // ==========================================
    // HAND TRACKING RESULTS
    // ==========================================

    function onResults(results) {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            if (!isTracking) {
                isTracking = true;
                statusElement.textContent = 'Exploring the Solar System!';
                initAudio();
            }

            // Store all hands by index (not by handedness label - labels can duplicate)
            handsData = results.multiHandLandmarks.map((landmarks, i) => ({
                landmarks,
                index: i
            }));

            // Draw all hands with index-based coloring
            for (let i = 0; i < handsData.length; i++) {
                drawHand(handsData[i].landmarks, i);
            }

            // Check for two-hand pan gesture first
            let twoHandActive = false;
            if (handsData.length >= 2) {
                twoHandActive = handleTwoHandPan(handsData[0].landmarks, handsData[1].landmarks);
            } else {
                // Reset two-hand state if we lost a hand
                if (isTwoHandPinching) {
                    isTwoHandPinching = false;
                    twoHandPinchStart = null;
                }
            }

            // If not doing two-hand gesture, use primary hand for pointing/grabbing
            if (!twoHandActive) {
                // Use the first available hand for pointing
                const primaryHand = results.multiHandLandmarks[0];

                // Get index finger position for pointing
                const indexTip = primaryHand[8];
                handPosition.x = indexTip.x;
                handPosition.y = indexTip.y;

                // Apply improved smoothing with history buffer and adaptive factor
                smoothPosition(handPosition.x, handPosition.y);

                // Check pinch gesture (only if not two-hand panning)
                wasPinching = isPinching;
                isPinching = detectPinch(primaryHand);

                // Pinch to grab/drop planet
                if (isPinching && !wasPinching) {
                    // Starting a pinch - grab planet if hovering
                    if (hoveredPlanet && !grabbedPlanet) {
                        grabPlanet(hoveredPlanet);
                    }
                } else if (!isPinching && wasPinching) {
                    // Releasing a pinch - drop planet
                    if (grabbedPlanet) {
                        dropPlanet();
                    }
                }
            }

        } else {
            if (isTracking) {
                isTracking = false;
                statusElement.textContent = 'Show your hand to continue exploring!';
            }
            // Reset two-hand state
            if (isTwoHandPinching) {
                isTwoHandPinching = false;
                twoHandPinchStart = null;
            }
        }
    }

    function drawHand(landmarks, handIndex = 0) {
        // Different colors for first and second hand (index-based, not handedness)
        const isSecondHand = handIndex === 1;
        const handColor = isSecondHand ? 'rgba(255, 150, 100, 0.5)' : 'rgba(100, 200, 255, 0.5)';
        const pointColor = isSecondHand ? '#FFA066' : '#64c8ff';

        // Draw glowing spheres only on thumb (4) and index finger (8)
        [4, 8].forEach(idx => {
            const point = landmarks[idx];
            const { x, y } = landmarkToCanvas(point.x, point.y);

            // Outer glow
            canvasCtx.beginPath();
            canvasCtx.arc(x, y, 18, 0, 2 * Math.PI);
            canvasCtx.fillStyle = isSecondHand ? 'rgba(255, 150, 100, 0.3)' : 'rgba(100, 200, 255, 0.3)';
            canvasCtx.fill();

            // Inner sphere
            canvasCtx.beginPath();
            canvasCtx.arc(x, y, 10, 0, 2 * Math.PI);
            canvasCtx.fillStyle = pointColor;
            canvasCtx.fill();
        });

        // Highlight pinch fingers when pinching
        const handIsPinching = isHandPinching(landmarks);
        if (handIsPinching) {
            [4, 8].forEach(idx => {
                const { x, y } = landmarkToCanvas(landmarks[idx].x, landmarks[idx].y);
                canvasCtx.beginPath();
                canvasCtx.arc(x, y, 15, 0, 2 * Math.PI);
                canvasCtx.strokeStyle = isTwoHandPinching ? '#FF00FF' : '#39FF14';
                canvasCtx.lineWidth = 3;
                canvasCtx.stroke();
            });
        }
    }

    // ==========================================
    // RESPONSIVE
    // ==========================================

    window.addEventListener('resize', () => {
        updateCanvasSize();
        if (renderer) {
            renderer.setSize(window.innerWidth, window.innerHeight);
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
        }
    });

    // ==========================================
    // TRACKPAD/MOUSE CONTROLS
    // ==========================================

    let orbitAngle = 0;
    let orbitTilt = 0.4; // Initial tilt

    // Scroll to zoom
    window.addEventListener('wheel', (e) => {
        e.preventDefault();

        // Two-finger scroll (pinch zoom on trackpad)
        if (e.ctrlKey) {
            // Pinch zoom
            targetZoom = Math.max(CONFIG.minZoom, Math.min(CONFIG.maxZoom,
                targetZoom - e.deltaY * 0.01));
        } else {
            // Regular scroll - orbit around
            orbitAngle += e.deltaX * 0.002;
            orbitTilt = Math.max(0.1, Math.min(1.2, orbitTilt + e.deltaY * 0.002));
        }
    }, { passive: false });

    // Click to select planet (without grabbing)
    document.addEventListener('click', (e) => {
        if (hoveredPlanet && !grabbedPlanet) {
            selectPlanet(hoveredPlanet);
            initAudio();
        } else if (selectedPlanet && !hoveredPlanet) {
            deselectPlanet();
        }
    });

    // ==========================================
    // KEYBOARD FALLBACK
    // ==========================================

    document.addEventListener('keydown', (e) => {
        switch (e.key) {
            case 'ArrowLeft':
                smoothedPosition.x = Math.max(0, smoothedPosition.x - 0.05);
                break;
            case 'ArrowRight':
                smoothedPosition.x = Math.min(1, smoothedPosition.x + 0.05);
                break;
            case 'ArrowUp':
                smoothedPosition.y = Math.max(0, smoothedPosition.y - 0.05);
                break;
            case 'ArrowDown':
                smoothedPosition.y = Math.min(1, smoothedPosition.y + 0.05);
                break;
            case ' ':
                e.preventDefault();
                if (hoveredPlanet) {
                    selectPlanet(hoveredPlanet);
                } else if (selectedPlanet) {
                    deselectPlanet();
                }
                break;
            case '+':
            case '=':
                targetZoom = Math.min(CONFIG.maxZoom, targetZoom + 0.2);
                break;
            case '-':
                targetZoom = Math.max(CONFIG.minZoom, targetZoom - 0.2);
                break;
        }
    });

    // ==========================================
    // START APPLICATION
    // ==========================================

    async function startApp() {
        try {
            await initWebcam();
            initThreeJS();
            const hands = await initMediaPipeHands();

            hands.onResults(onResults);

            const cam = new Camera(videoElement, {
                onFrame: async () => {
                    await hands.send({ image: videoElement });
                },
                width: 1280,
                height: 720
            });

            cam.start();

        } catch (error) {
            console.error('Failed to start:', error);
            statusElement.textContent = `Error: ${error.message}`;
        }
    }

    startApp();
});
