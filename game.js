import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

console.log("BOX FIGHT 3D - RECONSTRUÇÃO TOTAL V3.5 (ULTIMATO) ATIVADA");

// --- CONFIGURAÇÕES GLOBAIS ---
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
    BOT: { HP: 100, DAMAGE: 40, SPEED: 0.08, ACCURACY: 0.6, RELOAD: 2000, STOP_DIST: 7 }
};

// --- ESTADO DO JOGO ---
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
let solidObjects = [];
let obstacleBoxes = [];
const keys = {};

// --- ÁUDIO ---
const sfxShot = new Audio('https://www.soundjay.com/weapon/gun-shot-1.mp3');
const sfxClick = new Audio('https://www.soundjay.com/button/button-3.mp3');
const sfxReload = new Audio('https://www.soundjay.com/button/button-10.mp3');
const sfxVictory = document.getElementById('victory-audio');

sfxShot.volume = 1.0;
sfxClick.volume = 0.4;
sfxReload.volume = 0.6;

function playSfx(id) {
    let audio = null;
    if (id === 'shot') audio = sfxShot;
    if (id === 'click') audio = sfxClick;
    if (id === 'reload') audio = sfxReload;
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(() => { });
    }
}

// --- ENGINE SETUP ---
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

// Luzes
scene.add(new THREE.HemisphereLight(0xffffff, 0x080820, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
scene.add(sun);

// --- MAPA ---
function generateMap() {
    solidObjects.forEach(o => scene.remove(o));
    solidObjects = []; obstacleBoxes = [];

    const floorGeo = new THREE.PlaneGeometry(150, 150);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a4a1a });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const addObstacle = (mesh, x, z, y = 0) => {
        mesh.position.set(x, y, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
        solidObjects.push(mesh);
        obstacleBoxes.push(new THREE.Box3().setFromObject(mesh));
    };

    for (let i = 0; i < 25; i++) {
        const x = (Math.random() - 0.5) * 120;
        const z = (Math.random() - 0.5) * 120;
        if (Math.abs(x) < 8 && Math.abs(z - 15) < 8) continue;
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 5), new THREE.MeshStandardMaterial({ color: 0x3d2b1f }));
        trunk.position.y = 2.5;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 8), new THREE.MeshStandardMaterial({ color: 0x0a5d0a }));
        leaves.position.y = 7;
        tree.add(trunk, leaves);
        addObstacle(tree, x, z);
    }

    for (let i = 0; i < 18; i++) {
        const x = (Math.random() - 0.5) * 110;
        const z = (Math.random() - 0.5) * 110;
        if (Math.abs(x) < 8 && Math.abs(z - 15) < 8) continue;
        const h = 6 + Math.random() * 6;
        const rock = new THREE.Mesh(new THREE.BoxGeometry(5, h, 5), new THREE.MeshStandardMaterial({ color: 0x555555 }));
        addObstacle(rock, x, z, h / 2);
    }
}

// --- BOT HUMANOIDE ---
class ArenaBot {
    constructor() {
        this.group = new THREE.Group();
        this.hp = 100;
        this.lastShot = 0;
        this.trackingPoint = new THREE.Vector3();

        const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69 });
        const clothes = new THREE.MeshStandardMaterial({ color: 0x111111 });

        this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), clothes);
        this.torso.position.y = 1.35;
        this.head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
        this.head.position.y = 2.05;
        const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), skin);
        lArm.position.set(-0.4, 1.3, 0);
        this.rArm = new THREE.Group();
        const rArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), skin);
        rArmMesh.position.y = -0.4;
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.6), new THREE.MeshBasicMaterial({ color: 0x000 }));
        gun.position.set(0, -0.7, 0.2);
        this.rArm.add(rArmMesh, gun);
        this.rArm.position.set(0.4, 1.7, 0);

        const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.9, 0.24), clothes);
        lLeg.position.set(-0.18, 0.45, 0);
        const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.9, 0.24), clothes);
        rLeg.position.set(0.18, 0.45, 0);

        this.group.add(this.torso, this.head, lArm, this.rArm, lLeg, rLeg);
        scene.add(this.group);
        this.respawn();
    }

    respawn() {
        this.hp = 100;
        this.group.visible = true;
        this.group.position.set((Math.random() - 0.5) * 60, 0, (Math.random() - 0.5) * 40 - 25);
    }

    onHit(dmg) {
        this.hp -= dmg;
        this.torso.material.color.set(0xff0000);
        setTimeout(() => { if (this.group.visible) this.torso.material.color.set(0x111111); }, 100);
        if (this.hp <= 0) this.die();
    }

    die() {
        this.group.visible = false;
        coins += 60;
        updateUI();
        checkGameState();
    }

    update() {
        if (!this.group.visible || gameState !== 'PLAYING') return;

        this.trackingPoint.lerp(camera.position, 0.08);
        this.group.lookAt(this.trackingPoint.x, 0, this.trackingPoint.z);
        this.rArm.lookAt(camera.position); this.rArm.rotation.x += Math.PI / 2;

        const dist = this.group.position.distanceTo(camera.position);
        const dir = new THREE.Vector3().subVectors(camera.position, this.group.position).normalize();

        const ray = new THREE.Raycaster(this.group.position.clone().add(new THREE.Vector3(0, 1.7, 0)), dir);
        const hits = ray.intersectObjects(solidObjects, true);
        const hasLoS = (hits.length === 0 || hits[0].distance > dist);

        if (hasLoS) {
            const time = Date.now() * 0.001;
            const strafe = Math.sin(time * 2) * 0.05;
            if (dist > STATS.BOT.STOP_DIST) {
                const step = new THREE.Vector3(dir.x, 0, dir.z).multiplyScalar(STATS.BOT.SPEED);
                const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(strafe);
                this.group.position.add(step).add(side);
            }

            if (Date.now() - this.lastShot > 1500 && Math.random() < STATS.BOT.ACCURACY) {
                this.lastShot = Date.now();
                playerHp -= STATS.BOT.DAMAGE;
                document.body.style.boxShadow = "inset 0 0 100px #ff0000";
                setTimeout(() => document.body.style.boxShadow = "none", 150);
                updateUI();
                checkGameState();
                this.renderTracer(this.group.position.clone().add(new THREE.Vector3(0, 1.7, 0)), camera.position);
            }
        }
    }

    renderTracer(start, end) {
        const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
        const mat = new THREE.LineBasicMaterial({ color: 0xffff00 });
        const line = new THREE.Line(geo, mat); scene.add(line);
        setTimeout(() => scene.remove(line), 40);
    }
}

// --- ARSENAL ---
const weaponProxy = new THREE.Group();
camera.add(weaponProxy);

function createWeaponModel() {
    weaponProxy.clear();
    const iron = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.2 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });

    if (currentWeapon === 'MAGNUM') {
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.7), iron);
        barrel.position.z = -0.5;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), iron);
        body.rotation.x = Math.PI / 2; body.position.z = -0.15;
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.12), wood);
        grip.position.set(0, -0.2, 0); grip.rotation.x = 0.3;
        weaponProxy.add(barrel, body, grip);
    } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 1.3), iron);
        body.position.z = -0.5;
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.2), iron);
        mag.position.set(0, -0.3, -0.4); mag.rotation.x = 0.2;
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1), iron);
        barrel.rotation.x = Math.PI / 2; barrel.position.z = -1.2;
        weaponProxy.add(body, mag, barrel);
    }
    weaponProxy.position.set(0.6, -0.35, -1.0);
}

// --- MECÂNICA ---
function handleShoot() {
    if (isReloading || gameState !== 'PLAYING' || currentMag <= 0) {
        if (currentMag <= 0 && !isReloading) reload();
        return;
    }

    const weapon = STATS.PLAYER.WEAPONS[currentWeapon];
    if (Date.now() - lastShotTime < weapon.RATE) return;

    lastShotTime = Date.now();
    currentMag--;
    playSfx('shot');
    updateUI();

    recoilGroup.rotation.x += 0.1;
    weaponProxy.position.z += 0.15;

    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const obsHits = ray.intersectObjects(solidObjects, true);
    const obsDist = obsHits.length > 0 ? obsHits[0].distance : Infinity;

    bots.forEach(b => {
        if (b.group.visible) {
            const hit = ray.intersectObject(b.group, true);
            if (hit.length > 0 && hit[0].distance < obsDist) {
                b.onHit(weapon.DAMAGE);
                showHitMarker();
            }
        }
    });

    checkGameState();
}

function reload() {
    if (isReloading || reserveAmmo <= 0) return;
    isReloading = true;
    reloadStartTime = Date.now();
    playSfx('reload');
    setTimeout(() => {
        const weapon = STATS.PLAYER.WEAPONS[currentWeapon];
        const transfer = Math.min(weapon.MAG_SIZE - currentMag, reserveAmmo);
        currentMag += transfer;
        reserveAmmo -= transfer;
        isReloading = false;
        updateUI();
    }, STATS.PLAYER.RELOAD_TIME);
}

function showHitMarker() {
    const c = document.getElementById('crosshair'); c.style.borderColor = 'red';
    setTimeout(() => c.style.borderColor = 'rgba(255,255,255,0.8)', 100);
}

function updateUI() {
    document.getElementById('player-health-fill').style.width = Math.max(0, playerHp) + '%';
    document.getElementById('coin-count').innerText = coins;
    document.getElementById('ammo-count').innerText = currentMag;
    document.getElementById('total-ammo').innerText = reserveAmmo;
    document.getElementById('phase-display').innerText = `FASE ${currentPhase}`;
}

function checkGameState() {
    if (playerHp <= 0 && gameState === 'PLAYING') {
        gameState = 'GAMEOVER';
        document.getElementById('game-over-overlay').classList.remove('hidden');
        controls.unlock();
    }
    if (bots.length > 0 && bots.every(b => !b.group.visible) && gameState === 'PLAYING') {
        gameState = 'VICTORY';
        document.getElementById('victory-overlay').classList.remove('hidden');
        controls.unlock();
    }
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
        const next = camera.position.clone().add(mv.normalize().multiplyScalar(STATS.PLAYER.SPEED));
        const pBox = new THREE.Box3().setFromCenterAndSize(next, new THREE.Vector3(1, 2, 1));
        if (!obstacleBoxes.some(b => b.intersectsBox(pBox))) camera.position.copy(next);
    }
}

function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        move();
        bots.forEach(b => b.update());
        if (isMouseDown && STATS.PLAYER.WEAPONS[currentWeapon].AUTO) handleShoot();
        recoilGroup.rotation.x *= 0.9;
        weaponProxy.position.z *= 0.85;
    }
    renderer.render(scene, camera);
}

window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR') reload();
    if (e.code === 'Digit1') switchWeapon('MAGNUM');
    if (e.code === 'Digit2') switchWeapon('RIFLE');
});
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', e => {
    if (e.button === 0) {
        isMouseDown = true;
        if (!STATS.PLAYER.WEAPONS[currentWeapon].AUTO) handleShoot();
    }
});
window.addEventListener('mouseup', e => { if (e.button === 0) isMouseDown = false; });

function switchWeapon(type) {
    if (isReloading) return;
    currentWeapon = type;
    const w = STATS.PLAYER.WEAPONS[type];
    currentMag = w.MAG_SIZE;
    reserveAmmo = w.RESERVE;
    createWeaponModel();
    updateUI();
}

function startPhase(phase) {
    currentPhase = phase;
    playerHp = 100;
    generateMap();
    bots = [];
    const count = (phase === 1) ? 1 : 2;
    for (let i = 0; i < count; i++) bots.push(new ArenaBot());
    gameState = 'PLAYING';
    camera.position.set(0, 1.7, 15);
    controls.lock();
    updateUI();
}

document.getElementById('start-btn').onclick = () => startPhase(1);
document.getElementById('retry-btn').onclick = () => startPhase(currentPhase);
document.getElementById('next-phase-btn').onclick = () => startPhase(currentPhase + 1);
document.getElementById('reset-btn').onclick = () => { coins = 0; startPhase(1); };

createWeaponModel();
loop();
