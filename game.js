import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

console.log("BOX FIGHT 3D - VERSÃO 2.1 (FIX ESTABILIDADE) CARREGADA");

/**
 * RECONSTRUÇÃO TOTAL: CORREÇÃO DE MORTE INSTANTÂNEA E TRAVA DE CÂMERA
 */

// --- CONFIGURAÇÕES ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 30, SPEED: 0.16, MAG: 10, TOTAL: 30, RELOAD: 2500 },
    BOT: { HP: 100, DAMAGE: 30, SPEED: 0.08, ACCURACY_ERROR: 0.15, REACTION: 1000, STOP_DIST: 5 }
};

// --- ESTADO GLOBAL ---
let gameState = 'START';
let currentPhase = 1;
let playerHp = 100;
let botHp = 100;
let currentMag = STATS.PLAYER.MAG;
let reserveAmmo = STATS.PLAYER.TOTAL - STATS.PLAYER.MAG;
let isReloading = false;
const keys = {};

let bots = [];
let solidObjects = [];
let obstacleBoxes = [];

// --- SETUP THREE.JS ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
scene.fog = new THREE.FogExp2(0x020205, 0.015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const recoilGroup = new THREE.Group();
camera.add(recoilGroup);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.getElementById('game-container').appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);

// ILUMINAÇÃO
scene.add(new THREE.HemisphereLight(0xffffff, 0x080820, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(20, 50, 10);
sun.castShadow = true;
scene.add(sun);

// --- 1. O MAPA (BOX FIGHT) ---
function generateMap() {
    solidObjects.forEach(o => scene.remove(o));
    solidObjects = []; obstacleBoxes = [];

    // Solo
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ color: 0x1a401a })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const addSolid = (mesh, x, z, y = 0) => {
        mesh.position.set(x, y, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
        solidObjects.push(mesh);
        obstacleBoxes.push(new THREE.Box3().setFromObject(mesh));
    };

    // Árvores e Pedras
    for (let i = 0; i < 15; i++) {
        const tree = new THREE.Group();
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x3d2b1f }));
        t.position.y = 3;
        const l = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 8), new THREE.MeshStandardMaterial({ color: 0x0a5d0a }));
        l.position.y = 7;
        tree.add(t, l);
        addSolid(tree, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80);
    }
    for (let i = 0; i < 8; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 4), new THREE.MeshStandardMaterial({ color: 0x444444 }));
        addSolid(s, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70, 4);
    }
}

// --- 2. JOGADOR: MAGNUM .357 (VIEWMODEL) ---
const weaponArm = new THREE.Group();
function createWeapon() {
    weaponArm.clear();
    const iron = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.2 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd2b48c });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.8), skin);
    arm.position.set(0.4, -0.4, -0.3);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.5), iron);
    barrel.position.set(0.4, -0.28, -0.7);
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.15, 8), iron);
    cyl.rotation.x = Math.PI / 2; cyl.position.set(0.4, -0.28, -0.45);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.12), wood);
    grip.position.set(0.4, -0.4, -0.35); grip.rotation.x = 0.3;

    weaponArm.add(arm, barrel, cyl, grip);
    recoilGroup.add(weaponArm);
}
createWeapon();

// --- 3. BOT HUMANOIDE ---
class ArenaBot {
    constructor() {
        this.group = new THREE.Group();
        this.hp = 100;
        this.lastShot = 0;
        this.isFlashing = false;

        const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69 });
        const clothes = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });

        this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), clothes);
        this.torso.position.y = 1.25;
        this.head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
        this.head.position.y = 1.9;
        this.group.add(this.torso, this.head);

        const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.25), clothes); lLeg.position.set(-0.18, 0.4, 0);
        const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.25), clothes); rLeg.position.set(0.18, 0.4, 0);
        this.group.add(lLeg, rLeg);

        const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), skin); lArm.position.set(-0.4, 1.3, 0);
        this.rArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), skin); this.rArm.position.set(0.4, 1.3, 0);
        this.group.add(lArm, this.rArm);

        scene.add(this.group);
        this.respawn();
    }

    respawn() {
        this.hp = 100; botHp = 100;
        this.group.visible = true;
        this.group.position.set((Math.random() - 0.5) * 30, 0, -15);
        updateUI();
    }

    onHit(dmg) {
        this.hp -= dmg; botHp = this.hp;
        updateUI();
        if (!this.isFlashing) {
            this.isFlashing = true;
            this.torso.material.color.set(0xff0000);
            setTimeout(() => { if (this.torso) this.torso.material.color.set(0x1a1a1a); this.isFlashing = false; }, 100);
        }
        if (this.hp <= 0) { this.group.visible = false; checkGameState(); }
    }

    update() {
        if (!this.group.visible || gameState !== 'PLAYING') return;
        const dist = this.group.position.distanceTo(camera.position);
        this.group.lookAt(camera.position.x, 0, camera.position.z);

        // Perseguição
        if (dist > STATS.BOT.STOP_DIST) {
            const dir = new THREE.Vector3().subVectors(camera.position, this.group.position).normalize();
            this.group.position.add(new THREE.Vector3(dir.x, 0, dir.z).multiplyScalar(STATS.BOT.SPEED));
        }

        // Ataque (Somente se estiver perto e no tempo de cooldown)
        if (Date.now() - this.lastShot > 2000) {
            this.lastShot = Date.now();
            if (Math.random() > STATS.BOT.ACCURACY_ERROR) {
                playerHp -= STATS.BOT.DAMAGE;
                document.body.style.boxShadow = "inset 0 0 50px #ff0000";
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
    currentMag--; updateUI();
    recoilGroup.rotation.x += 0.15;
    weaponArm.position.z += 0.1;

    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const wallHits = ray.intersectObjects(solidObjects, true);
    const wallDist = wallHits.length > 0 ? wallHits[0].distance : Infinity;

    bots.forEach(b => {
        if (b.group.visible) {
            const hit = ray.intersectObject(b.group, true);
            if (hit.length > 0 && hit[0].distance < wallDist) b.onHit(STATS.PLAYER.DAMAGE);
        }
    });
}

function updateUI() {
    const p = document.getElementById('player-health-fill');
    const b = document.getElementById('bot-health-fill');
    if (p) p.style.width = Math.max(0, playerHp) + '%';
    if (b) b.style.width = Math.max(0, botHp) + '%';
    const ammoCount = document.getElementById('ammo-count');
    const ammoTotal = document.getElementById('total-ammo');
    if (ammoCount) ammoCount.innerText = currentMag;
    if (ammoTotal) ammoTotal.innerText = reserveAmmo + currentMag;
}

function checkGameState() {
    if (playerHp <= 0 && gameState === 'PLAYING') {
        gameState = 'GAMEOVER';
        document.getElementById('game-over-overlay').classList.remove('hidden');
        controls.unlock();
    }
    if (botHp <= 0 && gameState === 'PLAYING') {
        gameState = 'VICTORY';
        document.getElementById('victory-overlay').classList.remove('hidden');
        controls.unlock();
    }
}

function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        move();
        bots.forEach(b => b.update());
        recoilGroup.rotation.x *= 0.9;
        weaponArm.position.z *= 0.85;
    }
    renderer.render(scene, camera);
}

function move() {
    if (!controls.isLocked) return;
    const mv = new THREE.Vector3();
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    f.y = 0; r.y = 0; f.normalize(); r.normalize();
    if (keys['KeyW']) mv.add(f); if (keys['KeyS']) mv.sub(f);
    if (keys['KeyA']) mv.sub(r); if (keys['KeyD']) mv.add(r);
    camera.position.add(mv.multiplyScalar(STATS.PLAYER.SPEED));
}

// INICIALIZAÇÃO
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', e => { if (e.button === 0) handleShoot(); });

document.getElementById('start-btn').addEventListener('click', () => {
    // RESET TOTAL NO START
    playerHp = 100; botHp = 100;
    currentMag = STATS.PLAYER.MAG;
    reserveAmmo = STATS.PLAYER.TOTAL - STATS.PLAYER.MAG;

    document.getElementById('start-overlay').classList.add('hidden');
    gameState = 'PLAYING';
    camera.position.set(0, 1.7, 12);
    controls.lock();
    updateUI();
});

document.getElementById('retry-btn').addEventListener('click', () => location.reload());

generateMap();
bots = [new ArenaBot()];
loop();
