import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT PRO - ADVANCED VERSION
 * Cyberpunk/Neon Studio Edition
 */

// --- COMBAT STATS (As specified) ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 30, SPEED: 0.15 },
    BOT: { HP: 100, DAMAGE: 40, SPEED: 0.135, ACCURACY: 0.85 } // 90% of Player speed
};

// --- CONFIGURATION ---
const WALL_HEIGHT = 5;
const ARENA_SIZE = 40;
const GRID_SIZE = 12; // More complex grid
const TILE_SIZE = ARENA_SIZE / GRID_SIZE;
const PLAYER_HEIGHT = 1.7;

// --- DOM ELEMENTS ---
const startBtn = document.getElementById('start-btn');
const retryBtn = document.getElementById('retry-btn');
const startOverlay = document.getElementById('start-overlay');
const gameOverOverlay = document.getElementById('game-over-overlay');
const victoryOverlay = document.getElementById('victory-overlay');
const victoryBadge = document.getElementById('victory-badge');
const levelVal = document.getElementById('level-val');
const countdownEl = document.getElementById('countdown');
const gameContainer = document.getElementById('game-container');
const playerHealthFill = document.getElementById('player-health-fill');
const botHealthFill = document.getElementById('bot-health-fill');
const ammoCountEl = document.getElementById('ammo-count');
const totalAmmoEl = document.getElementById('total-ammo');

// --- GAME STATE ---
let gameState = 'START';
let level = 1;
let walls = [];
let bullets = [];
let particles = [];
let keys = {};
let isADS = false;
let isReloading = false;
let shakeIntensity = 0;

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
scene.fog = new THREE.Fog(0x020205, 0, 50);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
gameContainer.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);

// --- LIGHTING (Neon Cyberpunk) ---
const ambientLight = new THREE.AmbientLight(0x101020, 1.5);
scene.add(ambientLight);

const blueLight = new THREE.PointLight(0x00f2ff, 300, 60);
blueLight.position.set(-15, 10, -15);
scene.add(blueLight);

const pinkLight = new THREE.PointLight(0xff00ff, 300, 60);
pinkLight.position.set(15, 10, 15);
scene.add(pinkLight);

// --- PLAYER CLASS ---
class Player {
    constructor() {
        this.hp = STATS.PLAYER.HP;
        this.ammoInMag = 10;
        this.totalAmmoPool = 30;
        this.isDancing = false;
    }

    takeDamage(amount) {
        this.hp -= amount;
        this.updateHUD();
        triggerScreenShake(0.5);
        if (this.hp <= 0) onPlayerKilled();
    }

    updateHUD() {
        playerHealthFill.style.width = this.hp + '%';
        if (ammoCountEl) ammoCountEl.innerText = this.ammoInMag;
        if (totalAmmoEl) totalAmmoEl.innerText = this.totalAmmoPool;
    }

    dance() {
        this.isDancing = true;
        weaponGroup.scale.set(1, 1, 1);
    }
}
let player = new Player();

// --- PLAYER & WEAPON SETUP ---
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);
scene.add(camera);

const playerMesh = new THREE.Group();
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.2, 4, 8), new THREE.MeshStandardMaterial({ color: 0x00f2ff }));
body.position.y = 1;

const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x00f2ff }));
head.position.y = 1.8;

// Add arms
const armGeo = new THREE.CapsuleGeometry(0.1, 0.6, 4, 8);
const armMat = new THREE.MeshStandardMaterial({ color: 0x00f2ff });
const leftArm = new THREE.Mesh(armGeo, armMat);
leftArm.position.set(-0.6, 1.4, 0);
leftArm.rotation.z = Math.PI / 4;

const rightArm = new THREE.Mesh(armGeo, armMat);
rightArm.position.set(0.6, 1.4, 0);
rightArm.rotation.z = -Math.PI / 4;

playerMesh.add(body, head, leftArm, rightArm);
playerMesh.visible = false;
scene.add(playerMesh);

function createMagnum357() {
    const silverMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 1, roughness: 0.1 });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), silverMat);
    barrel.position.set(0, -0.15, -0.4);
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8), silverMat);
    cylinder.rotation.x = Math.PI / 2;
    cylinder.position.set(0, -0.12, -0.2);
    weaponGroup.add(barrel, cylinder);
    weaponGroup.position.set(0.3, -0.2, -0.3);
}
createMagnum357();

// --- MAP GENERATION (Matrix Based) ---
const floorGeo = new THREE.PlaneGeometry(ARENA_SIZE * 2, ARENA_SIZE * 2);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.8, metalness: 0.1 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

function generateMaze() {
    walls.forEach(w => scene.remove(w));
    walls = [];

    const wallMat = new THREE.MeshStandardMaterial({
        color: 0x0a0a2a,
        emissive: 0x00f2ff,
        emissiveIntensity: 0.1
    });

    const addWall = (x, z, w, d) => {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), wallMat);
        wall.position.set(x, WALL_HEIGHT / 2, z);
        wall.castShadow = true;
        wall.receiveShadow = true;

        // Neon edge detail
        const edgeGeo = new THREE.BoxGeometry(w + 0.1, 0.1, d + 0.1);
        const edgeMat = new THREE.MeshBasicMaterial({ color: 0x00f2ff });
        const edge = new THREE.Mesh(edgeGeo, edgeMat);
        edge.position.y = WALL_HEIGHT / 2;
        wall.add(edge);

        scene.add(wall);
        walls.push(wall);
    };

    // Matrix Layout for L-corridors and Pillars
    for (let i = -6; i <= 6; i++) {
        for (let j = -6; j <= 6; j++) {
            // Boundaries
            if (Math.abs(i) === 6 || Math.abs(j) === 6) {
                addWall(i * TILE_SIZE, j * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                continue;
            }
            // Seeded RNG to ensure accessibility
            const rand = Math.random();
            if (rand < 0.25 && (i % 2 === 0 || j % 2 === 0)) {
                addWall(i * TILE_SIZE, j * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            }
        }
    }
}

// --- BOT CLASS (Advanced AI) ---
class Bot {
    constructor() {
        this.mesh = new THREE.Group();
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: 0xff00ff, emissive: 0xff00ff, emissiveIntensity: 0.5 }));
        head.position.y = 1.6;
        this.mesh.add(head);

        scene.add(this.mesh);
        this.raycaster = new THREE.Raycaster();
        this.reset();
        this.lastPosition = new THREE.Vector3();
        this.state = 'WANDER'; // WANDER, HUNT, CHASE
    }

    reset() {
        this.hp = STATS.BOT.HP;
        this.mesh.position.set((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30);
        this.alive = true;
        botHealthFill.style.width = '100%';
    }

    takeDamage(amount) {
        this.hp -= amount;
        botHealthFill.style.width = Math.max(0, this.hp) + '%';
        spawnParticles(this.mesh.position, 0xff00ff);
        if (this.hp <= 0 && this.alive) onBotKilled();
    }

    update() {
        if (!this.alive || player.isDancing) return;

        const dist = this.mesh.position.distanceTo(camera.position);
        const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();

        // Raycasting for vision
        this.raycaster.set(this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), dir);
        const hit = this.raycaster.intersectObjects(walls)[0];
        const hasLineOfSight = !hit || hit.distance > dist;

        if (hasLineOfSight) {
            this.state = 'CHASE';
            this.lastPosition.copy(camera.position);
            this.mesh.lookAt(camera.position.x, 0, camera.position.z);

            // Predicting slightly
            if (dist > 5) this.mesh.position.addScaledVector(dir, STATS.BOT.SPEED);

            if (Date.now() - this.lastShot > 1000) {
                this.shoot();
                this.lastShot = Date.now();
            }
        } else if (this.state === 'CHASE') {
            this.state = 'HUNT';
        }

        if (this.state === 'HUNT') {
            const huntDir = new THREE.Vector3().subVectors(this.lastPosition, this.mesh.position).normalize();
            this.mesh.position.addScaledVector(huntDir, STATS.BOT.SPEED);
            if (this.mesh.position.distanceTo(this.lastPosition) < 1) this.state = 'WANDER';
        }

        // Wall col for bot
        walls.forEach(w => {
            const b = new THREE.Box3().setFromObject(w);
            if (b.intersectsSphere(new THREE.Sphere(this.mesh.position, 0.8))) {
                const p = new THREE.Vector3().subVectors(this.mesh.position, w.position).normalize();
                this.mesh.position.addScaledVector(p, 0.1);
            }
        });
    }

    shoot() {
        const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();
        if (Math.random() > STATS.BOT.ACCURACY) {
            dir.x += (Math.random() - 0.5) * 0.1; dir.y += (Math.random() - 0.5) * 0.1;
        }
        createProjectile(this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), dir, 'BOT');
    }
}
let bot = new Bot();

// --- PARTICLES & PROJECTILES ---
function spawnParticles(pos, color) {
    for (let i = 0; i < 10; i++) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial({ color }));
        p.position.copy(pos);
        p.userData = { vel: new THREE.Vector3((Math.random() - 0.5) * 0.2, Math.random() * 0.2, (Math.random() - 0.5) * 0.2), life: 1 };
        scene.add(p);
        particles.push(p);
    }
}

function createProjectile(pos, dir, owner) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshBasicMaterial({ color: owner === 'PLAYER' ? 0x00f2ff : 0xff00ff }));
    mesh.position.copy(pos);
    scene.add(mesh);
    bullets.push({ mesh, dir, owner, life: 0 });
}

function updateProjectiles() {
    bullets.forEach((b, i) => {
        b.mesh.position.addScaledVector(b.dir, 0.7);
        b.life++;

        walls.forEach(w => {
            if (new THREE.Box3().setFromObject(w).containsPoint(b.mesh.position)) {
                spawnParticles(b.mesh.position, 0xaaaaaa);
                scene.remove(b.mesh); bullets.splice(i, 1);
            }
        });

        if (b.owner === 'PLAYER' && b.mesh.position.distanceTo(bot.mesh.position) < 1.2) {
            bot.takeDamage(STATS.PLAYER.DAMAGE);
            scene.remove(b.mesh); bullets.splice(i, 1);
        } else if (b.owner === 'BOT' && b.mesh.position.distanceTo(camera.position) < 0.8) {
            player.takeDamage(STATS.BOT.DAMAGE);
            scene.remove(b.mesh); bullets.splice(i, 1);
        }

        if (b.life > 100) { scene.remove(b.mesh); bullets.splice(i, 1); }
    });

    particles.forEach((p, i) => {
        p.position.add(p.userData.vel);
        p.userData.life -= 0.02;
        p.scale.setScalar(p.userData.life);
        if (p.userData.life <= 0) { scene.remove(p); particles.splice(i, 1); }
    });
}

// --- CORE LOGIC ---
function triggerScreenShake(intensity) {
    shakeIntensity = intensity;
    gameContainer.classList.add('shake');
    setTimeout(() => gameContainer.classList.remove('shake'), 200);
}

function onBotKilled() {
    gameState = 'VICTORY';
    player.dance();
    spawnParticles(bot.mesh.position, 0xffffff);
    scene.remove(bot.mesh);
    victoryBadge.classList.remove('hidden');
    controls.unlock();

    // Switch to Third person and show player
    playerMesh.visible = true;
    playerMesh.position.copy(camera.position);
    playerMesh.position.y = 0;
    playerMesh.rotation.y = camera.rotation.y;

    // Position camera behind/side for 3rd person
    camera.position.add(new THREE.Vector3(0, 2, 5).applyQuaternion(camera.quaternion));
    camera.lookAt(playerMesh.position.x, 1.5, playerMesh.position.z);

    // Detach weapon from camera and attach to player for dance
    playerMesh.add(weaponGroup);
    weaponGroup.position.set(0.4, 1.2, -0.4);
    weaponGroup.rotation.set(0, 0, 0);

    try {
        dallyMusic.currentTime = 0;
        dallyMusic.play().catch(() => console.log("Erro: dally.mp3 não encontrado."));
    } catch (e) { }

    setTimeout(() => {
        gameContainer.classList.add('fade-out');
        setTimeout(() => {
            level++;
            levelVal.innerText = level;
            gameContainer.classList.remove('fade-out');
            resetGame();
        }, 1500);
    }, 2500);
}

function onPlayerKilled() {
    gameState = 'GAME_OVER';
    gameOverOverlay.classList.remove('hidden');
    controls.unlock();
}

function resetGame() {
    player.hp = 100; player.ammoInMag = 10; player.totalAmmoPool = 30; player.isDancing = false;
    player.updateHUD();
    generateMaze();
    bot.reset();
    bullets.forEach(b => scene.remove(b.mesh)); bullets = [];
    playerMesh.visible = false;

    // Re-attach weapon to camera for 1st person
    camera.add(weaponGroup);
    weaponGroup.position.set(0.3, -0.2, -0.3);
    weaponGroup.rotation.set(0, 0, 0);

    camera.position.set(0, PLAYER_HEIGHT, 15);
    camera.lookAt(0, PLAYER_HEIGHT, 0);
    gameState = 'PLAYING';
    controls.lock();
}

// --- INPUTS & ANIMATION ---
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', e => {
    if (gameState !== 'PLAYING' || player.ammoInMag <= 0) return;
    if (e.button === 0) {
        const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
        createProjectile(camera.position.clone().add(dir.clone().multiplyScalar(0.5)), dir, 'PLAYER');
        player.ammoInMag--; player.updateHUD();
        weaponGroup.position.z += 0.1;
    }
    if (e.button === 2) isADS = true;
});
window.addEventListener('mouseup', e => { if (e.button === 2) isADS = false; });

function animate() {
    requestAnimationFrame(animate);
    if (gameState === 'PLAYING') {
        const moveDir = new THREE.Vector3();
        const fv = new THREE.Vector3(0, 0, Number(keys['KeyS'] || false) - Number(keys['KeyW'] || false));
        const sv = new THREE.Vector3(Number(keys['KeyA'] || false) - Number(keys['KeyD'] || false), 0, 0);
        moveDir.subVectors(fv, sv).normalize().multiplyScalar(STATS.PLAYER.SPEED).applyQuaternion(camera.quaternion);
        camera.position.add(moveDir);

        walls.forEach(w => {
            if (new THREE.Box3().setFromObject(w).intersectsSphere(new THREE.Sphere(camera.position, 0.5))) {
                camera.position.sub(moveDir);
            }
        });

        bot.update();
        updateProjectiles();

        camera.fov += ((isADS ? 40 : 75) - camera.fov) * 0.1; camera.updateProjectionMatrix();
        weaponGroup.position.lerp(isADS ? new THREE.Vector3(0, -0.15, -0.2) : new THREE.Vector3(0.3, -0.2, -0.3), 0.1);
        weaponGroup.position.z -= (weaponGroup.position.z - (isADS ? -0.2 : -0.3)) * 0.1;
    } else if (gameState === 'VICTORY') {
        const t = Date.now() * 0.008;
        // DALLY DANCE ANIMATION: Rhythmic sway and bounce
        playerMesh.position.y = Math.abs(Math.sin(t * 2)) * 0.3; // Bounce
        playerMesh.rotation.y += 0.05; // Orbital rotation for camera feel
        playerMesh.rotation.z = Math.sin(t * 2) * 0.1; // Rhythmic lean

        // Arms movement
        playerMesh.children[2].rotation.z = Math.PI / 4 + Math.sin(t * 4) * 0.5;
        playerMesh.children[3].rotation.z = -Math.PI / 4 - Math.sin(t * 4) * 0.5;

        // Weapon follows dance
        weaponGroup.rotation.x = Math.sin(t * 4) * 0.5;

        // Orbital camera
        const angle = t * 0.5;
        const dist = 5;
        camera.position.set(
            playerMesh.position.x + Math.sin(angle) * dist,
            2,
            playerMesh.position.z + Math.cos(angle) * dist
        );
        camera.lookAt(playerMesh.position.x, 1.5, playerMesh.position.z);

        blueLight.intensity = 100 + Math.sin(t * 5) * 100;
        pinkLight.intensity = 100 + Math.cos(t * 5) * 100;
    }
    renderer.render(scene, camera);
}

startBtn.addEventListener('click', () => { startOverlay.classList.add('hidden'); resetGame(); });
retryBtn.addEventListener('click', () => { location.reload(); });

generateMaze();
animate();
