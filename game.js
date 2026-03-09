import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- CONFIGURAÇÕES ---
const STATS = {
    PLAYER: {
        HP: 100, SPEED: 0.16, RELOAD_TIME: 2500,
        WEAPONS: {
            MAGNUM: { DAMAGE: 30, MAG_SIZE: 10, RESERVE: 30, RATE: 400, AUTO: false },
            RIFLE: { DAMAGE: 20, MAG_SIZE: 20, RESERVE: 60, RATE: 100, AUTO: true }
        }
    },
    BOT: { HP: 100, DAMAGE: 40, SPEED: 0.08, ACCURACY: 0.5, STOP_DIST: 7 }
};

let gameState = 'START';
let currentPhase = 1, coins = 0, playerHp = 100;
let currentWeapon = 'MAGNUM', isMouseDown = false, isReloading = false;
let currentMag = 10, reserveAmmo = 30, lastShotTime = 0;

let bots = [], solidObjects = [], obstacleBoxes = [];
const keys = {};

// --- SETUP THREE.JS ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('game-container').appendChild(renderer.domElement);

const recoilGroup = new THREE.Group();
camera.add(recoilGroup);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xffffff, 0x080820, 0.6));
const controls = new PointerLockControls(camera, document.body);

// --- MAPA ---
function generateMap() {
    solidObjects.forEach(o => scene.remove(o));
    solidObjects = []; obstacleBoxes = [];

    // Solo
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(150, 150), new THREE.MeshStandardMaterial({ color: 0x1a3a1a }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const addObs = (mesh, x, z, y = 0) => {
        mesh.position.set(x, y, z);
        scene.add(mesh);
        solidObjects.push(mesh);
        obstacleBoxes.push(new THREE.Box3().setFromObject(mesh));
    };

    for (let i = 0; i < 30; i++) {
        const x = (Math.random() - 0.5) * 100, z = (Math.random() - 0.5) * 100;
        if (Math.abs(x) < 10 && Math.abs(z - 15) < 10) continue;
        const box = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2), new THREE.MeshStandardMaterial({ color: 0x555555 }));
        addObs(box, x, z, 2);
    }
}

// --- BOT ---
class ArenaBot {
    constructor() {
        this.mesh = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        body.position.y = 0.9;
        this.mesh.add(body);
        scene.add(this.mesh);
        this.hp = 100;
        this.reset();
    }
    reset() {
        this.hp = 100;
        this.mesh.visible = true;
        this.mesh.position.set((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 40 - 20);
    }
    update() {
        if (!this.mesh.visible || gameState !== 'PLAYING') return;
        const dist = this.mesh.position.distanceTo(camera.position);
        this.mesh.lookAt(camera.position.x, 0, camera.position.z);

        if (dist > STATS.BOT.STOP_DIST) {
            const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();
            this.mesh.position.add(new THREE.Vector3(dir.x, 0, dir.z).multiplyScalar(STATS.BOT.SPEED));
        }

        if (Date.now() - (this.lastShot || 0) > 1500) {
            this.lastShot = Date.now();
            if (Math.random() < STATS.BOT.ACCURACY) {
                playerHp -= STATS.BOT.DAMAGE;
                updateUI();
                if (playerHp <= 0) endGame();
            }
        }
    }
}

// --- ARSENAL ---
const weaponModel = new THREE.Group();
recoilGroup.add(weaponModel);
function createWeapon() {
    weaponModel.clear();
    const iron = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.2, currentWeapon === 'MAGNUM' ? 0.4 : 0.8), iron);
    gun.position.set(0.3, -0.2, -0.5);
    weaponModel.add(gun);
}

function handleShoot() {
    if (isReloading || gameState !== 'PLAYING' || currentMag <= 0) return;
    const weapon = STATS.PLAYER.WEAPONS[currentWeapon];
    if (Date.now() - lastShotTime < weapon.RATE) return;

    lastShotTime = Date.now();
    currentMag--;
    updateUI();

    // Recoil
    weaponModel.position.z += 0.1;
    setTimeout(() => weaponModel.position.z = 0, 50);

    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const obsHits = ray.intersectObjects(solidObjects);
    const obsDist = obsHits.length > 0 ? obsHits[0].distance : Infinity;

    bots.forEach(b => {
        if (b.mesh.visible) {
            const hit = ray.intersectObject(b.mesh, true);
            if (hit.length > 0 && hit[0].distance < obsDist) {
                b.hp -= weapon.DAMAGE;
                if (b.hp <= 0) {
                    b.mesh.visible = false;
                    coins += 60;
                    updateUI();
                    checkVictory();
                }
            }
        }
    });
}

function updateUI() {
    document.getElementById('player-health-fill').style.width = playerHp + '%';
    document.getElementById('coin-count').innerText = coins;
    document.getElementById('ammo-count').innerText = currentMag;
    document.getElementById('total-ammo').innerText = reserveAmmo;
}

function checkVictory() {
    if (bots.every(b => !b.mesh.visible)) {
        gameState = 'VICTORY';
        document.getElementById('victory-overlay').classList.remove('hidden');
        controls.unlock();
    }
}

function endGame() {
    gameState = 'GAMEOVER';
    document.getElementById('game-over-overlay').classList.remove('hidden');
    controls.unlock();
}

function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
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

        if (isMouseDown && STATS.PLAYER.WEAPONS[currentWeapon].AUTO) handleShoot();
        bots.forEach(b => b.update());
    }
    renderer.render(scene, camera);
}

// --- INPUTS ---
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'Digit1') { currentWeapon = 'MAGNUM'; createWeapon(); }
    if (e.code === 'Digit2') { currentWeapon = 'RIFLE'; createWeapon(); }
});
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', () => { isMouseDown = true; handleShoot(); });
window.addEventListener('mouseup', () => isMouseDown = false);

document.getElementById('start-btn').onclick = () => {
    gameState = 'PLAYING';
    document.getElementById('start-overlay').classList.add('hidden');
    camera.position.set(0, 1.7, 10);
    controls.lock();
};

// Start
generateMap();
createWeapon();
bots = [new ArenaBot()];
loop();
