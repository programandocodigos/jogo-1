import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D (V.2026) - MEME 67 & HUMANOID EDITION
 * Balance: Player 20 Dmg | Bot 10 Dmg | Dist <= 10m | No walls shooting
 */

// --- COMBAT STATS ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 20, SPEED: 0.16, MAG_SIZE: 20, TOTAL_RESERVE: 40 },
    BOT: { HP: 100, DAMAGE: 10, SPEED: 0.07, ACCURACY: 0.75, MAG_SIZE: 12, RELOAD_TIME: 2000, MAX_RANGE: 40 }
};

// --- AUDIO SYSTEM (Procedural Sounds V2.0) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
        const x = i * 2 / n_samples - 1;
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
}
const distortionCurve = makeDistortionCurve(400);

const mainCompressor = audioCtx.createDynamicsCompressor();
mainCompressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
mainCompressor.knee.setValueAtTime(30, audioCtx.currentTime);
mainCompressor.ratio.setValueAtTime(12, audioCtx.currentTime);
mainCompressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
mainCompressor.release.setValueAtTime(0.25, audioCtx.currentTime);
mainCompressor.connect(audioCtx.destination);

const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
const noiseOutput = noiseBuffer.getChannelData(0);
for (let i = 0; i < noiseBuffer.length; i++) noiseOutput[i] = Math.random() * 2 - 1;

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (type === 'SHOOT') {
        const weapon = currentWeapon || 'PISTOL';
        const now = audioCtx.currentTime;
        const gainNode = audioCtx.createGain();
        const distNode = audioCtx.createWaveShaper();
        const filterNode = audioCtx.createBiquadFilter();
        distNode.curve = distortionCurve;
        distNode.oversampling = '4x';
        filterNode.connect(distNode);
        distNode.connect(gainNode);
        gainNode.connect(mainCompressor);
        const noise = audioCtx.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noise.connect(noiseFilter);
        noiseFilter.connect(distNode);
        const osc = audioCtx.createOscillator();
        osc.connect(filterNode);
        if (weapon === 'SHOTGUN') {
            filterNode.type = 'lowpass'; filterNode.frequency.setValueAtTime(1000, now);
            osc.frequency.setValueAtTime(100, now); osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.3);
            noiseFilter.frequency.setValueAtTime(2000, now); noiseFilter.frequency.exponentialRampToValueAtTime(100, now + 0.2);
            gainNode.gain.setValueAtTime(0.8, now); gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
            osc.start(now); osc.stop(now + 0.4); noise.start(now); noise.stop(now + 0.4);
        } else if (weapon === 'RIFLE') {
            filterNode.type = 'bandpass'; filterNode.frequency.setValueAtTime(800, now);
            osc.type = 'sawtooth'; osc.frequency.setValueAtTime(180, now); osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.12);
            noiseFilter.frequency.setValueAtTime(4000, now);
            gainNode.gain.setValueAtTime(0.4, now); gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.start(now); osc.stop(now + 0.15); noise.start(now); noise.stop(now + 0.15);
        } else {
            filterNode.type = 'lowpass'; filterNode.frequency.setValueAtTime(1500, now);
            osc.frequency.setValueAtTime(220, now); osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.15);
            noiseFilter.frequency.setValueAtTime(3000, now);
            gainNode.gain.setValueAtTime(0.5, now); gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
            osc.start(now); osc.stop(now + 0.2); noise.start(now); noise.stop(now + 0.2);
        }
    } else if (type === 'STEP') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(50, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.02, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'RELOAD') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'triangle'; osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.start(); osc.stop(audioCtx.currentTime + 0.5);
    } else if (type === 'HEAL') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
        osc.start(); osc.stop(audioCtx.currentTime + 0.3);
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
let drops = [];
let playerActor = null;
let bots = [];
let footstepCooldown = 0;
const keys = {};

// --- THREE.JS SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
scene.fog = new THREE.FogExp2(0x020205, 0.015);

function createStarfield() {
    const starGeo = new THREE.BufferGeometry();
    const starCount = 2000;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) pos[i] = (Math.random() - 0.5) * 400;
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.8 });
    scene.add(new THREE.Points(starGeo, starMat));
}
createStarfield();

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

// --- LIGHTING ---
const ambient = new THREE.HemisphereLight(0xffffff, 0x080820, 0.6);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff0ee, 1.0);
sun.position.set(20, 30, 10);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048; sun.shadow.mapSize.height = 2048;
scene.add(sun);

// --- PLAYER WEAPON ---
const weaponProxy = new THREE.Group();
const createWeapon = () => {
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.1 });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), gunMat); barrel.position.z = -0.3;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), gunMat); cyl.rotation.x = Math.PI / 2; cyl.position.z = -0.15;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.15), new THREE.MeshStandardMaterial({ color: 0x221100 })); grip.position.set(0, -0.2, -0.1); grip.rotation.x = 0.2;
    weaponProxy.add(barrel, cyl, grip); weaponProxy.position.set(0.35, -0.25, -0.4);
    cameraRecoilGroup.add(weaponProxy);
};
createWeapon();

// --- MAP GENERATION ---
let floor;
function generateMap() {
    obstacles.forEach(o => scene.remove(o)); obstacles = []; obstacleBoxes = []; solidObstacles = [];
    drops.forEach(d => scene.remove(d.mesh)); drops = [];

    if (floor) scene.remove(floor);
    floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x0a0a15, roughness: 0.9, metalness: 0.1 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

    const addObj = (obj, x, z) => {
        if (Math.sqrt(x * x + (z - 12) * (z - 12)) < 8 || (Math.abs(x) < 3 && Math.abs(z) < 3)) return;
        obj.position.set(x, 0, z); obj.castShadow = true; obj.receiveShadow = true;
        scene.add(obj); obstacles.push(obj); obstacleBoxes.push(new THREE.Box3().setFromObject(obj)); solidObstacles.push(obj);
    };

    for (let i = 0; i < 10; i++) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 2), new THREE.MeshStandardMaterial({ color: 0x444455 }));
        wall.position.y = 2; addObj(wall, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50);
    }
    for (let i = 0; i < 15; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 5, 8), new THREE.MeshStandardMaterial({ color: 0x2d1b1f })); trunk.position.y = 2.5;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2, 4, 8), new THREE.MeshStandardMaterial({ color: 0x052d05 })); leaves.position.y = 5;
        tree.add(trunk, leaves); const x = (Math.random() - 0.5) * 70, z = (Math.random() - 0.5) * 70;
        tree.position.set(x, 0, z); scene.add(tree); obstacles.push(trunk); obstacleBoxes.push(new THREE.Box3().setFromObject(trunk)); solidObstacles.push(trunk);
    }

    const wallSize = 120, borderGeo = new THREE.BoxGeometry(wallSize, 10, 2), borderMat = new THREE.MeshBasicMaterial({ visible: false });
    [{ x: 0, z: wallSize / 2, ry: 0 }, { x: 0, z: -wallSize / 2, ry: 0 }, { x: wallSize / 2, z: 0, ry: Math.PI / 2 }, { x: -wallSize / 2, z: 0, ry: Math.PI / 2 }].forEach(p => {
        const b = new THREE.Mesh(borderGeo, borderMat); b.position.set(p.x, 5, p.z); b.rotation.y = p.ry;
        scene.add(b); obstacleBoxes.push(new THREE.Box3().setFromObject(b));
    });

    for (let i = 0; i < 300; i++) {
        const grass = new THREE.Mesh(new THREE.BoxGeometry(0.05, Math.random() * 0.4, 0.05), new THREE.MeshStandardMaterial({ color: 0x114411 }));
        grass.position.set((Math.random() - 0.5) * 110, 0.1, (Math.random() - 0.5) * 110); scene.add(grass);
    }
}

// --- HUMANOID BOT AI ---
class HumanoidBot {
    constructor(isBoss = false) {
        this.isBoss = isBoss; this.id = Math.random().toString(36).substr(2, 9);
        this.hp = botMaxHp; this.maxHp = botMaxHp; this.mesh = new THREE.Group();
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c }), clothesMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.35), skinMat); head.position.y = 1.9;
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), clothesMat); torso.position.y = 1.35;
        const armGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
        this.lArm = new THREE.Mesh(armGeo, skinMat); this.lArm.position.set(-0.35, 1.4, 0);
        this.rArm = new THREE.Group(); const rArmMesh = new THREE.Mesh(armGeo, skinMat); rArmMesh.position.y = -0.3; this.rArm.add(rArmMesh);
        this.rArm.position.set(0.35, 1.7, 0);
        const botGun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.45), new THREE.MeshStandardMaterial({ color: 0x000000 }));
        botGun.position.set(0, -0.6, 0.25); this.rArm.add(botGun);
        const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), clothesMat); lLeg.position.set(-0.15, 0.5, 0);
        const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), clothesMat); rLeg.position.set(0.15, 0.5, 0);
        this.mesh.add(head, torso, this.lArm, this.rArm, lLeg, rLeg);
        this.mesh.traverse(n => { if (n.isMesh) n.castShadow = true; }); scene.add(this.mesh);
        this.ray = new THREE.Raycaster(); this.reset();
    }

    reset() {
        this.mesh.position.set((Math.random() - 0.5) * 40, 0, -20); this.mesh.visible = true; this.hp = botMaxHp;
        const clothesMat = this.mesh.children[1].material;
        if (currentPhase === 2) { clothesMat.color.set(0xff0000); this.mesh.scale.set(1.2, 1.2, 1.2); }
        else if (this.isBoss) { this.mesh.scale.set(5, 5, 5); this.mesh.children[0].material.color.set(0x000000); this.hp = 1000; this.maxHp = 1000; }
        else { clothesMat.color.set(0x111111); }
        if (!document.getElementById(`bar-wrapper-${this.id}`)) this.createHealthBar();
    }

    createHealthBar() {
        const container = document.getElementById('bots-health-container');
        const barWrapper = document.createElement('div'); barWrapper.id = `bar-wrapper-${this.id}`;
        barWrapper.innerHTML = `
            <span style="font-size:0.7rem; color:var(--primary)">BOT ${this.isBoss ? 'BOSS' : 'ARENA'}</span>
            <div class="health-bar bot-health"><div id="fill-${this.id}" class="health-fill" style="width: 100%"></div></div>
        `;
        container.appendChild(barWrapper);
    }

    updateUI() {
        const fill = document.getElementById(`fill-${this.id}`);
        if (fill) fill.style.width = (this.hp / this.maxHp) * 100 + '%';
    }

    update() {
        if (gameState !== 'PLAYING' || this.hp <= 0) { this.mesh.visible = false; return; }
        const dist = this.mesh.position.distanceTo(camera.position), dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();
        this.ray.set(this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), dir);
        const hits = this.ray.intersectObjects(solidObstacles, true);
        const hasLoS = (hits.length === 0 || hits[0].distance > dist);

        if (this.hp < (this.maxHp * 0.3)) {
            let nearestObs = null, minDist = Infinity;
            obstacles.forEach(obs => { const d = this.mesh.position.distanceTo(obs.position); if (d < minDist) { minDist = d; nearestObs = obs; } });
            if (nearestObs) {
                const targetHidePos = nearestObs.position.clone().addScaledVector(new THREE.Vector3().subVectors(nearestObs.position, camera.position).normalize(), 1.5);
                if (this.mesh.position.distanceTo(targetHidePos) > 0.5) {
                    this.moveBot(new THREE.Vector3().subVectors(targetHidePos, this.mesh.position).normalize(), STATS.BOT.SPEED * 1.2);
                    this.mesh.lookAt(targetHidePos.x, 0, targetHidePos.z);
                }
            }
            if (!hasLoS) this.hp = Math.min(this.maxHp, this.hp + 0.05);
        } else if (hasLoS) {
            this.mesh.lookAt(camera.position.x, 0, camera.position.z); this.rArm.lookAt(camera.position); this.rArm.rotation.x += Math.PI / 2;
            if (dist > 7) this.moveBot(dir, STATS.BOT.SPEED); else if (dist < 4) this.moveBot(dir.clone().negate(), STATS.BOT.SPEED * 0.8);
            if (!this.strafeTime || Date.now() > this.strafeTime) { this.strafeDir = Math.random() < 0.5 ? 1 : -1; this.strafeTime = Date.now() + 500 + Math.random() * 1000; }
            this.moveBot(new THREE.Vector3(-dir.z, 0, dir.x), STATS.BOT.SPEED * 0.7 * this.strafeDir);
            const botFireRate = currentPhase >= 2 ? 800 : 1200;
            if (!this.reloading && dist <= STATS.BOT.MAX_RANGE && Date.now() - (this.lastShot || 0) > botFireRate) this.shoot();
        } else {
            this.moveBot(new THREE.Vector3(-dir.z, 0, dir.x), STATS.BOT.SPEED * 0.5); this.mesh.lookAt(camera.position.x, 0, camera.position.z);
        }
        this.mesh.position.y = Math.sin(Date.now() * 0.005) * 0.05;
    }

    moveBot(direction, speed) {
        bots.forEach(other => { if (other !== this && other.hp > 0 && this.mesh.position.distanceTo(other.mesh.position) < 2) direction.addScaledVector(new THREE.Vector3().subVectors(this.mesh.position, other.mesh.position).normalize(), 0.5); });
        const nextPos = this.mesh.position.clone().addScaledVector(direction, speed), botBox = new THREE.Box3().setFromCenterAndSize(nextPos, new THREE.Vector3(1, 2, 1));
        if (!obstacleBoxes.some(box => botBox.intersectsBox(box))) this.mesh.position.copy(nextPos);
    }

    shoot() {
        if ((this.ammo || 10) <= 0) { this.reloading = true; setTimeout(() => { this.ammo = 10; this.reloading = false; }, STATS.BOT.RELOAD_TIME); return; }
        this.ammo = (this.ammo || 10) - 1; this.lastShot = Date.now();

        // PRECISÃO DINÂMICA: Bot erra mais se jogador corre ou pula
        let moveIntensity = 0;
        if (keys['KeyW'] || keys['KeyS'] || keys['KeyA'] || keys['KeyD']) moveIntensity += 0.15;
        if (camera.position.y > 1.8) moveIntensity += 0.25; // Simula pulo
        const currentAcc = Math.max(0.1, (currentPhase >= 2 ? 0.8 : 0.75) - moveIntensity);

        const hit = Math.random() < currentAcc;
        const tracerGeo = new THREE.BufferGeometry().setFromPoints([
            this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
            hit ? camera.position.clone().add(new THREE.Vector3(0, -0.5, 0)) : this.mesh.position.clone().addScaledVector(new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2, 0)), 50)
        ]);
        const tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8 }));
        scene.add(tracer); setTimeout(() => scene.remove(tracer), 40);
        if (hit) {
            playerHp -= STATS.BOT.DAMAGE; lastPlayerDamageTime = Date.now(); checkGameState();
            document.body.style.boxShadow = "inset 0 0 50px #ff0000"; setTimeout(() => document.body.style.boxShadow = "none", 100);
        }
    }

    die() {
        this.mesh.visible = false;
        const wrapper = document.getElementById(`bar-wrapper-${this.id}`); if (wrapper) wrapper.remove();

        // DROP DE VIDA (Chance de 40%)
        if (Math.random() < 0.4) {
            const kitGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4), kitMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x22c55e, emissiveIntensity: 0.5 });
            const kit = new THREE.Mesh(kitGeo, kitMat); kit.position.copy(this.mesh.position).add(new THREE.Vector3(0, 0.2, 0));
            scene.add(kit); drops.push({ mesh: kit, type: 'MEDKIT' });
        }
        checkGameState();
    }
}

let isPaused = false, cameraRecoilX = 0, cameraRecoilZ = 0;

function checkGameState() {
    const playerPercent = (playerHp / PLAYER_MAX_HP) * 100;
    const playerFill = document.getElementById('player-health-fill'); if (playerFill) playerFill.style.width = playerPercent + '%';
    document.getElementById('ammo-count').innerText = currentMag;
    document.getElementById('total-ammo').innerText = reserveAmmo;
    document.getElementById('coin-count').innerText = coins;
    document.getElementById('phase-display').innerText = `FASE ${currentPhase}`;
    bots.forEach(b => b.updateUI());
    if (playerHp <= 0 && gameState === 'PLAYING') {
        gameState = 'GAMEOVER'; document.getElementById('game-over-overlay').classList.remove('hidden'); controls.unlock();
    }
    if (bots.length > 0 && bots.filter(b => b.hp > 0).length === 0 && gameState === 'PLAYING') {
        gameState = 'VICTORY'; coins += 50; document.getElementById('coin-count').innerText = coins; runVictorySequence();
    }
}

function handleShoot() {
    if (isReloading || gameState !== 'PLAYING' || currentMag <= 0) return;
    let fireRate = currentWeapon === 'RIFLE' ? 100 : (currentWeapon === 'SHOTGUN' ? 800 : 400);
    if (Date.now() - lastShotTime < fireRate) return;
    lastShotTime = Date.now(); currentMag--; weaponProxy.position.z += 0.3; playSound('SHOOT');
    const flash = new THREE.PointLight(0xffcc00, 10, 10); flash.position.copy(camera.position).add(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).multiplyScalar(1));
    scene.add(flash); setTimeout(() => scene.remove(flash), 40);
    const recoilAmount = currentWeapon === 'RIFLE' ? 0.03 : (currentWeapon === 'SHOTGUN' ? 0.1 : 0.04);
    cameraRecoilGroup.rotation.x += recoilAmount; cameraRecoilX += recoilAmount;
    if (currentWeapon === 'RIFLE') { cameraRecoilGroup.rotation.z -= 0.06; cameraRecoilZ -= 0.06; weaponProxy.rotation.z += 0.1; }
    cameraRecoilGroup.position.y += (recoilAmount * 0.4); setTimeout(() => { cameraRecoilGroup.position.y -= (recoilAmount * 0.4); }, 50);

    let hitSomething = false; const pellets = currentWeapon === 'SHOTGUN' ? 6 : 1;
    for (let i = 0; i < pellets; i++) {
        const ray = new THREE.Raycaster(), dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        if (currentWeapon === 'SHOTGUN') { dir.x += (Math.random() - 0.5) * 0.08; dir.y += (Math.random() - 0.5) * 0.08; dir.normalize(); }
        ray.set(camera.position, dir); let targetBot = null, bestBotDist = Infinity, hitPoint = null;
        bots.forEach(b => {
            if (b.hp <= 0) return; const hits = ray.intersectObject(b.mesh, true);
            if (hits.length > 0 && hits[0].distance < bestBotDist) { bestBotDist = hits[0].distance; targetBot = b; hitPoint = hits[0].point; }
        });
        const hitsObs = ray.intersectObjects(obstacles, true), obsDist = hitsObs.length > 0 ? hitsObs[0].distance : Infinity;
        let dmg = currentWeapon === 'RIFLE' ? 15 : (currentWeapon === 'SHOTGUN' ? 8 : 20);
        if (targetBot && bestBotDist < obsDist) { targetBot.hp -= dmg; if (targetBot.hp <= 0) targetBot.die(); hitSomething = true; }
        else if (hitsObs.length > 0) { hitPoint = hitsObs[0].point; }
        const v = new THREE.Vector3(); weaponProxy.getWorldPosition(v);
        const tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([v, hitPoint || camera.position.clone().add(dir.multiplyScalar(50))]), new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8 }));
        scene.add(tracer); setTimeout(() => scene.remove(tracer), 30);
        if (hitPoint) { const spark = new THREE.Mesh(new THREE.SphereGeometry(0.04), new THREE.MeshBasicMaterial({ color: 0xffffff })); spark.position.copy(hitPoint); scene.add(spark); setTimeout(() => scene.remove(spark), 100); }
    }
    checkGameState(); if (hitSomething) showHitMarker(); if (currentMag === 0) handleReload();
}

function showHitMarker() {
    const c = document.getElementById('crosshair'); c.style.borderColor = '#ff0000'; c.style.transform = 'translate(-50%, -50%) scale(1.5)';
    setTimeout(() => { c.style.borderColor = 'rgba(255, 255, 255, 0.8)'; c.style.transform = 'translate(-50%, -50%) scale(1)'; }, 100);
}

function handleReload() {
    if (isReloading || reserveAmmo <= 0) return;
    isReloading = true; const initialY = weaponProxy.position.y;
    const reloadLoop = () => {
        weaponProxy.position.y -= 0.05; if (weaponProxy.position.y > -1.5) requestAnimationFrame(reloadLoop);
        else {
            setTimeout(() => {
                const magSize = currentWeapon === 'RIFLE' ? 30 : (currentWeapon === 'SHOTGUN' ? 12 : 20);
                const toReload = Math.min(magSize - currentMag, reserveAmmo);
                reserveAmmo -= toReload; currentMag += toReload; weaponProxy.position.y = initialY; isReloading = false; checkGameState(); playSound('RELOAD');
            }, 1000);
        }
    };
    reloadLoop();
}

function runVictorySequence() {
    document.getElementById('victory-overlay').classList.remove('hidden'); const audio = document.getElementById('victory-audio');
    audio.currentTime = 0; audio.play().catch(() => { }); controls.unlock(); if (playerActor) scene.remove(playerActor);
    const aliveBot = bots.find(b => b.hp > 0); playerActor = (aliveBot ? aliveBot.mesh : bots[0].mesh).clone();
    playerActor.visible = true; playerActor.position.set(0, 0, 0); scene.add(playerActor); bots.forEach(b => b.mesh.visible = false);
    const victoryAnim = () => {
        if (gameState !== 'VICTORY') return;
        camera.position.lerp(new THREE.Vector3(0, 4, 8), 0.05); camera.lookAt(0, 2, 0);
        playerActor.position.y = Math.abs(Math.sin(Date.now() * 0.016)) * 0.5; playerActor.rotation.y += 0.04; renderer.render(scene, camera);
        requestAnimationFrame(victoryAnim);
    };
    victoryAnim();
}

function resetArenaState() {
    gameState = 'PLAYING'; playerHp = 100;
    const magSize = currentWeapon === 'RIFLE' ? 30 : (currentWeapon === 'SHOTGUN' ? 12 : 20);
    currentMag = magSize; reserveAmmo = magSize * 2;
    camera.position.set(0, 1.7, 12); camera.lookAt(0, 1.7, 0); camera.rotation.set(0, 0, 0); cameraRecoilGroup.rotation.set(0, 0, 0);
    bots.forEach(b => { b.hp = b.maxHp; b.mesh.visible = true; if (!document.getElementById(`bar-wrapper-${b.id}`)) b.createHealthBar(); b.updateUI(); });
    drops.forEach(d => scene.remove(d.mesh)); drops = [];
    checkGameState();
}

window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', e => { if (e.button === 0) { isMouseDown = true; if (currentWeapon === 'PISTOL') handleShoot(); } });
window.addEventListener('mouseup', () => isMouseDown = false);

function autoFire() {
    if (isMouseDown && currentWeapon !== 'PISTOL' && gameState === 'PLAYING') handleShoot();
    if (currentMag === 0 && !isReloading && reserveAmmo > 0 && gameState === 'PLAYING') handleReload();
}

function nextPhase() {
    currentPhase++; document.getElementById('victory-overlay').classList.add('hidden');
    if (playerActor) { scene.remove(playerActor); playerActor = null; }
    generateMap(); bots.forEach(b => { scene.remove(b.mesh); const w = document.getElementById(`bar-wrapper-${b.id}`); if (w) w.remove(); });
    bots = [];
    if (currentPhase === 2) { botMaxHp = 150; bots.push(new HumanoidBot(), new HumanoidBot()); }
    else if (currentPhase >= 3) { botMaxHp = 1000; bots.push(new HumanoidBot(true)); }
    resetArenaState(); controls.lock();
}

function buyRifle() { if (coins >= 50 && currentWeapon !== 'RIFLE') { coins -= 50; currentWeapon = 'RIFLE'; weaponProxy.children[0].scale.set(1, 1, 2); weaponProxy.children[0].position.z = -0.6; checkGameState(); updateShopButtons(); } }
function buyShotgun() { if (coins >= 80 && currentWeapon !== 'SHOTGUN') { coins -= 80; currentWeapon = 'SHOTGUN'; weaponProxy.children[0].scale.set(2.5, 1.2, 1); weaponProxy.children[0].position.z = -0.3; checkGameState(); updateShopButtons(); } }
function buyPistol() { currentWeapon = 'PISTOL'; weaponProxy.children[0].scale.set(1, 1, 1); weaponProxy.children[0].position.z = -0.3; updateShopButtons(); }
function buyMedkit() { if (coins >= 30 && playerHp < PLAYER_MAX_HP) { coins -= 30; playerHp = Math.min(PLAYER_MAX_HP, playerHp + 50); checkGameState(); playSound('HEAL'); } }
function updateShopButtons() {
    document.getElementById('buy-rifle').innerText = currentWeapon === 'RIFLE' ? "EQUIPADO" : "RIFLE (50)";
    document.getElementById('buy-shotgun').innerText = currentWeapon === 'SHOTGUN' ? "EQUIPADO" : "SHOTGUN (80)";
    document.getElementById('buy-pistol').innerText = currentWeapon === 'PISTOL' ? "EQUIPADO" : "PISTOLA (0)";
}

function move() {
    if (!controls.isLocked) return;
    const mv = new THREE.Vector3(), f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion), r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    f.y = 0; r.y = 0; f.normalize(); r.normalize();
    if (keys['KeyW']) mv.add(f); if (keys['KeyS']) mv.sub(f); if (keys['KeyA']) mv.sub(r); if (keys['KeyD']) mv.add(r);
    if (mv.length() > 0) {
        mv.normalize().multiplyScalar(STATS.PLAYER.SPEED);
        if (Date.now() > footstepCooldown) { playSound('STEP'); camera.position.y += Math.sin(Date.now() * 0.01) * 0.05; footstepCooldown = Date.now() + 350; }
        const nX = camera.position.clone(); nX.x += mv.x; if (!obstacleBoxes.some(b => new THREE.Box3().setFromCenterAndSize(nX, new THREE.Vector3(0.8, 2, 0.8)).intersectsBox(b))) camera.position.x = nX.x;
        const nZ = camera.position.clone(); nZ.z += mv.z; if (!obstacleBoxes.some(b => new THREE.Box3().setFromCenterAndSize(nZ, new THREE.Vector3(0.8, 2, 0.8)).intersectsBox(b))) camera.position.z = nZ.z;
    }
    // COLISÃO COM DROPS
    drops.forEach((d, i) => {
        if (camera.position.distanceTo(d.mesh.position) < 1.5) {
            if (d.type === 'MEDKIT') { playerHp = Math.min(PLAYER_MAX_HP, playerHp + 40); playSound('HEAL'); }
            scene.remove(d.mesh); drops.splice(i, 1); checkGameState();
        }
    });
}

function loop() {
    requestAnimationFrame(loop); if (isPaused) return;
    if (gameState === 'PLAYING') {
        move(); bots.forEach(b => b.update()); autoFire();
        if (playerHp < PLAYER_MAX_HP && Date.now() - lastPlayerDamageTime > 5000) { playerHp = Math.min(PLAYER_MAX_HP, playerHp + 0.08); checkGameState(); }
        ambient.intensity = playerHp < 30 ? 0.6 + Math.abs(Math.sin(Date.now() * 0.005)) * 0.5 : 0.6;
        ambient.color.setHex(playerHp < 30 ? 0xff0000 : 0xffffff);
        weaponProxy.position.z += (-0.4 - weaponProxy.position.z) * 0.1; weaponProxy.rotation.z += (0 - weaponProxy.rotation.z) * 0.1;
        if (Math.abs(cameraRecoilZ) > 0.001) { const rev = cameraRecoilZ * 0.15; cameraRecoilGroup.rotation.z -= rev; cameraRecoilZ -= rev; } else { cameraRecoilGroup.rotation.z = 0; }
        if (Math.abs(cameraRecoilX) > 0.001) { const rev = cameraRecoilX * 0.15; cameraRecoilGroup.rotation.x -= rev; cameraRecoilX -= rev; } else { cameraRecoilGroup.rotation.x = 0; }
        renderer.render(scene, camera);
    } else { renderer.render(scene, camera); }
}

document.getElementById('start-btn').addEventListener('click', () => { document.getElementById('start-overlay').classList.add('hidden'); resetArenaState(); loop(); });
document.getElementById('next-phase-btn').addEventListener('click', nextPhase);
document.getElementById('shop-btn-vic').addEventListener('click', () => { document.getElementById('shop-overlay').classList.remove('hidden'); controls.unlock(); });
document.getElementById('close-shop').addEventListener('click', () => document.getElementById('shop-overlay').classList.add('hidden'));
document.getElementById('buy-rifle').addEventListener('click', buyRifle);
document.getElementById('buy-shotgun').addEventListener('click', buyShotgun);
document.getElementById('buy-pistol').addEventListener('click', buyPistol);
document.getElementById('buy-medkit').addEventListener('click', buyMedkit);
document.getElementById('retry-btn').addEventListener('click', () => { document.getElementById('game-over-overlay').classList.add('hidden'); resetArenaState(); controls.lock(); });
document.getElementById('reset-btn').addEventListener('click', () => location.reload());

function togglePause() {
    if (gameState !== 'PLAYING') return; isPaused = !isPaused; const p = document.getElementById('pause-overlay');
    if (isPaused) { p.classList.remove('hidden'); controls.unlock(); } else { p.classList.add('hidden'); controls.lock(); }
}
document.getElementById('resume-btn').addEventListener('click', togglePause);
window.addEventListener('keydown', e => { if (e.code === 'Escape') togglePause(); });

console.log("Iniciando Arena...");
try { generateMap(); bots = [new HumanoidBot()]; checkGameState(); console.log("Jogo pronto!"); } catch (err) { console.error("Erro:", err); }
