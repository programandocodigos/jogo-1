import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D (V.2026) - MEME 67 & HUMANOID EDITION
 * Estabilidade Total | Movimento Fixo | Grama Restaurada
 */

// --- COMBAT STATS ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 20, SPEED: 0.16, MAG_SIZE: 20, TOTAL_RESERVE: 40 },
    BOT: { HP: 100, DAMAGE: 10, SPEED: 0.07, ACCURACY: 0.75, MAG_SIZE: 12, RELOAD_TIME: 2000, MAX_RANGE: 40 }
};

// --- AUDIO SYSTEM ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function makeDistortionCurve(amount) {
    const k = amount, n = 44100, curve = new Float32Array(n), deg = Math.PI / 180;
    for (let i = 0; i < n; ++i) {
        const x = i * 2 / n - 1;
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
}
const distortionCurve = makeDistortionCurve(400);
const mainCompressor = audioCtx.createDynamicsCompressor();
mainCompressor.connect(audioCtx.destination);

const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
const noiseOutput = noiseBuffer.getChannelData(0);
for (let i = 0; i < noiseBuffer.length; i++) noiseOutput[i] = Math.random() * 2 - 1;

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    if (type === 'SHOOT') {
        const g = audioCtx.createGain(), d = audioCtx.createWaveShaper(), f = audioCtx.createBiquadFilter();
        const weapon = currentWeapon || 'PISTOL';
        d.curve = distortionCurve; d.oversampling = '4x';
        f.connect(d); d.connect(g); g.connect(mainCompressor);
        const osc = audioCtx.createOscillator(); osc.connect(f);
        const noise = audioCtx.createBufferSource(); noise.buffer = noiseBuffer; noise.connect(d);
        if (weapon === 'SHOTGUN') {
            osc.frequency.setValueAtTime(100, now); g.gain.setValueAtTime(0.8, now);
            osc.start(); osc.stop(now + 0.4); noise.start(); noise.stop(now + 0.4);
        } else {
            osc.frequency.setValueAtTime(weapon === 'RIFLE' ? 180 : 220, now); g.gain.setValueAtTime(0.5, now);
            osc.start(); osc.stop(now + 0.2); noise.start(); noise.stop(now + 0.2);
        }
    } else if (type === 'STEP') {
        const o = audioCtx.createOscillator(), gl = audioCtx.createGain();
        o.connect(gl); gl.connect(audioCtx.destination);
        o.frequency.setValueAtTime(50, now); gl.gain.setValueAtTime(0.01, now);
        o.start(); o.stop(now + 0.1);
    } else if (type === 'HEAL') {
        const o = audioCtx.createOscillator(), gl = audioCtx.createGain();
        o.connect(gl); gl.connect(audioCtx.destination);
        o.frequency.setValueAtTime(800, now); o.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
        gl.gain.setValueAtTime(0.1, now); o.start(); o.stop(now + 0.3);
    }
}

// --- SYSTEM STATE ---
let gameState = 'START';
let currentPhase = 1;
let coins = 0;
let currentWeapon = 'PISTOL';
let playerHp = 100;
const PLAYER_MAX_HP = 100;
let botMaxHp = 100;
let currentMag = 20;
let reserveAmmo = 40;
let isReloading = false;
let isMouseDown = false;
let lastShotTime = 0;
let lastPlayerDamageTime = 0;
let obstacles = [];
let obstacleBoxes = [];
let solidObstacles = [];
let grassItems = [];
let drops = [];
let bots = [];
let footstepCooldown = 0;
const keys = {};

// --- THREE.JS SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
scene.fog = new THREE.FogExp2(0x020205, 0.015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const cameraRecoilGroup = new THREE.Group();
camera.add(cameraRecoilGroup);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.getElementById('game-container').appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);

// Lighting
const ambient = new THREE.HemisphereLight(0xffffff, 0x080820, 0.6);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff0ee, 1.0);
sun.position.set(20, 30, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

// Stars
const starCount = 2000, starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i++) starPos[i] = (Math.random() - 0.5) * 400;
const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.5 })));

// Weapon
const weaponProxy = new THREE.Group();
const createWeapon = () => {
    const m = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.1 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), m); b.position.z = -0.3;
    const g = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.15), m); g.position.set(0, -0.2, -0.1);
    weaponProxy.add(b, g); weaponProxy.position.set(0.35, -0.25, -0.4);
    cameraRecoilGroup.add(weaponProxy);
};
createWeapon();

// --- MAP GENERATION ---
let floor;
function generateMap() {
    obstacles.forEach(o => scene.remove(o)); obstacles = []; obstacleBoxes = []; solidObstacles = [];
    grassItems.forEach(g => scene.remove(g)); grassItems = [];
    drops.forEach(d => scene.remove(d.mesh)); drops = [];

    if (floor) scene.remove(floor);
    floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x052d05, roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

    const addObj = (obj, x, z) => {
        if (Math.sqrt(x * x + (z - 12) * (z - 12)) < 8) return;
        obj.position.set(x, 0, z); obj.castShadow = true; obj.receiveShadow = true;
        scene.add(obj); obstacles.push(obj); obstacleBoxes.push(new THREE.Box3().setFromObject(obj)); solidObstacles.push(obj);
    };

    // Paredes e Árvores
    for (let i = 0; i < 12; i++) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 1.5), new THREE.MeshStandardMaterial({ color: 0x444455 }));
        wall.position.y = 2; addObj(wall, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70);
    }
    for (let i = 0; i < 20; i++) {
        const tree = new THREE.Group(), t = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 5), new THREE.MeshStandardMaterial({ color: 0x2d1b1f }));
        t.position.y = 2.5; tree.add(t); const x = (Math.random() - 0.5) * 90, z = (Math.random() - 0.5) * 90;
        tree.position.set(x, 0, z); scene.add(tree); obstacles.push(t); obstacleBoxes.push(new THREE.Box3().setFromObject(t)); solidObstacles.push(t);
    }

    // Grama 3D
    const grassGeo = new THREE.BoxGeometry(0.05, 0.4, 0.05), grassMat = new THREE.MeshStandardMaterial({ color: 0x114411 });
    for (let i = 0; i < 400; i++) {
        const g = new THREE.Mesh(grassGeo, grassMat);
        g.position.set((Math.random() - 0.5) * 110, 0.2, (Math.random() - 0.5) * 110);
        scene.add(g); grassItems.push(g);
    }

    // Bordas
    const borderGeo = new THREE.BoxGeometry(120, 10, 2), borderMat = new THREE.MeshBasicMaterial({ visible: false });
    [{ x: 0, z: 60, ry: 0 }, { x: 0, z: -60, ry: 0 }, { x: 60, z: 0, ry: Math.PI / 2 }, { x: -60, z: 0, ry: Math.PI / 2 }].forEach(p => {
        const b = new THREE.Mesh(borderGeo, borderMat); b.position.set(p.x, 5, p.z); b.rotation.y = p.ry;
        scene.add(b); obstacleBoxes.push(new THREE.Box3().setFromObject(b));
    });
}

// --- BOT AI ---
class HumanoidBot {
    constructor(isBoss = false) {
        this.isBoss = isBoss; this.id = Math.random().toString(36).substr(2, 9);
        this.hp = botMaxHp; this.maxHp = botMaxHp;
        this.mesh = new THREE.Group();
        const sm = new THREE.MeshStandardMaterial({ color: 0xd2b48c }), cm = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), cm); torso.position.y = 1.35;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.35), sm); head.position.y = 1.9;
        this.mesh.add(torso, head);
        this.rArm = new THREE.Group(); const armM = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.6, 0.15), sm); armM.position.y = -0.3;
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.45), new THREE.MeshStandardMaterial({ color: 0x0 })); gun.position.set(0, -0.6, 0.2);
        this.rArm.add(armM, gun); this.rArm.position.set(0.35, 1.7, 0); this.mesh.add(this.rArm);
        scene.add(this.mesh); this.ray = new THREE.Raycaster(); this.reset();
    }
    reset() {
        this.mesh.position.set((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 20 - 10);
        this.mesh.visible = true; this.hp = this.maxHp;
        this.mesh.scale.set(this.isBoss ? 5 : 1, this.isBoss ? 5 : 1, this.isBoss ? 5 : 1);
        if (currentPhase === 2) this.mesh.children[0].material.color.set(0xff0000);
        if (!document.getElementById(`bar-wrapper-${this.id}`)) this.createHealthBar();
        this.updateUI();
    }
    createHealthBar() {
        const c = document.getElementById('bots-health-container');
        const d = document.createElement('div'); d.id = `bar-wrapper-${this.id}`;
        d.innerHTML = `<span style="font-size:0.7rem;">BOT ${this.isBoss ? 'BOSS' : 'ARENA'}</span><div class="health-bar bot-health"><div id="fill-${this.id}" class="health-fill" style="width: 100%"></div></div>`;
        c.appendChild(d);
    }
    updateUI() {
        const f = document.getElementById(`fill-${this.id}`); if (f) f.style.width = (this.hp / this.maxHp) * 100 + '%';
    }
    update() {
        if (this.hp <= 0 || gameState !== 'PLAYING') { this.mesh.visible = false; return; }
        const dist = this.mesh.position.distanceTo(camera.position), dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();
        this.ray.set(this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), dir);
        const hits = this.ray.intersectObjects(solidObstacles, true);
        const hasLoS = (hits.length === 0 || hits[0].distance > dist);
        if (hasLoS) {
            this.mesh.lookAt(camera.position.x, 0, camera.position.z); this.rArm.lookAt(camera.position); this.rArm.rotation.x += Math.PI / 2;
            if (dist > 8) this.mesh.position.addScaledVector(dir, STATS.BOT.SPEED);
            if (Date.now() - (this.lastShot || 0) > (currentPhase >= 2 ? 800 : 1200)) this.shoot();
        }
    }
    shoot() {
        this.lastShot = Date.now();
        let accLoss = 0;
        if (keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD']) accLoss += 0.15;
        if (Math.abs(camera.position.y - 1.7) > 0.1) accLoss += 0.2;
        const hit = Math.random() < (STATS.BOT.ACCURACY - accLoss);
        const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), hit ? camera.position : this.mesh.position.clone().addScaledVector(new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.5, 0)), 50)]), new THREE.LineBasicMaterial({ color: 0xffff00 }));
        scene.add(tracer); setTimeout(() => scene.remove(tracer), 40);
        if (hit) { playerHp -= 10; lastPlayerDamageTime = Date.now(); checkGameState(); document.body.style.boxShadow = "inset 0 0 50px #ff0000"; setTimeout(() => document.body.style.boxShadow = "none", 100); }
    }
    die() {
        this.mesh.visible = false; const w = document.getElementById(`bar-wrapper-${this.id}`); if (w) w.remove();
        if (Math.random() < 0.4) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x22c55e }));
            m.position.copy(this.mesh.position); scene.add(m); drops.push({ mesh: m, type: 'MEDKIT' });
        }
        checkGameState();
    }
}

// --- GAMEPLAY FUNCTIONS ---
function checkGameState() {
    const pf = document.getElementById('player-health-fill'); if (pf) pf.style.width = (playerHp / PLAYER_MAX_HP) * 100 + '%';
    document.getElementById('ammo-count').innerText = currentMag;
    document.getElementById('total-ammo').innerText = reserveAmmo;
    document.getElementById('coin-count').innerText = coins;
    document.getElementById('phase-display').innerText = `FASE ${currentPhase}`;
    bots.forEach(b => b.updateUI());
    if (playerHp <= 0 && gameState === 'PLAYING') { gameState = 'GAMEOVER'; document.getElementById('game-over-overlay').classList.remove('hidden'); controls.unlock(); }
    if (bots.length > 0 && bots.every(b => b.hp <= 0) && gameState === 'PLAYING') { gameState = 'VICTORY'; coins += 50; runVictorySequence(); }
}

function handleShoot() {
    if (isReloading || gameState !== 'PLAYING' || currentMag <= 0) return;
    const rate = currentWeapon === 'RIFLE' ? 100 : (currentWeapon === 'SHOTGUN' ? 800 : 400);
    if (Date.now() - lastShotTime < rate) return;
    lastShotTime = Date.now(); currentMag--; weaponProxy.position.z += 0.3; playSound('SHOOT');

    // Recoil
    const amt = currentWeapon === 'RIFLE' ? 0.03 : 0.08;
    cameraRecoilGroup.rotation.x += amt; cameraRecoilX += amt;
    if (currentWeapon === 'RIFLE') { cameraRecoilGroup.rotation.z -= 0.06; cameraRecoilZ -= 0.06; }

    const ray = new THREE.Raycaster(); ray.set(camera.position, new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion));
    let hitBot = null, bestD = Infinity, hp = null;
    bots.forEach(b => { if (b.hp > 0) { const h = ray.intersectObject(b.mesh, true); if (h.length > 0 && h[0].distance < bestD) { bestD = h[0].distance; hitBot = b; hp = h[0].point; } } });
    const hObs = ray.intersectObjects(obstacles, true); const obsD = hObs.length > 0 ? hObs[0].distance : Infinity;

    if (hitBot && bestD < obsD) { hitBot.hp -= currentWeapon === 'RIFLE' ? 15 : 20; if (hitBot.hp <= 0) hitBot.die(); showHitMarker(); }
    else if (hObs.length > 0) hp = hObs[0].point;

    const v = new THREE.Vector3(); weaponProxy.getWorldPosition(v);
    const tr = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v, hp || camera.position.clone().add(new THREE.Vector3(0, 0, -50).applyQuaternion(camera.quaternion))]), new THREE.LineBasicMaterial({ color: 0xffff00 }));
    scene.add(tr); setTimeout(() => scene.remove(tr), 30);
    checkGameState(); if (currentMag === 0) handleReload();
}

function showHitMarker() {
    const c = document.getElementById('crosshair'); c.style.borderColor = '#ff0000';
    setTimeout(() => c.style.borderColor = 'rgba(255, 255, 255, 0.8)', 100);
}

function handleReload() {
    if (isReloading || reserveAmmo <= 0) return; isReloading = true;
    setTimeout(() => {
        const needed = (currentWeapon === 'RIFLE' ? 30 : 20) - currentMag;
        const take = Math.min(needed, reserveAmmo); reserveAmmo -= take; currentMag += take; isReloading = false; checkGameState();
    }, 1500);
}

function runVictorySequence() {
    document.getElementById('victory-overlay').classList.remove('hidden'); controls.unlock();
}

function resetArenaState() {
    gameState = 'PLAYING'; playerHp = 100; currentMag = 20; reserveAmmo = 60;
    camera.position.set(0, 1.7, 12); camera.lookAt(0, 1.7, 0); camera.rotation.set(0, 0, 0); cameraRecoilGroup.rotation.set(0, 0, 0);
    generateMap(); bots.forEach(b => b.reset()); checkGameState();
}

// --- INPUT & LOOP ---
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', e => { if (e.button === 0) { isMouseDown = true; if (currentWeapon === 'PISTOL') handleShoot(); } });
window.addEventListener('mouseup', () => isMouseDown = false);

function move() {
    if (!controls.isLocked) return;
    const mv = new THREE.Vector3(), f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    f.y = 0; r.y = 0; f.normalize(); r.normalize();
    if (keys['KeyW']) mv.add(f); if (keys['KeyS']) mv.sub(f); if (keys['KeyA']) mv.sub(r); if (keys['KeyD']) mv.add(r);
    if (mv.length() > 0) {
        mv.normalize().multiplyScalar(STATS.PLAYER.SPEED);
        const col = (p) => obstacleBoxes.some(b => new THREE.Box3().setFromCenterAndSize(p, new THREE.Vector3(0.8, 2, 0.8)).intersectsBox(b));
        const nX = camera.position.clone(); nX.x += mv.x; if (!col(nX)) camera.position.x = nX.x;
        const nZ = camera.position.clone(); nZ.z += mv.z; if (!col(nZ)) camera.position.z = nZ.z;
    }
    drops.forEach((d, i) => { if (camera.position.distanceTo(d.mesh.position) < 1.5) { playerHp = Math.min(100, playerHp + 40); scene.remove(d.mesh); drops.splice(i, 1); playSound('HEAL'); checkGameState(); } });
}

function loop() {
    requestAnimationFrame(loop); if (gameState !== 'PLAYING') { renderer.render(scene, camera); return; }
    move(); bots.forEach(b => b.update()); if (isMouseDown && currentWeapon !== 'PISTOL') handleShoot();
    weaponProxy.position.z += (-0.4 - weaponProxy.position.z) * 0.1;
    if (Math.abs(cameraRecoilX) > 0.001) { const rev = cameraRecoilX * 0.1; cameraRecoilGroup.rotation.x -= rev; cameraRecoilX -= rev; } else { cameraRecoilGroup.rotation.x = 0; }
    if (Math.abs(cameraRecoilZ) > 0.001) { const rev = cameraRecoilZ * 0.1; cameraRecoilGroup.rotation.z -= rev; cameraRecoilZ -= rev; } else { cameraRecoilGroup.rotation.z = 0; }
    renderer.render(scene, camera);
}

document.getElementById('start-btn').addEventListener('click', () => { document.getElementById('start-overlay').classList.add('hidden'); resetArenaState(); controls.lock(); });
document.getElementById('retry-btn').addEventListener('click', () => { document.getElementById('game-over-overlay').classList.add('hidden'); resetArenaState(); controls.lock(); });
document.getElementById('next-phase-btn').addEventListener('click', () => {
    currentPhase++; document.getElementById('victory-overlay').classList.add('hidden');
    bots.forEach(b => { scene.remove(b.mesh); const w = document.getElementById(`bar-wrapper-${b.id}`); if (w) w.remove(); });
    bots = [];
    if (currentPhase === 2) { bots.push(new HumanoidBot(), new HumanoidBot()); }
    else if (currentPhase >= 3) { bots.push(new HumanoidBot(true)); }
    resetArenaState(); controls.lock();
});
document.getElementById('reset-btn').addEventListener('click', () => location.reload());

// Init
generateMap(); bots = [new HumanoidBot()]; loop();
console.log("Arena Pronta!");
