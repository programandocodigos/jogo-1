import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- CONFIGURATION ---
const WALL_HEIGHT = 5;
const ARENA_SIZE = 40;
const GRID_SIZE = 10;
const TILE_SIZE = ARENA_SIZE / GRID_SIZE;
const PLAYER_HEIGHT = 1.7;
const BOT_SPEED = 0.08;
const PLAYER_SPEED = 0.15;

// --- DOM ELEMENTS ---
const startBtn = document.getElementById('start-btn');
const retryBtn = document.getElementById('retry-btn');
const startOverlay = document.getElementById('start-overlay');
const gameOverOverlay = document.getElementById('game-over-overlay');
const victoryOverlay = document.getElementById('victory-overlay');
const victoryBadge = document.getElementById('victory-badge');
const levelVal = document.getElementById('level-val');
const countdownEl = document.getElementById('countdown');
const dallyMusic = document.getElementById('dally-music');

// --- GAME STATE ---
let gameState = 'START';
let level = 1;
let walls = [];
let bullets = [];
let keys = {};
let isADS = false; // Aim Down Sights

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);
scene.fog = new THREE.Fog(0x0a0a0a, 0, 30);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.getElementById('game-container').appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);

// --- LIGHTING ---
const ambientLight = new THREE.AmbientLight(0x404040, 2);
scene.add(ambientLight);

const pointLight = new THREE.PointLight(0x6366f1, 50, 100);
pointLight.position.set(0, 10, 0);
scene.add(pointLight);

// --- ASSETS: MAGNUM 357 ---
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);
scene.add(camera);

function createMagnum357() {
    // Basic Revolver Mesh (Group of Boxes)
    const material = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });

    // Barrel
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), material);
    barrel.position.set(0, -0.15, -0.4);

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.3), material);
    body.position.set(0, -0.15, -0.2);

    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), new THREE.MeshStandardMaterial({ color: 0x3d2b1f }));
    grip.position.set(0, -0.3, -0.1);
    grip.rotation.x = -0.3;

    // Cylinder
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.2, 8), material);
    cylinder.rotation.x = Math.PI / 2;
    cylinder.position.set(0, -0.12, -0.2);

    weaponGroup.add(barrel, body, grip, cylinder);
    weaponGroup.position.set(0.3, -0.1, -0.1); // Default right-hand position
}
createMagnum357();

// --- MAP GENERATION ---
const floorGeo = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

function generateMaze() {
    // Clear old walls
    walls.forEach(w => scene.remove(w));
    walls = [];

    // Outer Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5 });
    const addWall = (x, z, w, d) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), wallMat);
        wall.position.set(x, WALL_HEIGHT / 2, z);
        scene.add(wall);
        walls.push(wall);
    };

    // Perimeter
    addWall(0, ARENA_SIZE / 2, ARENA_SIZE, 1);
    addWall(0, -ARENA_SIZE / 2, ARENA_SIZE, 1);
    addWall(ARENA_SIZE / 2, 0, 1, ARENA_SIZE);
    addWall(-ARENA_SIZE / 2, 0, 1, ARENA_SIZE);

    // Procedural inner blocks
    const density = Math.min(0.2 + level * 0.05, 0.5);
    for (let i = -GRID_SIZE / 2 + 2; i < GRID_SIZE / 2 - 2; i += 2) {
        for (let j = -GRID_SIZE / 2 + 2; j < GRID_SIZE / 2 - 2; j += 2) {
            if (Math.random() < density) {
                addWall(i * TILE_SIZE, j * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }
}

// --- BOT ---
class Bot {
    constructor() {
        this.mesh = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.2, 4, 8), new THREE.MeshStandardMaterial({ color: 0xe11d48 }));
        body.position.y = 1;
        this.mesh.add(body);

        // Eyes
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08), eyeMat);
        eye.position.set(0.15, 1.4, -0.3);
        const eye2 = eye.clone();
        eye2.position.x = -0.15;
        this.mesh.add(eye, eye2);

        scene.add(this.mesh);
        this.reset();
        this.lastShotTime = 0;
    }

    reset() {
        this.mesh.position.set(
            (Math.random() - 0.5) * (ARENA_SIZE - 5),
            0,
            (Math.random() - 0.5) * (ARENA_SIZE - 5)
        );
        this.targetAngle = Math.random() * Math.PI * 2;
        this.alive = true;
    }

    update() {
        if (!this.alive || gameState !== 'PLAYING') return;

        const distToPlayer = this.mesh.position.distanceTo(camera.position);

        // IA: Perseguir ou Vagar
        if (distToPlayer < 12) {
            // Chase
            this.mesh.lookAt(camera.position.x, 0, camera.position.z);
            const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();
            if (distToPlayer > 5) {
                this.mesh.position.addScaledVector(dir, BOT_SPEED);
            }

            // Shoot at player
            if (Date.now() - this.lastShotTime > 1500) {
                this.shoot();
                this.lastShotTime = Date.now();
            }
        } else {
            // Wander
            this.mesh.rotation.y += (this.targetAngle - this.mesh.rotation.y) * 0.05;
            const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
            this.mesh.position.addScaledVector(dir, BOT_SPEED * 0.5);

            if (Math.random() < 0.01) this.targetAngle = Math.random() * Math.PI * 2;
        }

        // Collision with walls
        walls.forEach(w => {
            const box = new THREE.Box3().setFromObject(w);
            const botBox = new THREE.Box3().setFromCenterAndSize(this.mesh.position, new THREE.Vector3(1, 2, 1));
            if (box.intersectsBox(botBox)) {
                this.mesh.position.y = 0; // Fix snap
                const pushDir = new THREE.Vector3().subVectors(this.mesh.position, w.position).normalize();
                this.mesh.position.addScaledVector(pushDir, 0.2);
            }
        });
    }

    shoot() {
        const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();
        createProjectile(this.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)), dir, 'BOT');
    }
}

let bot = new Bot();

// --- PROJECTILES ---
function createProjectile(pos, dir, owner) {
    const geo = new THREE.SphereGeometry(0.05);
    const mat = new THREE.MeshBasicMaterial({ color: owner === 'PLAYER' ? 0xfbbf24 : 0xff0000 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(pos);
    scene.add(mesh);
    bullets.push({ mesh, dir, owner, time: 0 });
}

function updateProjectiles() {
    bullets.forEach((b, i) => {
        b.mesh.position.addScaledVector(b.dir, 0.6);
        b.time++;

        // Wall collision
        walls.forEach(w => {
            const box = new THREE.Box3().setFromObject(w);
            if (box.containsPoint(b.mesh.position)) {
                scene.remove(b.mesh);
                bullets.splice(i, 1);
            }
        });

        // Player/Bot collision
        if (b.owner === 'PLAYER') {
            if (b.mesh.position.distanceTo(bot.mesh.position) < 1.2) {
                onBotKilled();
                scene.remove(b.mesh);
                bullets.splice(i, 1);
            }
        } else {
            if (b.mesh.position.distanceTo(camera.position) < 1) {
                onPlayerKilled();
                scene.remove(b.mesh);
                bullets.splice(i, 1);
            }
        }

        if (b.time > 200) {
            scene.remove(b.mesh);
            bullets.splice(i, 1);
        }
    });
}

// --- GAME LOGIC EVENTS ---

function onBotKilled() {
    if (gameState !== 'PLAYING') return;
    gameState = 'VICTORY';
    bot.alive = false;
    victoryOverlay.classList.remove('hidden');
    victoryBadge.classList.remove('hidden');

    // Play Dally Music (Try Catch for missing file)
    try {
        dallyMusic.currentTime = 0;
        dallyMusic.play().catch(e => console.log("Musica dally.mp3 não encontrada na pasta assets/"));
    } catch (e) { }

    // Start Victory Sequence
    let count = 3;
    countdownEl.innerText = count;
    const interval = setInterval(() => {
        count--;
        countdownEl.innerText = count;
        if (count <= 0) {
            clearInterval(interval);
            nextLevel();
        }
    }, 1000);
}

function onPlayerKilled() {
    if (gameState !== 'PLAYING') return;
    gameState = 'GAME_OVER';
    gameOverOverlay.classList.remove('hidden');
    controls.unlock();
}

function nextLevel() {
    level++;
    levelVal.innerText = level;
    victoryOverlay.classList.add('hidden');
    victoryBadge.classList.add('hidden');
    dallyMusic.pause();
    resetGame();
}

function resetGame() {
    generateMaze();
    bot.reset();
    bullets.forEach(b => scene.remove(b.mesh));
    bullets = [];
    camera.position.set(0, PLAYER_HEIGHT, 15);
    camera.lookAt(0, PLAYER_HEIGHT, 0);
    gameState = 'PLAYING';
    if (!controls.isLocked) controls.lock();
}

// --- INPUTS & ANIMATION ---

window.addEventListener('keydown', (e) => (keys[e.code] = true));
window.addEventListener('keyup', (e) => (keys[e.code] = false));

window.addEventListener('mousedown', (e) => {
    if (gameState !== 'PLAYING') return;
    if (e.button === 0) { // Left Click - Shoot
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        // Position bullet at weapon tip
        const pos = camera.position.clone().add(dir.clone().multiplyScalar(0.5));
        createProjectile(pos, dir, 'PLAYER');

        // Recoil effect
        weaponGroup.position.z += 0.05;
        setTimeout(() => weaponGroup.position.z -= 0.05, 50);
    }
    if (e.button === 2) { // Right Click - ADS
        isADS = true;
    }
});

window.addEventListener('mouseup', (e) => {
    if (e.button === 2) isADS = false;
});

// Prevent context menu on right click
window.addEventListener('contextmenu', e => e.preventDefault());

function handleMovement() {
    if (!controls.isLocked) return;

    const direction = new THREE.Vector3();
    const frontVector = new THREE.Vector3(0, 0, Number(keys['KeyS'] || false) - Number(keys['KeyW'] || false));
    const sideVector = new THREE.Vector3(Number(keys['KeyA'] || false) - Number(keys['KeyD'] || false), 0, 0);

    direction
        .subVectors(frontVector, sideVector)
        .normalize()
        .multiplyScalar(PLAYER_SPEED)
        .applyQuaternion(camera.quaternion);

    camera.position.x += direction.x;
    camera.position.z += direction.z;

    // Wall collision for player
    walls.forEach(w => {
        const box = new THREE.Box3().setFromObject(w);
        const playerBox = new THREE.Box3().setFromCenterAndSize(camera.position, new THREE.Vector3(0.5, 2, 0.5));
        if (box.intersectsBox(playerBox)) {
            camera.position.x -= direction.x;
            camera.position.z -= direction.z;
        }
    });

    // ADS Animation
    const targetFOV = isADS ? 40 : 75;
    const targetPos = isADS ? new THREE.Vector3(0, -0.12, -0.2) : new THREE.Vector3(0.3, -0.15, -0.2);

    camera.fov += (targetFOV - camera.fov) * 0.1;
    camera.updateProjectionMatrix();

    weaponGroup.position.lerp(targetPos, 0.1);
}

function animate() {
    requestAnimationFrame(animate);

    if (gameState === 'PLAYING') {
        handleMovement();
        bot.update();
        updateProjectiles();
    } else if (gameState === 'VICTORY') {
        // Victory Dance: Rotate camera around player or just sway
        weaponGroup.rotation.z = Math.sin(Date.now() * 0.01) * 0.5;
        weaponGroup.position.y = -0.1 + Math.sin(Date.now() * 0.02) * 0.05;
    }

    renderer.render(scene, camera);
}

startBtn.addEventListener('click', () => {
    startOverlay.classList.add('hidden');
    resetGame();
});

retryBtn.addEventListener('click', () => {
    gameOverOverlay.classList.add('hidden');
    level = 1;
    levelVal.innerText = level;
    resetGame();
});

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Start loop
generateMaze();
animate();
