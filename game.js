import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D - VERSÃO FINAL CORRIGIDA
 * Foco: Estabilidade total, cenário visível e lógica de dano.
 */

// --- CONFIGURAÇÕES ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 35, SPEED: 0.16, MAG: 10, TOTAL: 30, RELOAD: 2500 },
    BOT: { HP: 100, DAMAGE: 40, SPEED: 0.08, ACCURACY_ERROR: 0.15, STOP_DIST: 6 }
};

// --- ESTADO GLOBAL ---
let gameState = 'START';
let currentPhase = 1;
let playerHp = 100;
let botHp = 100;
let currentMag = STATS.PLAYER.MAG;
let reserveAmmo = STATS.PLAYER.TOTAL - STATS.PLAYER.MAG;
let isReloading = false;
let lastShotTime = 0;

let bots = [];
let obstacles = [];
let obstacleBoxes = [];
const keys = {};

// --- SETUP SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
scene.fog = new THREE.FogExp2(0x020205, 0.02);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.7, 12); // Posição inicial garantida
const recoilGroup = new THREE.Group();
camera.add(recoilGroup);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;

// Anexar ao container
const container = document.getElementById('game-container');
if (container) {
    container.appendChild(renderer.domElement);
}

const controls = new PointerLockControls(camera, document.body);

// ILUMINAÇÃO
const ambient = new THREE.HemisphereLight(0xffffff, 0x080820, 0.8);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(20, 50, 10);
sun.castShadow = true;
scene.add(sun);

// --- 1. CENÁRIO (ESTÁVEL) ---
function generateMap() {
    obstacles.forEach(o => scene.remove(o));
    obstacles = []; obstacleBoxes = [];

    // Chão de Grama
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ color: 0x228b22 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const addSolid = (mesh, x, z, y = 0) => {
        mesh.position.set(x, y, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
        obstacles.push(mesh);
        const box = new THREE.Box3().setFromObject(mesh);
        obstacleBoxes.push(box);
    };

    // Árvores
    for (let i = 0; i < 15; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x3d2b1f }));
        trunk.position.y = 3;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 8), new THREE.MeshStandardMaterial({ color: 0x0a5d0a }));
        leaves.position.y = 7;
        tree.add(trunk, leaves);
        addSolid(tree, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70);
    }

    // Pedras
    for (let i = 0; i < 10; i++) {
        const stone = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 4), new THREE.MeshStandardMaterial({ color: 0x444444 }));
        addSolid(stone, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 4);
    }
}

// --- 2. JOGADOR (BRAÇO FPS) ---
const weaponArm = new THREE.Group();
function createFPSArm() {
    weaponArm.clear();
    const skin = new THREE.MeshStandardMaterial({ color: 0xd2b48c });
    const iron = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), skin);
    arm.position.set(0.3, -0.3, -0.4);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.5), iron);
    gun.position.set(0.3, -0.2, -0.7);
    weaponArm.add(arm, gun);
    recoilGroup.add(weaponArm);
}
createFPSArm();

// --- 3. BOTIA ---
class ArenaBot {
    constructor() {
        this.mesh = new THREE.Group();
        this.hp = 100;
        this.lastShot = 0;
        this.isFlashing = false;

        const mat = new THREE.MeshStandardMaterial({ color: 0x222222 });
        this.body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.4), mat);
        this.body.position.y = 0.7;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xe0ac69 }));
        head.position.y = 1.6;

        this.mesh.add(this.body, head);
        scene.add(this.mesh);
        this.respawn();
    }

    respawn() {
        this.hp = 100;
        botHp = 100;
        this.mesh.visible = true;
        this.mesh.position.set((Math.random() - 0.5) * 30, 0, -15);
        if (gameState === 'PLAYING') updateUI();
    }

    onHit(dmg) {
        this.hp -= dmg;
        botHp = this.hp;
        updateUI();

        if (!this.isFlashing) {
            this.isFlashing = true;
            this.body.material.color.set(0xff0000);
            setTimeout(() => {
                this.body.material.color.set(0x222222);
                this.isFlashing = false;
            }, 100);
        }

        if (this.hp <= 0) {
            this.mesh.visible = false;
            checkGameState();
        }
    }

    update() {
        if (!this.mesh.visible || gameState !== 'PLAYING') return;
        const dist = this.mesh.position.distanceTo(camera.position);
        this.mesh.lookAt(camera.position.x, 0, camera.position.z);

        if (dist > STATS.BOT.STOP_DIST) {
            const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();
            this.mesh.position.add(new THREE.Vector3(dir.x, 0, dir.z).multiplyScalar(STATS.BOT.SPEED));
        }

        if (Date.now() - this.lastShot > 1500) {
            this.lastShot = Date.now();
            if (Math.random() > STATS.BOT.ACCURACY_ERROR) {
                playerHp -= STATS.BOT.DAMAGE;
                document.body.style.boxShadow = "inset 0 0 100px #ff0000";
                setTimeout(() => document.body.style.boxShadow = "none", 100);
                updateUI();
                checkGameState();
            }
        }
    }
}

// --- MECÂNICAS ---
function handleShoot() {
    if (gameState !== 'PLAYING' || isReloading || currentMag <= 0) return;
    currentMag--;
    updateUI();

    recoilGroup.rotation.x += 0.15;
    weaponArm.position.z += 0.1;

    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);

    const hitObjects = ray.intersectObjects(scene.children, true);
    for (let hit of hitObjects) {
        if (obstacles.some(o => o === hit.object || o.children.includes(hit.object))) break;
        if (bots[0].mesh.children.includes(hit.object) || bots[0].mesh === hit.object) {
            bots[0].onHit(STATS.PLAYER.DAMAGE);
            break;
        }
    }
}

function updateUI() {
    const pFill = document.getElementById('player-health-fill');
    const bFill = document.getElementById('bot-health-fill');
    if (pFill) pFill.style.width = Math.max(0, playerHp) + '%';
    if (bFill) bFill.style.width = Math.max(0, botHp) + '%';
    const ammo = document.getElementById('ammo-count');
    if (ammo) ammo.innerText = currentMag;
}

function checkGameState() {
    if (playerHp <= 0) {
        gameState = 'GAMEOVER';
        document.getElementById('game-over-overlay').classList.remove('hidden');
        controls.unlock();
    } else if (botHp <= 0) {
        gameState = 'VICTORY';
        document.getElementById('victory-overlay').classList.remove('hidden');
        controls.unlock();
        new Audio('assets/dally_trend.mp3').play().catch(() => { });
        camera.position.set(0, 3, 6);
        camera.lookAt(0, 1.5, 0);
    }
}

function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        movePlayer();
        bots.forEach(b => b.update());
        recoilGroup.rotation.x *= 0.9;
        weaponArm.position.z *= 0.85;
    }
    renderer.render(scene, camera);
}

function movePlayer() {
    if (!controls.isLocked) return;
    const mv = new THREE.Vector3();
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    f.y = 0; r.y = 0; f.normalize(); r.normalize();
    if (keys['KeyW']) mv.add(f); if (keys['KeyS']) mv.sub(f);
    if (keys['KeyA']) mv.sub(r); if (keys['KeyD']) mv.add(r);
    if (mv.length() > 0) {
        mv.normalize().multiplyScalar(STATS.PLAYER.SPEED);
        camera.position.add(mv);
    }
}

// --- INPUTS ---
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', e => { if (e.button === 0) handleShoot(); });

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-overlay').classList.add('hidden');
    gameState = 'PLAYING';
    controls.lock();
    updateUI();
});

// INITIALIZE
generateMap();
bots = [new ArenaBot()];
loop();
