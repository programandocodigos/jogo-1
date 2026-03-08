import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D - VERSÃO DEFINITIVA (RECONSTRUÇÃO TOTAL)
 * Atendendo todos os requisitos do Ultimato Técnico.
 */

// --- CONFIGURAÇÕES DO MOTOR ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 30, SPEED: 0.16, MAG: 10, TOTAL: 30, RELOAD: 2500 },
    BOT: { HP: 100, DAMAGE: 40, SPEED: 0.08, ACCURACY_ERROR: 0.15, STOP_DIST: 6 }
};

// --- ESTADO GLOBAL ---
let gameState = 'START';
let playerHp = 100;
let botHp = 100;
let currentMag = STATS.PLAYER.MAG;
let reserveAmmo = STATS.PLAYER.TOTAL - STATS.PLAYER.MAG;
let isReloading = false;
let lastShotTime = 0;

let bots = [];
let obstacles = []; // Para renderizar
let obstacleBoxes = []; // Para colisões físicas (BoundingBoxes)
const keys = {};

// --- SETUP SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
scene.fog = new THREE.FogExp2(0x020205, 0.02);

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
const ambient = new THREE.HemisphereLight(0xffffff, 0x080820, 0.6);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(20, 50, 10);
sun.castShadow = true;
sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
scene.add(sun);

// --- 1. O MAPA (RESTAURADO) ---
function generateMap() {
    obstacles.forEach(o => scene.remove(o));
    obstacles = []; obstacleBoxes = [];

    // GRAMA (Solo Verde)
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
        // BoundingBox real para bloqueio de física e tiros
        const box = new THREE.Box3().setFromObject(mesh);
        obstacleBoxes.push(box);
    };

    // ÁRVORES (Tronco + Copa)
    for (let i = 0; i < 15; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x3d2b1f }));
        trunk.position.y = 3;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 8), new THREE.MeshStandardMaterial({ color: 0x0a5d0a }));
        leaves.position.y = 7;
        tree.add(trunk, leaves);
        addSolid(tree, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80);
    }

    // PEDRAS ALTAS (COBERTURA REAL)
    for (let i = 0; i < 10; i++) {
        const stone = new THREE.Mesh(
            new THREE.BoxGeometry(4, 8, 4),
            new THREE.MeshStandardMaterial({ color: 0x444444 })
        );
        const x = (Math.random() - 0.5) * 70;
        const z = (Math.random() - 0.5) * 70;
        addSolid(stone, x, z, 4); // y=4 pois o cubo tem 8 de altura
    }
}

// --- 2. O JOGADOR (MAGNUM .357) ---
const weaponArm = new THREE.Group();
function createFPSArm() {
    weaponArm.clear();
    const skin = new THREE.MeshStandardMaterial({ color: 0xd2b48c });
    const iron = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 });

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), skin);
    arm.position.set(0.2, -0.25, -0.3);
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.15, 0.5), iron);
    gun.position.set(0.2, -0.15, -0.6);

    weaponArm.add(arm, gun);
    recoilGroup.add(weaponArm);
}
createFPSArm();

// --- 3. O BOT (IA COM PÉS NO CHÃO) ---
class ArenaBot {
    constructor() {
        this.mesh = new THREE.Group();
        this.hp = 100;
        this.lastShot = 0;
        this.reactionStart = 0;
        this.isFlashing = false;

        const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69 });
        const clothes = new THREE.MeshStandardMaterial({ color: 0x222222 });

        this.body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.4), clothes);
        this.body.position.y = 0.7; // Pés no y=0
        this.head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
        this.head.position.y = 1.6;

        this.mesh.add(this.body, this.head);
        scene.add(this.mesh);
        this.respawn();
    }

    respawn() {
        this.hp = 100;
        botHp = 100;
        this.mesh.visible = true;
        this.mesh.position.set((Math.random() - 0.5) * 40, 0, -20);
        updateUI();
    }

    onHit(dmg) {
        this.hp -= dmg;
        botHp = this.hp;
        updateUI();

        // Flash de Dano (Vermelho)
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
        const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();

        // Raycast LOS (Não atira através de paredes)
        const ray = new THREE.Raycaster(this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), dir);
        const hits = ray.intersectObjects(obstacles, true);
        const canSee = (hits.length === 0 || hits[0].distance > dist);

        if (canSee) {
            this.mesh.lookAt(camera.position.x, 0, camera.position.z);

            // Perseguição (Para a 6m)
            if (dist > STATS.BOT.STOP_DIST) {
                this.mesh.position.add(new THREE.Vector3(dir.x, 0, dir.z).multiplyScalar(STATS.BOT.SPEED));
            }

            // Atirar com Erro de 15%
            if (Date.now() - this.lastShot > 1200) {
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
}

// --- MECÂNICAS DE TIRO ---
function handleShoot() {
    if (gameState !== 'PLAYING' || isReloading || currentMag <= 0) {
        if (currentMag <= 0 && !isReloading) reload();
        return;
    }

    currentMag--;
    lastShotTime = Date.now();
    updateUI();

    // Recoil
    recoilGroup.rotation.x += 0.15;
    weaponArm.position.z += 0.1;

    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);

    // Colisão com Cenário
    const wallHits = ray.intersectObjects(obstacles, true);
    const wallDist = wallHits.length > 0 ? wallHits[0].distance : Infinity;

    // Colisão com Bot
    let target = null;
    let bDist = Infinity;
    bots.forEach(b => {
        if (b.mesh.visible) {
            const hit = ray.intersectObject(b.mesh, true);
            if (hit.length > 0 && hit[0].distance < bDist) {
                bDist = hit[0].distance; target = b;
            }
        }
    });

    if (target && bDist < wallDist) {
        target.onHit(STATS.PLAYER.DAMAGE); // 30 Dano
    }
}

function reload() {
    if (isReloading || reserveAmmo <= 0 || currentMag === STATS.PLAYER.MAG) return;
    isReloading = true;
    document.getElementById('ammo-count').innerText = "...";
    setTimeout(() => {
        const need = STATS.PLAYER.MAG - currentMag;
        const take = Math.min(need, reserveAmmo);
        currentMag += take;
        reserveAmmo -= take;
        isReloading = false;
        updateUI();
    }, STATS.PLAYER.RELOAD); // 2.5s
}

function updateUI() {
    document.getElementById('player-health-fill').style.width = Math.max(0, playerHp) + '%';
    document.getElementById('bot-health-fill').style.width = Math.max(0, botHp) + '%';
    document.getElementById('ammo-count').innerText = currentMag;
    document.getElementById('total-ammo').innerText = reserveAmmo + currentMag;
    document.getElementById('phase-display').innerText = `FASE ${currentPhase}`;
}

function checkGameState() {
    if (playerHp <= 0 && gameState === 'PLAYING') {
        gameState = 'GAMEOVER';
        document.getElementById('game-over-overlay').classList.remove('hidden');
        controls.unlock();
    }
    if (bots.every(b => !b.mesh.visible) && gameState === 'PLAYING') {
        gameState = 'VICTORY';
        runVictorySequence();
    }
}

function runVictorySequence() {
    document.getElementById('victory-overlay').classList.remove('hidden');
    controls.unlock();
    const m = new Audio('assets/dally_trend.mp3');
    m.play().catch(() => { });

    // 3ª Pessoa
    camera.position.set(0, 3, 6);
    camera.lookAt(0, 1.5, 0);
}

// --- CICLO PRINCIPAL ---
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
        const next = camera.position.clone().add(mv);
        const pBox = new THREE.Box3().setFromCenterAndSize(next, new THREE.Vector3(1, 2, 1));
        if (!obstacleBoxes.some(box => pBox.intersectsBox(box))) {
            camera.position.copy(next);
        }
    }
}

// --- INPUTS ---
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR') reload();
});
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', e => { if (e.button === 0) handleShoot(); });

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-overlay').classList.add('hidden');
    gameState = 'PLAYING';
    camera.position.set(0, 1.7, 12);
    controls.lock();
    updateUI();
});

document.getElementById('retry-btn').addEventListener('click', () => location.reload());
document.getElementById('reset-btn').addEventListener('click', () => location.reload());

document.getElementById('next-phase-btn').addEventListener('click', () => {
    currentPhase++;
    gameState = 'PLAYING';
    document.getElementById('victory-overlay').classList.add('hidden');
    generateMap();
    bots.forEach(b => b.respawn());
    playerHp = 100;
    camera.position.set(0, 1.7, 12);
    controls.lock();
    updateUI();
});

// INITIALIZE
generateMap();
bots = [new ArenaBot()];
loop();
