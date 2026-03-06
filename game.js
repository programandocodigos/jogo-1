import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D - VERSÃO ESTÁVEL
 * Foco: Movimentação, Grama e Visibilidade
 */

const STATS = {
    PLAYER: { HP: 100, DAMAGE: 25, SPEED: 0.16, MAG_SIZE: 20, TOTAL_RESERVE: 60 },
    BOT: { HP: 100, DAMAGE: 10, SPEED: 0.06, ACCURACY: 0.70, MAG_SIZE: 12 }
};

// --- SISTEMA DE ÁUDIO ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const g = audioCtx.createGain(), o = audioCtx.createOscillator();
    o.connect(g); g.connect(audioCtx.destination);
    if (type === 'SHOOT') {
        o.frequency.setValueAtTime(220, audioCtx.currentTime);
        g.gain.setValueAtTime(0.1, audioCtx.currentTime);
        o.start(); o.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'HEAL') {
        o.frequency.setValueAtTime(600, audioCtx.currentTime);
        o.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.3);
        g.gain.setValueAtTime(0.1, audioCtx.currentTime);
        o.start(); o.stop(audioCtx.currentTime + 0.3);
    }
}

// --- ESTADO DO JOGO ---
let gameState = 'START';
let currentPhase = 1;
let coins = 0;
let currentWeapon = 'PISTOL';
let playerHp = 100;
let currentMag = 20;
let reserveAmmo = 60;
let isMouseDown = false;
let isReloading = false;
let lastShotTime = 0;
let bots = [];
let obstacleBoxes = [];
let obstacles = [];
let grassItems = [];
let drops = [];
const keys = {};

// --- CENA ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.FogExp2(0x050510, 0.015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const recoilGroup = new THREE.Group();
camera.add(recoilGroup);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById('game-container').appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);

// Luzes (Essencial para não ficar tudo preto)
scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(20, 40, 20);
scene.add(sun);

// Arma
const weaponProxy = new THREE.Group();
const gunMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), gunMat);
barrel.position.z = -0.3;
const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.1), gunMat);
grip.position.set(0, -0.15, -0.1);
weaponProxy.add(barrel, grip);
weaponProxy.position.set(0.35, -0.25, -0.4);
recoilGroup.add(weaponProxy);

// --- MAPA ---
function generateMap() {
    obstacles.forEach(o => scene.remove(o)); obstacles = []; obstacleBoxes = [];
    grassItems.forEach(g => scene.remove(g)); grassItems = [];
    drops.forEach(d => scene.remove(d.mesh)); drops = [];

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshPhongMaterial({ color: 0x152b15 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Grama
    const grassGeo = new THREE.BoxGeometry(0.05, 0.4, 0.05), grassMat = new THREE.MeshPhongMaterial({ color: 0x1a441a });
    for (let i = 0; i < 400; i++) {
        const g = new THREE.Mesh(grassGeo, grassMat);
        g.position.set((Math.random() - 0.5) * 110, 0.2, (Math.random() - 0.5) * 110);
        scene.add(g); grassItems.push(g);
    }

    const addBox = (w, h, d, x, z) => {
        if (Math.sqrt(x * x + (z - 12) * (z - 12)) < 7) return;
        const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshPhongMaterial({ color: 0x333344 }));
        box.position.set(x, h / 2, z); scene.add(box);
        obstacles.push(box); obstacleBoxes.push(new THREE.Box3().setFromObject(box));
    };
    for (let i = 0; i < 15; i++) addBox(4, 3, 4, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90);
}

// --- BOT ---
class HumanoidBot {
    constructor(isBoss = false) {
        this.isBoss = isBoss; this.id = Math.random().toString(36).substr(2, 9);
        this.maxHp = isBoss ? 1000 : (currentPhase === 2 ? 150 : 100); this.hp = this.maxHp;
        this.mesh = new THREE.Group();
        const skin = new THREE.MeshPhongMaterial({ color: 0xd2b48c }), clothes = new THREE.MeshPhongMaterial({ color: currentPhase === 2 ? 0xff0000 : 0x111111 });
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), clothes); body.position.y = 1.3;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), skin); head.position.y = 1.85;
        const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), clothes); lLeg.position.set(-0.15, 0.4, 0);
        const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), clothes); rLeg.position.set(0.15, 0.4, 0);
        this.mesh.add(body, head, lLeg, rLeg);
        this.rArm = new THREE.Group();
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.15), skin); arm.position.y = -0.3;
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.45), new THREE.MeshPhongMaterial({ color: 0 }));
        gun.position.set(0, -0.6, 0.2); this.rArm.add(arm, gun);
        this.rArm.position.set(0.35, 1.7, 0); this.mesh.add(this.rArm);
        scene.add(this.mesh); this.reset();
    }
    reset() {
        this.mesh.visible = true; this.hp = this.maxHp;
        this.mesh.position.set((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 40 - 20);
        if (this.isBoss) this.mesh.scale.set(5, 5, 5);
        const hb = document.getElementById('bots-health-container');
        if (!document.getElementById(`bar-${this.id}`)) {
            const wrap = document.createElement('div'); wrap.id = `bar-${this.id}`;
            wrap.innerHTML = `<div class="health-bar bot-health"><div id="fill-${this.id}" class="health-fill" style="width:100%"></div></div>`;
            hb.appendChild(wrap);
        }
        this.updateUI();
    }
    updateUI() {
        const f = document.getElementById(`fill-${this.id}`); if (f) f.style.width = (this.hp / this.maxHp) * 100 + '%';
    }
    update() {
        if (this.hp <= 0 || gameState !== 'PLAYING') { this.mesh.visible = false; return; }
        const dist = this.mesh.position.distanceTo(camera.position);
        this.mesh.lookAt(camera.position.x, 0, camera.position.z);
        if (dist > 8) this.mesh.position.addScaledVector(new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize(), STATS.BOT.SPEED);
        if (Date.now() - (this.lastShot || 0) > (currentPhase >= 2 ? 800 : 1200)) this.shoot();
    }
    shoot() {
        this.lastShot = Date.now();
        if (Math.random() < 0.6) { playerHp -= 10; checkGameState(); }
    }
    die() {
        this.mesh.visible = false; const w = document.getElementById(`bar-${this.id}`); if (w) w.remove();
        if (Math.random() < 0.4) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshPhongMaterial({ color: 0x22c55e }));
            m.position.copy(this.mesh.position); scene.add(m); drops.push({ mesh: m, type: 'MEDKIT' });
        }
        checkGameState();
    }
}

// --- JOGABILIDADE ---
function checkGameState() {
    const pf = document.getElementById('player-health-fill'); if (pf) pf.style.width = Math.max(0, playerHp) + '%';
    document.getElementById('ammo-count').innerText = currentMag;
    document.getElementById('total-ammo').innerText = reserveAmmo;
    document.getElementById('coin-count').innerText = coins;
    document.getElementById('phase-display').innerText = `FASE ${currentPhase}`;
    bots.forEach(b => b.updateUI());
    if (playerHp <= 0 && gameState === 'PLAYING') {
        gameState = 'GAMEOVER'; document.getElementById('game-over-overlay').classList.remove('hidden'); controls.unlock();
    }
    if (bots.length > 0 && bots.every(b => b.hp <= 0) && gameState === 'PLAYING') {
        gameState = 'VICTORY'; coins += 50; document.getElementById('victory-overlay').classList.remove('hidden'); controls.unlock();
    }
}

function handleShoot() {
    if (isReloading || gameState !== 'PLAYING' || currentMag <= 0) return;
    if (Date.now() - lastShotTime < (currentWeapon === 'RIFLE' ? 100 : 400)) return;
    lastShotTime = Date.now(); currentMag--; playSound('SHOOT');
    recoilGroup.rotation.x += 0.04; weaponProxy.position.z += 0.1;
    const r = new THREE.Raycaster(); r.set(camera.position, new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion));
    let hitBot = null, bestD = Infinity;
    bots.forEach(b => { if (b.hp > 0) { const h = r.intersectObject(b.mesh, true); if (h.length > 0 && h[0].distance < bestD) { bestD = h[0].distance; hitBot = b; } } });
    if (hitBot) { hitBot.hp -= 20; if (hitBot.hp <= 0) hitBot.die(); }
    checkGameState(); if (currentMag === 0) reload();
}

function reload() {
    if (isReloading || reserveAmmo <= 0) return; isReloading = true;
    setTimeout(() => {
        const take = Math.min(20 - currentMag, reserveAmmo); currentMag += take; reserveAmmo -= take;
        isReloading = false; checkGameState();
    }, 1200);
}

function move() {
    if (!controls.isLocked) return;
    const mv = new THREE.Vector3(), f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    f.y = 0; r.y = 0; f.normalize(); r.normalize();
    if (keys['KeyW']) mv.add(f); if (keys['KeyS']) mv.sub(f); if (keys['KeyA']) mv.sub(r); if (keys['KeyD']) mv.add(r);
    if (mv.length() > 0) {
        mv.normalize().multiplyScalar(STATS.PLAYER.SPEED);
        const next = camera.position.clone().add(mv);
        const pBox = new THREE.Box3().setFromCenterAndSize(next, new THREE.Vector3(0.7, 1.8, 0.7));
        if (!obstacleBoxes.some(b => pBox.intersectsBox(b))) camera.position.copy(next);
    }
    drops.forEach((d, i) => { if (camera.position.distanceTo(d.mesh.position) < 1.5) { playerHp = Math.min(100, playerHp + 40); scene.remove(d.mesh); drops.splice(i, 1); playSound('HEAL'); checkGameState(); } });
}

function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        move(); bots.forEach(b => b.update());
        if (isMouseDown && currentWeapon !== 'PISTOL') handleShoot();
        recoilGroup.rotation.x *= 0.9; weaponProxy.position.z *= 0.85;
    }
    renderer.render(scene, camera);
}

// Eventos
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', e => { if (e.button === 0) { isMouseDown = true; if (currentWeapon === 'PISTOL') handleShoot(); } });
window.addEventListener('mouseup', () => isMouseDown = false);

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-overlay').classList.add('hidden');
    gameState = 'PLAYING'; playerHp = 100;
    camera.position.set(0, 1.7, 12); controls.lock();
});

document.getElementById('retry-btn').addEventListener('click', () => location.reload());
document.getElementById('next-phase-btn').addEventListener('click', () => {
    currentPhase++; document.getElementById('victory-overlay').classList.add('hidden');
    bots.forEach(b => { if (b.mesh) scene.remove(b.mesh); const w = document.getElementById(`bar-${b.id}`); if (w) w.remove(); });
    bots = (currentPhase === 2) ? [new HumanoidBot(), new HumanoidBot()] : [new HumanoidBot(true)];
    playerHp = 100; camera.position.set(0, 1.7, 12); controls.lock();
    gameState = 'PLAYING';
});

// --- INÍCIO ---
generateMap();
bots = [new HumanoidBot()];
loop();
