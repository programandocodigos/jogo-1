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
const ammoCountEl = document.getElementById('ammo-count');
const totalAmmoEl = document.getElementById('total-ammo');

// --- GAME STATE ---
let gameState = 'START';
let level = 1;
let walls = [];
let bullets = [];
let bulletMarks = [];
let keys = {};
let isADS = false;
let isReloading = false;

// --- AMMO SYSTEM ---
let ammoInMag = 10;
let totalAmmoPool = 30; // 3 magazines total (10 in gun + 20 reserved)
const MAX_MAG_SIZE = 10;

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);
scene.fog = new THREE.Fog(0x0a0a0a, 0, 40);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.getElementById('game-container').appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);

// --- LIGHTING ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
hemisphereLight.position.set(0, 20, 0);
scene.add(hemisphereLight);

const pointLight = new THREE.PointLight(0x6366f1, 100, 50);
pointLight.position.set(0, 5, 0);
scene.add(pointLight);

// --- ASSETS: MAGNUM 357 ---
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);
scene.add(camera);

function createMagnum357() {
    const material = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.6), material);
    barrel.position.set(0, -0.15, -0.4);
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.3), material);
    body.position.set(0, -0.15, -0.2);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.08), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
    grip.position.set(0, -0.28, -0.1);
    grip.rotation.x = -0.3;
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8), new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 1 }));
    cylinder.rotation.x = Math.PI / 2;
    cylinder.position.set(0, -0.12, -0.21);
    weaponGroup.add(barrel, body, grip, cylinder);
    weaponGroup.position.set(0.25, -0.15, -0.2);
}
createMagnum357();

// --- MAP GENERATION ---
const floorGeo = new THREE.PlaneGeometry(ARENA_SIZE, ARENA_SIZE);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

function generateMaze() {
    walls.forEach(w => scene.remove(w));
    walls = [];
    bulletMarks.forEach(m => scene.remove(m));
    bulletMarks = [];

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, metalness: 0.1, roughness: 0.7 });
    const addWall = (x, z, w, d) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), wallMat);
        wall.position.set(x, WALL_HEIGHT / 2, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
        walls.push(wall);
    };

    // Borders
    addWall(0, ARENA_SIZE / 2, ARENA_SIZE, 1);
    addWall(0, -ARENA_SIZE / 2, ARENA_SIZE, 1);
    addWall(ARENA_SIZE / 2, 0, 1, ARENA_SIZE);
    addWall(-ARENA_SIZE / 2, 0, 1, ARENA_SIZE);

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
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08), eyeMat);
        eye.position.set(0.15, 1.4, -0.3);
        const eye2 = eye.clone(); eye2.position.x = -0.15;
        this.mesh.add(eye, eye2);
        scene.add(this.mesh);
        this.reset();
        this.lastShotTime = 0;
        this.raycaster = new THREE.Raycaster();
    }
    reset() {
        this.mesh.position.set((Math.random() - 0.5) * (ARENA_SIZE - 10), 0, (Math.random() - 0.5) * (ARENA_SIZE - 10));
        this.targetAngle = Math.random() * Math.PI * 2;
        this.alive = true;
    }
    update() {
        if (!this.alive || gameState !== 'PLAYING') return;
        const distToPlayer = this.mesh.position.distanceTo(camera.position);
        if (distToPlayer < 15) {
            this.mesh.lookAt(camera.position.x, 0, camera.position.z);
            const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();

            // RAYCAST VISION CHECK
            this.raycaster.set(this.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)), dir);
            const intersects = this.raycaster.intersectObjects(walls);
            const canSee = intersects.length === 0 || intersects[0].distance > distToPlayer;

            if (canSee) {
                if (distToPlayer > 6) this.mesh.position.addScaledVector(dir, BOT_SPEED);
                if (Date.now() - this.lastShotTime > 1200) {
                    this.shoot();
                    this.lastShotTime = Date.now();
                }
            } else {
                // Try to find a way (Simple wander if blocked)
                this.mesh.rotation.y += 0.05;
                const wanderDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
                this.mesh.position.addScaledVector(wanderDir, BOT_SPEED);
            }
        } else {
            this.mesh.rotation.y += (this.targetAngle - this.mesh.rotation.y) * 0.05;
            this.mesh.position.addScaledVector(new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion), BOT_SPEED * 0.5);
            if (Math.random() < 0.01) this.targetAngle = Math.random() * Math.PI * 2;
        }

        walls.forEach(w => {
            const botBox = new THREE.Box3().setFromCenterAndSize(this.mesh.position, new THREE.Vector3(1, 2, 1));
            if (new THREE.Box3().setFromObject(w).intersectsBox(botBox)) {
                this.mesh.position.addScaledVector(new THREE.Vector3().subVectors(this.mesh.position, w.position).normalize(), 0.2);
            }
        });
    }
    shoot() {
        const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();
        // 80% accuracy - random offset
        if (Math.random() > 0.8) {
            dir.x += (Math.random() - 0.5) * 0.1;
            dir.y += (Math.random() - 0.5) * 0.1;
        }
        createProjectile(this.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)), dir, 'BOT');
    }
}
let bot = new Bot();

// --- PROJECTILES & BULLET MARKS ---
function createProjectile(pos, dir, owner) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: owner === 'PLAYER' ? 0xfbbf24 : 0xff0000 }));
    mesh.position.copy(pos);
    scene.add(mesh);
    bullets.push({ mesh, dir, owner, time: 0 });
}

function addBulletMark(pos, normal) {
    const mark = new THREE.Mesh(new THREE.CircleGeometry(0.04, 8), new THREE.MeshBasicMaterial({ color: 0x111111, side: THREE.DoubleSide }));
    mark.position.copy(pos).add(normal.multiplyScalar(0.01));
    mark.lookAt(pos.clone().add(normal));
    scene.add(mark);
    bulletMarks.push(mark);
}

function updateProjectiles() {
    bullets.forEach((b, i) => {
        b.mesh.position.addScaledVector(b.dir, 0.7);
        b.time++;
        walls.forEach(w => {
            if (new THREE.Box3().setFromObject(w).containsPoint(b.mesh.position)) {
                if (b.owner === 'PLAYER') {
                    const normal = new THREE.Vector3().subVectors(b.mesh.position, w.position).normalize();
                    addBulletMark(b.mesh.position, normal);
                }
                scene.remove(b.mesh); bullets.splice(i, 1);
            }
        });
        if (b.owner === 'PLAYER' && b.mesh.position.distanceTo(bot.mesh.position) < 1.2) {
            onBotKilled(); scene.remove(b.mesh); bullets.splice(i, 1);
        } else if (b.owner === 'BOT' && b.mesh.position.distanceTo(camera.position) < 0.8) {
            onPlayerKilled(); scene.remove(b.mesh); bullets.splice(i, 1);
        }
        if (b.time > 150) { scene.remove(b.mesh); bullets.splice(i, 1); }
    });
}

// --- RELOAD SYSTEM ---
function reload() {
    if (isReloading || totalAmmoPool <= 0 || ammoInMag === MAX_MAG_SIZE) return;
    isReloading = true;
    weaponGroup.rotation.x = -1; // Movement-like reload
    setTimeout(() => {
        const needed = MAX_MAG_SIZE - ammoInMag;
        const toLoad = Math.min(needed, totalAmmoPool);
        ammoInMag += toLoad;
        totalAmmoPool -= toLoad;
        updateAmmoHUD();
        weaponGroup.rotation.x = 0;
        isReloading = false;
    }, 1500);
}

function updateAmmoHUD() {
    ammoCountEl.innerText = ammoInMag;
    totalAmmoEl.innerText = totalAmmoPool;
}

// --- GAME LOGIC EVENTS ---
function onBotKilled() {
    if (gameState !== 'PLAYING') return;
    gameState = 'VICTORY';
    bot.alive = false;
    victoryOverlay.classList.remove('hidden');
    victoryBadge.classList.remove('hidden');
    controls.unlock();
    try { dallyMusic.currentTime = 0; dallyMusic.play().catch(() => { }); } catch (e) { }

    // Switch to Third Person for dancinha
    camera.position.add(new THREE.Vector3(0, 0, 5));
    camera.lookAt(camera.position.clone().add(new THREE.Vector3(0, 0, -5)));

    let count = 3; countdownEl.innerText = count;
    const interval = setInterval(() => {
        count--; countdownEl.innerText = count;
        if (count <= 0) { clearInterval(interval); nextLevel(); }
    }, 1000);
}

function onPlayerKilled() {
    if (gameState !== 'PLAYING') return;
    gameState = 'GAME_OVER';
    gameOverOverlay.classList.remove('hidden');
    controls.unlock();
}

function nextLevel() {
    level++; levelVal.innerText = level;
    victoryOverlay.classList.add('hidden');
    victoryBadge.classList.add('hidden');
    dallyMusic.pause();
    resetGame();
}

function resetGame() {
    generateMaze();
    bot.reset();
    bullets.forEach(b => scene.remove(b.mesh)); bullets = [];
    ammoInMag = 10; totalAmmoPool = 30; updateAmmoHUD();
    camera.position.set(0, PLAYER_HEIGHT, 15);
    camera.lookAt(0, PLAYER_HEIGHT, 0);
    gameState = 'PLAYING';
    try { if (!controls.isLocked) controls.lock(); } catch (e) { }
}

// --- INPUTS & ANIMATION ---
window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyR') reload();
});
window.addEventListener('keyup', (e) => (keys[e.code] = false));

window.addEventListener('mousedown', (e) => {
    if (gameState !== 'PLAYING' || isReloading) return;
    if (e.button === 0) {
        if (ammoInMag > 0) {
            const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
            createProjectile(camera.position.clone().add(dir.clone().multiplyScalar(0.5)), dir, 'PLAYER');
            ammoInMag--; updateAmmoHUD();
            weaponGroup.position.z += 0.05; setTimeout(() => weaponGroup.position.z -= 0.05, 50);
            if (ammoInMag === 0) reload();
        }
    }
    if (e.button === 2) isADS = true;
});
window.addEventListener('mouseup', (e) => { if (e.button === 2) isADS = false; });
window.addEventListener('contextmenu', e => e.preventDefault());

function handleMovement() {
    if (!controls.isLocked) return;
    const direction = new THREE.Vector3();
    const frontVector = new THREE.Vector3(0, 0, Number(keys['KeyS'] || false) - Number(keys['KeyW'] || false));
    const sideVector = new THREE.Vector3(Number(keys['KeyA'] || false) - Number(keys['KeyD'] || false), 0, 0);
    direction.subVectors(frontVector, sideVector).normalize().multiplyScalar(PLAYER_SPEED).applyQuaternion(camera.quaternion);
    camera.position.x += direction.x;
    camera.position.z += direction.z;
    walls.forEach(w => {
        if (new THREE.Box3().setFromObject(w).intersectsBox(new THREE.Box3().setFromCenterAndSize(camera.position, new THREE.Vector3(0.5, 2, 0.5)))) {
            camera.position.x -= direction.x; camera.position.z -= direction.z;
        }
    });
    camera.fov += ((isADS ? 40 : 75) - camera.fov) * 0.1; camera.updateProjectionMatrix();
    weaponGroup.position.lerp(isADS ? new THREE.Vector3(0, -0.12, -0.2) : new THREE.Vector3(0.25, -0.15, -0.2), 0.1);
}

function animate() {
    requestAnimationFrame(animate);
    if (gameState === 'PLAYING') {
        handleMovement(); bot.update(); updateProjectiles();
    } else if (gameState === 'VICTORY') {
        weaponGroup.rotation.z = Math.sin(Date.now() * 0.01) * 0.8; // Dance sway
        weaponGroup.position.y = -0.1 + Math.sin(Date.now() * 0.02) * 0.1;
    }
    renderer.render(scene, camera);
}

startBtn.addEventListener('click', () => { startOverlay.classList.add('hidden'); resetGame(); });
retryBtn.addEventListener('click', () => { gameOverOverlay.classList.add('hidden'); level = 1; resetGame(); });
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

generateMaze();
animate();
updateAmmoHUD();
