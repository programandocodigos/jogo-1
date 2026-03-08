import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D - ULTIMATO FINAL (VERSÃO 100% ESTÁVEL)
 * Bot Humanoide, Viewmodel FPS, Colisões Reais e HUD Funcional.
 */

// --- CONFIGURAÇÕES DO MOTOR ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 30, SPEED: 0.16, MAG: 10, TOTAL: 30, RELOAD: 2500 },
    BOT: { HP: 100, DAMAGE: 40, SPEED: 0.08, ACCURACY_ERROR: 0.15, STOP_DIST: 5, REACTION: 500 }
};

// --- ESTADO DO JOGO ---
let gameState = 'START';
let currentPhase = 1;
let playerHp = 100;
let botHp = 100;
let currentMag = STATS.PLAYER.MAG;
let reserveAmmo = STATS.PLAYER.TOTAL - STATS.PLAYER.MAG;
let isReloading = false;
let lastShotTime = 0;
let keys = {};

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
const ambient = new THREE.HemisphereLight(0xffffff, 0x080820, 0.7);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(20, 50, 10);
sun.castShadow = true;
sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
scene.add(sun);

// ESTRELAS
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(3000 * 3);
for (let i = 0; i < 9000; i++) starPos[i] = (Math.random() - 0.5) * 600;
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8 })));

// --- 1. O MAPA (RESTAURADO) ---
function generateArena() {
    solidObjects.forEach(o => scene.remove(o));
    solidObjects = []; obstacleBoxes = [];

    // GRAMA (Solo)
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(120, 120),
        new THREE.MeshStandardMaterial({ color: 0x1a4d1a })
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

    // 15 ÁRVORES (Cores Vibrantes)
    for (let i = 0; i < 15; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 6), new THREE.MeshStandardMaterial({ color: 0x3d2b1f }));
        trunk.position.y = 3;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 8), new THREE.MeshStandardMaterial({ color: 0x0a5d0a }));
        leaves.position.y = 7;
        tree.add(trunk, leaves);
        addSolid(tree, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90);
    }

    // 10 PEDRAS ALTAS (COBERTURA)
    for (let i = 0; i < 10; i++) {
        const stone = new THREE.Mesh(
            new THREE.BoxGeometry(4, 9, 4),
            new THREE.MeshStandardMaterial({ color: 0x555555 })
        );
        addSolid(stone, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 4.5);
    }
}

// --- 2. VIEWMODEL (ARMA NA MÃO) ---
const weaponGroup = new THREE.Group();
function createWeapon() {
    weaponGroup.clear();
    const iron = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.2 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });

    // Braço
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.8), new THREE.MeshStandardMaterial({ color: 0xd2b48c }));
    arm.position.set(0.4, -0.4, -0.3);

    // Magnum .357
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.5), iron);
    barrel.position.set(0.4, -0.28, -0.7);
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.15, 8), iron);
    cylinder.rotation.x = Math.PI / 2;
    cylinder.position.set(0.4, -0.28, -0.45);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.12), wood);
    grip.position.set(0.4, -0.4, -0.35); grip.rotation.x = 0.3;

    weaponGroup.add(arm, barrel, cylinder, grip);
    recoilGroup.add(weaponGroup);
}
// Importante: A arma está no recoilGroup que está no camera. Então camera.add(recoilGroup) já resolve.
createWeapon();

// --- 3. BOT HUMANOIDE ---
class ArenaBot {
    constructor() {
        this.group = new THREE.Group();
        this.hp = 100;
        this.lastShot = 0;
        this.seePlayerTime = 0;
        this.isFlashing = false;

        const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69 });
        const clothes = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });

        // Corpo
        this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), clothes);
        this.torso.position.y = 1.25;
        this.head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
        this.head.position.y = 1.9;

        // Membros
        const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), clothes); lLeg.position.set(-0.18, 0.4, 0);
        const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.8, 0.22), clothes); rLeg.position.set(0.18, 0.4, 0);
        const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), skin); lArm.position.set(-0.4, 1.3, 0);
        const rArm = new THREE.Group();
        const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), skin); armMesh.position.y = -0.35;
        const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.4), new THREE.MeshStandardMaterial({ color: 0 }));
        gun.position.set(0, -0.65, 0.2);
        rArm.add(armMesh, gun); rArm.position.set(0.4, 1.7, 0);

        this.group.add(this.torso, this.head, lLeg, rLeg, lArm, rArm);
        this.rArm = rArm;
        scene.add(this.group);
        this.respawn();
    }

    respawn() {
        this.hp = 100; botHp = 100;
        this.group.visible = true;
        this.group.position.set((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 40 - 20); // y=0 FIXED
        updateUI();
    }

    onHit(dmg) {
        this.hp -= dmg; botHp = this.hp;
        updateUI();

        if (!this.isFlashing) {
            this.isFlashing = true;
            this.torso.material.color.set(0xff0000);
            setTimeout(() => {
                this.torso.material.color.set(0x1a1a1a);
                this.isFlashing = false;
            }, 100);
        }

        if (this.hp <= 0) {
            this.group.visible = false;
            checkGameState();
        }
    }

    update() {
        if (!this.group.visible || gameState !== 'PLAYING') return;

        const dist = this.group.position.distanceTo(camera.position);
        const dir = new THREE.Vector3().subVectors(camera.position, this.group.position).normalize();

        // Raycast LOS
        const ray = new THREE.Raycaster(this.group.position.clone().add(new THREE.Vector3(0, 1.6, 0)), dir);
        const hits = ray.intersectObjects(solidObjects, true);
        const canSee = (hits.length === 0 || hits[0].distance > dist);

        if (canSee) {
            if (this.seePlayerTime === 0) this.seePlayerTime = Date.now();
            this.group.lookAt(camera.position.x, 0, camera.position.z);
            this.rArm.lookAt(camera.position); this.rArm.rotation.x += Math.PI / 2;

            if (dist > STATS.BOT.STOP_DIST) {
                this.group.position.add(new THREE.Vector3(dir.x, 0, dir.z).multiplyScalar(STATS.BOT.SPEED));
            }

            // Atirar (Nerf IA)
            const timeSinceSeen = Date.now() - this.seePlayerTime;
            if (timeSinceSeen > STATS.BOT.REACTION && Date.now() - this.lastShot > 1500) {
                this.lastShot = Date.now();
                if (Math.random() > STATS.BOT.ACCURACY_ERROR) {
                    playerHp -= STATS.BOT.DAMAGE;
                    document.body.style.boxShadow = "inset 0 0 100px #ff0000";
                    setTimeout(() => document.body.style.boxShadow = "none", 100);
                    updateUI();
                    checkGameState();
                }
            }
        } else {
            this.seePlayerTime = 0;
        }
    }
}

// --- 4. MECÂNICAS JOGADOR ---
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
    weaponGroup.position.z += 0.1;

    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);

    const wallHits = ray.intersectObjects(solidObjects, true);
    const wallDist = wallHits.length > 0 ? wallHits[0].distance : Infinity;

    let target = null, bDist = Infinity;
    bots.forEach(b => {
        if (b.group.visible) {
            const hit = ray.intersectObject(b.group, true);
            if (hit.length > 0 && hit[0].distance < bDist) {
                bDist = hit[0].distance; target = b;
            }
        }
    });

    if (target && bDist < wallDist) {
        target.onHit(STATS.PLAYER.DAMAGE);
        showHitMarker();
    }
}

function showHitMarker() {
    const c = document.getElementById('crosshair'); c.style.borderColor = 'red';
    setTimeout(() => c.style.borderColor = 'rgba(255,255,255,0.8)', 100);
}

function reload() {
    if (isReloading || reserveAmmo <= 0 || currentMag === STATS.PLAYER.MAG) return;
    isReloading = true;
    document.getElementById('ammo-count').innerText = "RLD";
    setTimeout(() => {
        const need = STATS.PLAYER.MAG - currentMag;
        const take = Math.min(need, reserveAmmo);
        currentMag += take;
        reserveAmmo -= take;
        isReloading = false;
        updateUI();
    }, STATS.PLAYER.RELOAD);
}

function updateUI() {
    const pFill = document.getElementById('player-health-fill');
    const bFill = document.getElementById('bot-health-fill');
    if (pFill) pFill.style.width = Math.max(0, playerHp) + '%';
    if (bFill) bFill.style.width = Math.max(0, botHp) + '%';
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
    if (bots.every(b => !b.group.visible) && gameState === 'PLAYING') {
        gameState = 'VICTORY';
        runVictorySequence();
    }
}

function runVictorySequence() {
    document.getElementById('victory-overlay').classList.remove('hidden');
    controls.unlock();
    new Audio('assets/dally_trend.mp3').play().catch(() => { });

    // 3ª Pessoa Dance
    camera.position.set(0, 3, 6);
    camera.lookAt(0, 1.5, 0);
}

// --- CICLO DE ANIMAÇÃO ---
function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        movePlayer();
        bots.forEach(b => b.update());

        // Estabilizar Arma
        recoilGroup.rotation.x *= 0.9;
        weaponGroup.position.z *= 0.85;
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

// --- ENTRADA DE DADOS ---
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
    generateArena();
    bots.forEach(b => b.respawn());
    playerHp = 100;
    camera.position.set(0, 1.7, 12);
    controls.lock();
    updateUI();
});

// INICIAR MOTOR
generateArena();
bots = [new ArenaBot()];
loop();
