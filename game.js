import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D - HARDCORE EDITION
 * REQUIREMENTS: Physics, Magnum .357, Solid Obstacles, Dally Victory
 */

// --- CONFIGURAÇÕES DE COMBATE ---
const STATS = {
    PLAYER: {
        HP: 100,
        SPEED: 0.16,
        RELOAD_TIME: 2500, // 2.5s obrigatória
        WEAPONS: {
            MAGNUM: { DAMAGE: 30, MAG_SIZE: 10, RESERVE: 30, RATE: 400, AUTO: false },
            RIFLE: { DAMAGE: 20, MAG_SIZE: 20, RESERVE: 60, RATE: 100, AUTO: true }
        }
    },
    BOT: { HP: 100, DAMAGE: 40, SPEED: 0.08, ACCURACY: 0.6, RELOAD: 2000, STRAFE_TILL_REVERSE: 1000 }
};

// --- SISTEMA DE ÁUDIO ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playProceduralSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const g = audioCtx.createGain();
    const o = audioCtx.createOscillator();
    o.connect(g); g.connect(audioCtx.destination);

    if (type === 'SHOOT') {
        o.frequency.setValueAtTime(150, now);
        g.gain.setValueAtTime(0.2, now);
        o.start(); o.stop(now + 0.15);
    } else if (type === 'STEP') {
        o.frequency.setValueAtTime(60, now);
        g.gain.setValueAtTime(0.01, now);
        o.start(); o.stop(now + 0.1);
    }
}

// --- ESTADO GLOBAL ---
let gameState = 'START';
let currentPhase = 1;
let coins = 0;
let playerHp = 100;
let currentWeapon = 'MAGNUM';
let currentMag = STATS.PLAYER.WEAPONS.MAGNUM.MAG_SIZE;
let reserveAmmo = STATS.PLAYER.WEAPONS.MAGNUM.RESERVE;
let isMouseDown = false;
let isReloading = false;
let lastShotTime = 0;
let reloadStartTime = 0;

let bots = [];
let obstacles = [];
let obstacleBoxes = [];
let solidObjects = []; // Para Raycasting
const keys = {};

// --- TRÊS.JS SETUP ---
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

// Iluminação
const ambient = new THREE.HemisphereLight(0xffffff, 0x080820, 0.5);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.0);
sun.position.set(20, 40, 10);
sun.castShadow = true;
scene.add(sun);

// CÉU ESTRELADO
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(3000 * 3);
for (let i = 0; i < 9000; i++) starPos[i] = (Math.random() - 0.5) * 600;
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.7 })));

// --- MAGNUM .357 MODELO ---
const weaponProxy = new THREE.Group();
function createMagnum() {
    weaponProxy.clear();
    const iron = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.2 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });

    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.5), iron);
    barrel.position.z = -0.35;
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.15, 8), iron);
    cylinder.rotation.x = Math.PI / 2; cylinder.position.z = -0.1;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.15, 0.2), iron);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.12), wood);
    grip.position.set(0, -0.15, 0); grip.rotation.x = 0.3;

    weaponProxy.add(barrel, cylinder, frame, grip);
    weaponProxy.position.set(0.3, -0.2, -0.4);
    recoilGroup.add(weaponProxy);
}
createMagnum();

// --- MAPA E OBSTÁCULOS SÓLIDOS ---
function generateArena() {
    obstacles.forEach(o => scene.remove(o));
    obstacles = []; obstacleBoxes = []; solidObjects = [];

    // Chão
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x051a05 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor);

    const addSolid = (mesh, x, z) => {
        if (Math.sqrt(x * x + (z - 12) * (z - 12)) < 8) return;
        mesh.position.set(x, 0, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
        obstacles.push(mesh);
        obstacleBoxes.push(new THREE.Box3().setFromObject(mesh));
        solidObjects.push(mesh);
    };

    // Árvores (Tronco + Folhas)
    for (let i = 0; i < 15; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 5), new THREE.MeshStandardMaterial({ color: 0x2d1b1f }));
        trunk.position.y = 2.5;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 8), new THREE.MeshStandardMaterial({ color: 0x0a3d0a }));
        leaves.position.y = 6;
        tree.add(trunk, leaves);
        addSolid(tree, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80);
    }

    // Pedras Grandes (Box Fight Cover)
    for (let i = 0; i < 10; i++) {
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(2), new THREE.MeshStandardMaterial({ color: 0x444444 }));
        stone.position.y = 1.5; stone.scale.set(Math.random() + 1, Math.random() + 1, Math.random() + 1);
        addSolid(stone, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80);
    }

    // Bordas do Mapa
    const wallGeo = new THREE.BoxGeometry(100, 10, 1);
    const b1 = new THREE.Mesh(wallGeo); b1.position.set(0, 5, 50);
    const b2 = new THREE.Mesh(wallGeo); b2.position.set(0, 5, -50);
    const b3 = new THREE.Mesh(wallGeo); b3.position.set(50, 5, 0); b3.rotation.y = Math.PI / 2;
    const b4 = new THREE.Mesh(wallGeo); b4.position.set(-50, 5, 0); b4.rotation.y = Math.PI / 2;
    [b1, b2, b3, b4].forEach(b => obstacleBoxes.push(new THREE.Box3().setFromObject(b)));
}

// --- BOT HUMANOIDE COM FÍSICA ---
class ArenaBot {
    constructor() {
        this.id = Math.random().toString(36).substr(2, 9);
        this.maxHp = currentPhase === 2 ? 150 : 100;
        this.hp = this.maxHp;
        this.mesh = new THREE.Group();

        const skin = new THREE.MeshStandardMaterial({ color: 0xd2b48c });
        const clothes = new THREE.MeshStandardMaterial({ color: currentPhase === 2 ? 0xff0000 : 0x111111 });

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), clothes); body.position.y = 1.25;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin); head.position.y = 1.9;
        const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), clothes); lLeg.position.set(-0.18, 0.4, 0);
        const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), clothes); rLeg.position.set(0.18, 0.4, 0);

        // Posição inicial ancorada no chão
        this.mesh.add(body, head, lLeg, rLeg);
        this.rArm = new THREE.Group();
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.7, 0.18), skin); arm.position.y = -0.35;
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0 })); gun.position.set(0, -0.7, 0.2);
        this.rArm.add(arm, gun); this.rArm.position.set(0.4, 1.7, 0);
        this.mesh.add(this.rArm);

        scene.add(this.mesh);
        this.reset();
    }

    reset() {
        this.hp = this.maxHp;
        this.mesh.visible = true;
        this.mesh.position.set((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 40 - 20); // y=0 OBRIGATÓRIO
        this.createHealthBar();
        this.updateUI();
    }

    createHealthBar() {
        const hud = document.getElementById('bots-health-container');
        if (document.getElementById(`bot-${this.id}`)) return;
        const div = document.createElement('div'); div.id = `bot-${this.id}`;
        div.innerHTML = `<div class="health-bar bot-health"><div id="fill-${this.id}" class="health-fill" style="width:100%"></div></div>`;
        hud.appendChild(div);
    }

    updateUI() {
        const fill = document.getElementById(`fill-${this.id}`);
        if (fill) fill.style.width = (this.hp / this.maxHp) * 100 + '%';
    }

    update() {
        if (this.hp <= 0 || gameState !== 'PLAYING') { this.mesh.visible = false; return; }

        const dist = this.mesh.position.distanceTo(camera.position);
        const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();

        // Raycast de Linha de Visão (LoS) - Não atravessa paredes
        const losRay = new THREE.Raycaster(this.mesh.position.clone().add(new THREE.Vector3(0, 1.6, 0)), dir);
        const obstacleHits = losRay.intersectObjects(solidObjects, true);
        const hasLoS = (obstacleHits.length === 0 || obstacleHits[0].distance > dist);

        if (hasLoS) {
            // Soft Tracking: O bot rotaciona suavemente em direção ao jogador
            const targetRotation = Math.atan2(camera.position.x - this.mesh.position.x, camera.position.z - this.mesh.position.z);
            this.mesh.rotation.y += (targetRotation - this.mesh.rotation.y) * 0.1;

            this.rArm.lookAt(camera.position); this.rArm.rotation.x += Math.PI / 2;

            // Movimentação do Bot: Strafe Lateral + Perseguição Suave
            const time = Date.now() * 0.001;
            const strafeDir = Math.sin(time * 2); // Oscilação lateral

            if (dist > 7) {
                const forward = new THREE.Vector3(dir.x, 0, dir.z);
                const side = new THREE.Vector3(-dir.z, 0, dir.x);
                const step = forward.multiplyScalar(STATS.BOT.SPEED).add(side.multiplyScalar(strafeDir * 0.05));
                this.mesh.position.add(step);
            }

            // TIRO DO BOT (40 DANO) - Com Mira "Suave" (Simulada por chance de acerto reduzida)
            if (Date.now() - (this.lastShot || 0) > 1500) {
                this.lastShot = Date.now();
                if (Math.random() < STATS.BOT.ACCURACY) {
                    playerHp -= STATS.BOT.DAMAGE;
                    document.body.style.boxShadow = "inset 0 0 100px #ff0000";
                    setTimeout(() => document.body.style.boxShadow = "none", 150);
                    checkGameState();
                }
                this.renderTracer(this.mesh.position.clone().add(new THREE.Vector3(0, 1.6, 0)), camera.position);
            }
        }
    }

    renderTracer(start, end) {
        const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
        const mat = new THREE.LineBasicMaterial({ color: 0xffff00 });
        const line = new THREE.Line(geo, mat); scene.add(line);
        setTimeout(() => scene.remove(line), 40);
    }

    die() {
        this.mesh.visible = false;
        const bar = document.getElementById(`bot-${this.id}`); if (bar) bar.remove();
        coins += 60; // Ganha 60 moedas ao matar o bot
        checkGameState();
    }
}

// --- MECÂNICA DE JOGO ---
function handleShoot() {
    if (isReloading || gameState !== 'PLAYING' || currentMag <= 0) {
        if (currentMag <= 0 && !isReloading) reload();
        return;
    }

    const weapon = STATS.PLAYER.WEAPONS[currentWeapon];
    if (Date.now() - lastShotTime < weapon.RATE) return;

    lastShotTime = Date.now();
    currentMag--;
    playProceduralSound('SHOOT');

    // Recoil Visual Magnum
    recoilGroup.rotation.x += 0.1;
    weaponProxy.position.z += 0.15;

    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    ray.set(camera.position, dir);

    // Checar Obstáculos Sólidos primeiro
    const obsHits = ray.intersectObjects(solidObjects, true);
    const obsDist = obsHits.length > 0 ? obsHits[0].distance : Infinity;

    // Checar Bots
    let target = null, bestDist = Infinity;
    bots.forEach(b => {
        if (b.hp > 0) {
            const hits = ray.intersectObject(b.mesh, true);
            if (hits.length > 0 && hits[0].distance < bestDist) {
                bestDist = hits[0].distance; target = b;
            }
        }
    });

    // TIRO NÃO ATRAVESSA PAREDE/ÁRVORE
    if (target && bestDist < obsDist) {
        target.hp -= weapon.DAMAGE;
        if (target.hp <= 0) target.die();
        showHitMarker();
    }

    checkGameState();
}

function reload() {
    if (isReloading || reserveAmmo <= 0) return;
    isReloading = true;
    reloadStartTime = Date.now();
    setTimeout(() => {
        const weapon = STATS.PLAYER.WEAPONS[currentWeapon];
        const needed = weapon.MAG_SIZE - currentMag;
        const transfer = Math.min(needed, reserveAmmo);
        currentMag += transfer;
        reserveAmmo -= transfer;
        isReloading = false;
        checkGameState();
    }, STATS.PLAYER.RELOAD_TIME);
}

function showHitMarker() {
    const c = document.getElementById('crosshair'); c.style.borderColor = 'red';
    setTimeout(() => c.style.borderColor = 'rgba(255,255,255,0.8)', 100);
}

function checkGameState() {
    const fill = document.getElementById('player-health-fill');
    if (fill) fill.style.width = Math.max(0, playerHp) + '%';
    document.getElementById('ammo-count').innerText = currentMag;
    document.getElementById('total-ammo').innerText = reserveAmmo;
    document.getElementById('coin-count').innerText = coins;
    document.getElementById('phase-display').innerText = `FASE ${currentPhase}`;

    if (playerHp <= 0 && gameState === 'PLAYING') {
        gameState = 'GAMEOVER';
        document.getElementById('game-over-overlay').classList.remove('hidden');
        controls.unlock();
    }

    if (isReloading) {
        const prog = (Date.now() - reloadStartTime) / STATS.PLAYER.RELOAD_TIME;
        document.getElementById('ammo-count').innerText = `RELOAD... ${Math.round(prog * 100)}%`;
    }

    if (bots.length > 0 && bots.every(b => b.hp <= 0) && gameState === 'PLAYING') {
        gameState = 'VICTORY';
        runVictorySequence();
    }
}

function runVictorySequence() {
    document.getElementById('victory-overlay').classList.remove('hidden');
    controls.unlock();

    // Play Dally Trend Music
    const music = new Audio('assets/dally_trend.mp3');
    music.play().catch(() => console.log("Musica dally_trend.mp3 não encontrada."));

    // Celebração 3ª Pessoa
    camera.position.set(0, 3, 6); camera.lookAt(0, 1.5, 0);
    const dancer = new THREE.Group(); // Avatar simples para dança
    dancer.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 0.5), new THREE.MeshPhongMaterial({ color: 0x00ff00 })));
    scene.add(dancer);

    const dance = () => {
        if (gameState !== 'VICTORY') return;
        dancer.rotation.y += 0.1;
        dancer.position.y = Math.abs(Math.sin(Date.now() * 0.01)) * 0.5;
        renderer.render(scene, camera);
        requestAnimationFrame(dance);
    };
    dance();
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
        if (Date.now() - (lastStep || 0) > 350) { playProceduralSound('STEP'); lastStep = Date.now(); }
    }
}

let lastStep = 0;
function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        move();
        bots.forEach(b => b.update());

        // Auto-fire loop (Run & Gun)
        if (isMouseDown) {
            handleShoot();
        }

        recoilGroup.rotation.x *= 0.9;
        weaponProxy.position.z *= 0.85;
    }
    renderer.render(scene, camera);
}

// --- INPUTS ---
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR' && !isReloading) reload();
    if (e.code === 'Digit1') switchWeapon('MAGNUM');
    if (e.code === 'Digit2') switchWeapon('RIFLE');
});
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', e => { if (e.button === 0) isMouseDown = true; });
window.addEventListener('mouseup', e => { if (e.button === 0) isMouseDown = false; });

function switchWeapon(type) {
    if (isReloading) return;
    currentWeapon = type;
    const w = STATS.PLAYER.WEAPONS[type];
    currentMag = w.MAG_SIZE;
    reserveAmmo = w.RESERVE;
    checkGameState();
}

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-overlay').classList.add('hidden');
    gameState = 'PLAYING';
    playerHp = 100;
    switchWeapon('MAGNUM');
    camera.position.set(0, 1.7, 12); controls.lock();
});

document.getElementById('retry-btn').addEventListener('click', () => location.reload());
document.getElementById('reset-btn').addEventListener('click', () => location.reload());

document.getElementById('next-phase-btn').addEventListener('click', () => {
    currentPhase++;
    document.getElementById('victory-overlay').classList.add('hidden');
    generateArena();
    bots = (currentPhase === 2) ? [new ArenaBot(), new ArenaBot()] : [new ArenaBot()];
    playerHp = 100;
    switchWeapon(currentWeapon);
    camera.position.set(0, 1.7, 12); controls.lock();
    gameState = 'PLAYING';
});

// START
generateArena();
bots = [new ArenaBot()];
loop();
