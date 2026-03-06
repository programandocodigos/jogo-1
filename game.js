import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D - ESTABILIDADE MÁXIMA
 * Correção: Movimento, Colisão, Grama e Materiais
 */

const STATS = {
    PLAYER: { HP: 100, DAMAGE: 20, SPEED: 0.16, MAG_SIZE: 20, TOTAL_RESERVE: 60 },
    BOT: { HP: 100, DAMAGE: 10, SPEED: 0.06, ACCURACY: 0.70, MAG_SIZE: 12, RELOAD_TIME: 2000 }
};

// --- AUDIO ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const g = audioCtx.createGain(), o = audioCtx.createOscillator();
    o.connect(g); g.connect(audioCtx.destination);
    if (type === 'SHOOT') {
        o.frequency.setValueAtTime(200, audioCtx.currentTime);
        g.gain.setValueAtTime(0.1, audioCtx.currentTime);
        o.start(); o.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'HEAL') {
        o.frequency.setValueAtTime(500, audioCtx.currentTime);
        o.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.2);
        g.gain.setValueAtTime(0.1, audioCtx.currentTime);
        o.start(); o.stop(audioCtx.currentTime + 0.2);
    }
}

// --- STATE ---
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
let lastDamageTime = 0;
let bots = [];
let obstacles = [];
let obstacleBoxes = [];
let grassItems = [];
let drops = [];
const keys = {};

// --- SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050508);
scene.fog = new THREE.FogExp2(0x050508, 0.02);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const recoilGroup = new THREE.Group();
camera.add(recoilGroup);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById('game-container').appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);

// Lighting - Ajustado para visibilidade
const amb = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(amb);
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(10, 20, 10);
scene.add(sun);

// Arma
const weaponProxy = new THREE.Group();
const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), new THREE.MeshPhongMaterial({ color: 0x222222 }));
barrel.position.z = -0.25;
const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), new THREE.MeshPhongMaterial({ color: 0x111111 }));
grip.position.set(0, -0.15, -0.1);
weaponProxy.add(barrel, grip);
weaponProxy.position.set(0.3, -0.2, -0.4);
recoilGroup.add(weaponProxy);

// --- MAPA ---
function generateMap() {
    obstacles.forEach(o => scene.remove(o)); obstacles = []; obstacleBoxes = [];
    grassItems.forEach(g => scene.remove(g)); grassItems = [];
    drops.forEach(d => scene.remove(d.mesh)); drops = [];

    // Chão Verde Musgo
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshPhongMaterial({ color: 0x122212 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Obstáculos Planos (Varetas de Grama)
    const grassGeo = new THREE.BoxGeometry(0.05, 0.5, 0.05), grassMat = new THREE.MeshPhongMaterial({ color: 0x224422 });
    for (let i = 0; i < 500; i++) {
        const g = new THREE.Mesh(grassGeo, grassMat);
        g.position.set((Math.random() - 0.5) * 110, 0.25, (Math.random() - 0.5) * 110);
        scene.add(g); grassItems.push(g);
    }

    const addBox = (w, h, d, x, z) => {
        if (Math.sqrt(x * x + (z - 12) * (z - 12)) < 8) return;
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshPhongMaterial({ color: 0x333344 }));
        m.position.set(x, h / 2, z); scene.add(m); obstacles.push(m);
        obstacleBoxes.push(new THREE.Box3().setFromObject(m));
    };

    for (let i = 0; i < 15; i++) addBox(5, 4, 1, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80);
}

// --- BOT ---
class HumanoidBot {
    constructor(isBoss = false) {
        this.isBoss = isBoss; this.id = Math.random().toString(36).substr(2, 9);
        this.maxHp = isBoss ? 1000 : 100; this.hp = this.maxHp;
        this.mesh = new THREE.Group();
        const sm = new THREE.MeshPhongMaterial({ color: 0xd2b48c }), cm = new THREE.MeshPhongMaterial({ color: 0x111111 });

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), cm); body.position.y = 1.3;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), sm); head.position.y = 1.85;
        const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), cm); lLeg.position.set(-0.15, 0.4, 0);
        const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), cm); rLeg.position.set(0.15, 0.4, 0);

        this.mesh.add(body, head, lLeg, rLeg);
        this.rArm = new THREE.Group();
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.15), sm); arm.position.y = -0.3;
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), new THREE.MeshPhongMaterial({ color: 0x0 }));
        gun.position.set(0, -0.6, 0.2); this.rArm.add(arm, gun);
        this.rArm.position.set(0.35, 1.6, 0); this.mesh.add(this.rArm);

        scene.add(this.mesh); this.reset();
    }
    reset() {
        this.mesh.position.set((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 40 - 20);
        this.mesh.visible = true; this.hp = this.maxHp;
        if (this.isBoss) this.mesh.scale.set(5, 5, 5);
        if (!document.getElementById(`bar-wrapper-${this.id}`)) this.createHB();
        this.updateUI();
    }
    createHB() {
        const c = document.getElementById('bots-health-container'); if (!c) return;
        const d = document.createElement('div'); d.id = `bar-wrapper-${this.id}`;
        d.innerHTML = `<div class="health-bar bot-health"><div id="fill-${this.id}" class="health-fill" style="width:100%"></div></div>`;
        c.appendChild(d);
    }
    updateUI() {
        const f = document.getElementById(`fill-${this.id}`); if (f) f.style.width = (this.hp / this.maxHp) * 100 + '%';
    }
    update() {
        if (this.hp <= 0 || gameState !== 'PLAYING') { this.mesh.visible = false; return; }
        const d = this.mesh.position.distanceTo(camera.position);
        this.mesh.lookAt(camera.position.x, 0, camera.position.z);
        if (d > 8) this.mesh.position.addScaledVector(new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize(), STATS.BOT.SPEED);
        if (Date.now() - (this.lastShot || 0) > 1500) this.shoot();
    }
    shoot() {
        this.lastShot = Date.now();
        const hit = Math.random() < 0.6;
        if (hit) { playerHp -= 10; lastDamageTime = Date.now(); checkGameState(); }
    }
    die() {
        this.mesh.visible = false; const w = document.getElementById(`bar-wrapper-${this.id}`); if (w) w.remove();
        if (Math.random() < 0.5) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshPhongMaterial({ color: 0x00ff00 }));
            m.position.copy(this.mesh.position); scene.add(m); drops.push({ mesh: m, type: 'MED' });
        }
        checkGameState();
    }
}

// --- LOGICA ---
function checkGameState() {
    const f = document.getElementById('player-health-fill'); if (f) f.style.width = Math.max(0, playerHp) + '%';
    document.getElementById('ammo-count').innerText = currentMag;
    document.getElementById('total-ammo').innerText = reserveAmmo;
    document.getElementById('coin-count').innerText = coins;
    document.getElementById('phase-display').innerText = `FASE ${currentPhase}`;
    bots.forEach(b => b.updateUI());
    if (playerHp <= 0 && gameState === 'PLAYING') { gameState = 'GAMEOVER'; document.getElementById('game-over-overlay').classList.remove('hidden'); controls.unlock(); }
    if (bots.length > 0 && bots.every(b => b.hp <= 0) && gameState === 'PLAYING') { gameState = 'VICTORY'; coins += 50; document.getElementById('victory-overlay').classList.remove('hidden'); controls.unlock(); }
}

function handleShoot() {
    if (isReloading || gameState !== 'PLAYING' || currentMag <= 0) return;
    if (Date.now() - lastShotTime < (currentWeapon === 'RIFLE' ? 100 : 400)) return;
    lastShotTime = Date.now(); currentMag--; playSound('SHOOT');

    // Recoil Visual
    recoilGroup.rotation.x += 0.05;
    weaponProxy.position.z += 0.1;

    const r = new THREE.Raycaster(); r.set(camera.position, new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion));
    let target = null, dist = Infinity;
    bots.forEach(b => { if (b.hp > 0) { const h = r.intersectObject(b.mesh, true); if (h.length > 0 && h[0].distance < dist) { dist = h[0].distance; target = b; } } });
    if (target) { target.hp -= 20; if (target.hp <= 0) target.die(); }

    checkGameState(); if (currentMag === 0) reload();
}

function reload() {
    if (isReloading || reserveAmmo <= 0) return; isReloading = true;
    setTimeout(() => {
        const take = Math.min(20 - currentMag, reserveAmmo);
        currentMag += take; reserveAmmo -= take; isReloading = false; checkGameState();
    }, 1000);
}

function move() {
    if (!controls.isLocked) return;
    const mv = new THREE.Vector3(), f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    f.y = 0; r.y = 0; f.normalize(); r.normalize();
    if (keys['KeyW']) mv.add(f); if (keys['KeyS']) mv.sub(f); if (keys['KeyA']) mv.sub(r); if (keys['KeyD']) mv.add(r);
    if (mv.length() > 0) {
        mv.normalize().multiplyScalar(STATS.PLAYER.SPEED);
        const nextPos = camera.position.clone().add(mv);
        const pBox = new THREE.Box3().setFromCenterAndSize(nextPos, new THREE.Vector3(0.6, 2, 0.6));
        if (!obstacleBoxes.some(b => pBox.intersectsBox(b))) camera.position.copy(nextPos);
    }
    drops.forEach((d, i) => { if (camera.position.distanceTo(d.mesh.position) < 1.5) { playerHp = Math.min(100, playerHp + 40); scene.remove(d.mesh); drops.splice(i, 1); playSound('HEAL'); checkGameState(); } });
}

function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        move(); bots.forEach(b => b.update());
        if (isMouseDown && currentWeapon !== 'PISTOL') handleShoot();
        // Recuperação de Recoil
        recoilGroup.rotation.x *= 0.9;
        weaponProxy.position.z *= 0.9;
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
    gameState = 'PLAYING'; playerHp = 100; currentMag = 20;
    camera.position.set(0, 1.7, 12); controls.lock();
});

document.getElementById('retry-btn').addEventListener('click', () => location.reload());
document.getElementById('next-phase-btn').addEventListener('click', () => {
    currentPhase++; bots.forEach(b => { if (b.mesh) scene.remove(b.mesh); });
    bots = (currentPhase === 2) ? [new HumanoidBot(), new HumanoidBot()] : [new HumanoidBot(true)];
    document.getElementById('victory-overlay').classList.add('hidden');
    gameState = 'PLAYING'; playerHp = 100; camera.position.set(0, 1.7, 12); controls.lock();
});

// Start
generateMap(); bots = [new HumanoidBot()]; loop();
console.log("Arena Pronta.");
