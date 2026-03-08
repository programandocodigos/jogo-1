import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D - RESTAURAÇÃO E FIX DE EMERGÊNCIA
 * Versão Estável: Cenário Completo + Lógica de Vida/Feedback
 */

// --- CONFIGURAÇÕES ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 35, SPEED: 0.16, MAG_SIZE: 10, TOTAL_RESERVE: 30, RELOAD_TIME: 2500 },
    BOT: { HP: 100, DAMAGE: 25, SPEED: 0.08, ACCURACY_ERROR: 0.12, REACTION_TIME: 500, COOLDOWN: 800 }
};

// --- ESTADO GLOBAL ---
let gameState = 'START';
let currentPhase = 1;
let coins = 0;
let playerHp = 100;
let currentMag = STATS.PLAYER.MAG_SIZE;
let reserveAmmo = STATS.PLAYER.TOTAL_RESERVE;
let isReloading = false;
let lastShotTime = 0;
let lastStep = 0;

let bots = [];
let solidObjects = [];
let obstacleBoxes = [];
const keys = {};

// --- SETUP THREE.JS (Otimizado) ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
scene.fog = new THREE.FogExp2(0x020205, 0.02);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const recoilGroup = new THREE.Group();
camera.add(recoilGroup);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limite de performance
renderer.shadowMap.enabled = true;
document.getElementById('game-container').appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);

// ILUMINAÇÃO (Simples para Performance)
const ambient = new THREE.HemisphereLight(0xffffff, 0x080820, 0.5);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(20, 40, 10);
sun.castShadow = true;
scene.add(sun);

// ESTRELAS (Restauração Visual)
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(2000 * 3);
for (let i = 0; i < 6000; i++) starPos[i] = (Math.random() - 0.5) * 600;
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7 })));

// --- MODELO MAGNUM .357 (Restauração) ---
const weaponProxy = new THREE.Group();
function createMagnum() {
    weaponProxy.clear();
    const iron = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.2 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });

    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.5), iron);
    barrel.position.z = -0.35;
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.15, 8), iron);
    cylinder.rotation.x = Math.PI / 2; cylinder.position.z = -0.1;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.12), wood);
    grip.position.set(0, -0.15, 0); grip.rotation.x = 0.3;

    weaponProxy.add(barrel, cylinder, grip);
    weaponProxy.position.set(0.3, -0.2, -0.4);
    recoilGroup.add(weaponProxy);
}
createMagnum();

// --- CENÁRIO: RESTAURAÇÃO DA FÍSICA E ELEMENTOS ---
function generateArena() {
    solidObjects.forEach(o => scene.remove(o));
    solidObjects = []; obstacleBoxes = [];

    // Chão de Grama
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x051a05 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor);

    const addSolid = (mesh, x, z) => {
        mesh.position.set(x, 0, z); // Pés no chão
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
        solidObjects.push(mesh);
        obstacleBoxes.push(new THREE.Box3().setFromObject(mesh));
    };

    // Árvores com Folhas (Restauração do estilo antigo)
    for (let i = 0; i < 15; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 5), new THREE.MeshStandardMaterial({ color: 0x2d1b1f }));
        trunk.position.y = 2.5;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 8), new THREE.MeshStandardMaterial({ color: 0x0a3d0a }));
        leaves.position.y = 6;
        tree.add(trunk, leaves);
        addSolid(tree, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80);
    }

    // Pedras Altas (Cover)
    for (let i = 0; i < 10; i++) {
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(2), new THREE.MeshStandardMaterial({ color: 0x444444 }));
        stone.position.y = 1.5;
        stone.scale.set(Math.random() + 0.5, Math.random() + 1.5, Math.random() + 0.5);
        addSolid(stone, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80);
    }
}

// --- CLASSE BOT: INJEÇÃO CIRÚRGICA DE VIDA/DANOS ---
class ArenaBot {
    constructor() {
        this.id = Math.random().toString(36).substr(2, 9);
        this.hp = 100;
        this.maxHp = 100;
        this.mesh = new THREE.Group();
        this.lastShotTime = 0;
        this.seePlayerTime = 0;
        this.isFlashing = false;

        // Corpo
        this.matSkin = new THREE.MeshStandardMaterial({ color: 0xd2b48c });
        this.matClothes = new THREE.MeshStandardMaterial({ color: 0x111111 });

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.4), this.matClothes);
        body.position.y = 0.6;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), this.matSkin);
        head.position.y = 1.4;
        this.mesh.add(body, head);
        this.bodyMesh = body;

        // Barra de Vida (Health Bar 3D)
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 32;
        this.hpTex = new THREE.CanvasTexture(canvas);
        this.hpSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.hpTex }));
        this.hpSprite.position.y = 2.1;
        this.hpSprite.scale.set(1.2, 0.3, 1);
        this.mesh.add(this.hpSprite);

        this.updateHpUI();
        scene.add(this.mesh);
        this.respawn();
    }

    respawn() {
        this.hp = 100;
        this.mesh.visible = true;
        this.mesh.position.set((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 40 - 20); // y=0 FIXED
        this.updateHpUI();
    }

    updateHpUI() {
        const ctx = this.hpTex.image.getContext('2d');
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 128, 32);
        ctx.fillStyle = '#0f0'; ctx.fillRect(2, 2, (this.hp / this.maxHp) * 124, 28);
        this.hpTex.needsUpdate = true;
    }

    onHit(damage) {
        this.hp -= damage;
        this.updateHpUI();

        // Flash Vermelho
        if (!this.isFlashing) {
            this.isFlashing = true;
            this.bodyMesh.material.color.set(0xff0000);
            setTimeout(() => {
                this.bodyMesh.material.color.set(0x111111);
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

        // Raycast LOS (Não atravessa paredes)
        const ray = new THREE.Raycaster(this.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)), dir);
        const hits = ray.intersectObjects(solidObjects, true);
        const playerVisible = (hits.length === 0 || hits[0].distance > dist);

        if (playerVisible) {
            if (this.seePlayerTime === 0) this.seePlayerTime = Date.now();
            this.mesh.lookAt(camera.position.x, 0, camera.position.z);

            // Nerf IA: Delay e Dispersão
            const timeSeen = Date.now() - this.seePlayerTime;
            const cooldown = Date.now() - this.lastShotTime;

            if (timeSeen > STATS.BOT.REACTION_TIME && cooldown > STATS.BOT.COOLDOWN) {
                this.shoot();
            }

            if (dist > 7) {
                this.mesh.position.add(new THREE.Vector3(dir.x, 0, dir.z).multiplyScalar(STATS.BOT.SPEED));
            }
        } else {
            this.seePlayerTime = 0;
        }
    }

    shoot() {
        this.lastShotTime = Date.now();
        // Tiro do Bot com Erro
        if (Math.random() > STATS.BOT.ACCURACY_ERROR) {
            playerHp -= STATS.BOT.DAMAGE;
            document.body.style.boxShadow = "inset 0 0 100px #ff0000";
            setTimeout(() => document.body.style.boxShadow = "none", 100);
            checkGameState();
        }
        this.renderTracer(this.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)), camera.position);
    }

    renderTracer(start, end) {
        const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffff00, opacity: 0.4, transparent: true }));
        scene.add(line);
        setTimeout(() => scene.remove(line), 50);
    }
}

// --- LOGICA DE JOGO E COMBATE FPS ---
function handleShoot() {
    if (isReloading || gameState !== 'PLAYING' || currentMag <= 0) {
        if (currentMag <= 0 && !isReloading) reload();
        return;
    }
    if (Date.now() - lastShotTime < 400) return;

    lastShotTime = Date.now();
    currentMag--;
    updateUI();

    // Recoil Visual
    recoilGroup.rotation.x += 0.1;
    weaponProxy.position.z += 0.15;

    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    ray.set(camera.position, dir);

    const wallHits = ray.intersectObjects(solidObjects, true);
    const wallDist = wallHits.length > 0 ? wallHits[0].distance : Infinity;

    let target = null;
    let dist = Infinity;
    bots.forEach(b => {
        if (b.mesh.visible) {
            const hits = ray.intersectObject(b.mesh, true);
            if (hits.length > 0 && hits[0].distance < dist) {
                dist = hits[0].distance; target = b;
            }
        }
    });

    if (target && dist < wallDist) {
        target.onHit(STATS.PLAYER.DAMAGE);
        showHitMarker();
    }
}

function reload() {
    if (isReloading || reserveAmmo <= 0 || currentMag === STATS.PLAYER.MAG_SIZE) return;
    isReloading = true;
    document.getElementById('ammo-count').innerText = "...";
    setTimeout(() => {
        const needed = STATS.PLAYER.MAG_SIZE - currentMag;
        const take = Math.min(needed, reserveAmmo);
        currentMag += take;
        reserveAmmo -= take;
        isReloading = false;
        updateUI();
    }, STATS.PLAYER.RELOAD_TIME);
}

function updateUI() {
    const fill = document.getElementById('player-health-fill');
    if (fill) fill.style.width = Math.max(0, playerHp) + '%';
    document.getElementById('ammo-count').innerText = currentMag;
    document.getElementById('total-ammo').innerText = reserveAmmo;
    document.getElementById('coin-count').innerText = coins;
    document.getElementById('phase-display').innerText = `FASE ${currentPhase}`;
}

function showHitMarker() {
    const c = document.getElementById('crosshair'); c.style.borderColor = 'red';
    setTimeout(() => c.style.borderColor = 'rgba(255,255,255,0.8)', 100);
}

function checkGameState() {
    updateUI();
    if (playerHp <= 0 && gameState === 'PLAYING') {
        gameState = 'GAMEOVER';
        document.getElementById('game-over-overlay').classList.remove('hidden');
        controls.unlock();
    }
    if (bots.length > 0 && bots.every(b => !b.mesh.visible) && gameState === 'PLAYING') {
        gameState = 'VICTORY';
        runVictorySequence();
    }
}

function runVictorySequence() {
    document.getElementById('victory-overlay').classList.remove('hidden');
    controls.unlock();
    const music = new Audio('assets/dally_trend.mp3');
    music.play().catch(() => { });
    camera.position.set(0, 3, 6); camera.lookAt(0, 1.5, 0);
}

function move() {
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
        const pBox = new THREE.Box3().setFromCenterAndSize(next, new THREE.Vector3(0.8, 2, 0.8));
        if (!obstacleBoxes.some(b => pBox.intersectsBox(b))) camera.position.copy(next);
    }
}

function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        move();
        bots.forEach(b => b.update());
        recoilGroup.rotation.x *= 0.9;
        weaponProxy.position.z *= 0.85;
    }
    renderer.render(scene, camera);
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
});

document.getElementById('next-phase-btn').addEventListener('click', () => {
    currentPhase++;
    document.getElementById('victory-overlay').classList.add('hidden');
    generateArena();
    bots.forEach(b => b.respawn());
    if (currentPhase > bots.length) bots.push(new ArenaBot());
    playerHp = 100;
    camera.position.set(0, 1.7, 12);
    controls.lock();
    gameState = 'PLAYING';
    updateUI();
});

// START
generateArena();
bots = [new ArenaBot()];
loop();
