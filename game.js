import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D - RECONSTRUÇÃO TOTAL (ESTÁVEL)
 * Foco: Física de Colisão, IA Estável e Sistema de Vida
 */

// --- CONFIGURAÇÕES TÉCNICAS ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 30, SPEED: 0.16, MAG: 10, RESERVE: 20, RELOAD: 2000 },
    BOT: { HP: 100, DAMAGE: 35, SPEED: 0.08, STOP_DIST: 6, REACTION: 600, COOLDOWN: 1000 }
};

// --- ESTADO DO MOTOR ---
let gameState = 'START';
let playerHp = 100;
let currentMag = STATS.PLAYER.MAG;
let reserveAmmo = STATS.PLAYER.RESERVE;
let isReloading = false;
let lastShotTime = 0;

let bots = [];
let obstacles = []; // Meshes para renderizar
let obstacleBoxes = []; // Cubos invisíveis para colisão
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
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

// --- 1. ARQUITETURA DO CENÁRIO (O MAPA) ---
function generateMap() {
    // Limpeza
    obstacles.forEach(o => scene.remove(o));
    obstacles = []; obstacleBoxes = [];

    // Solo (Grama)
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x228b22 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const addObstacle = (mesh, x, z) => {
        mesh.position.set(x, mesh.userData.yOffset || 0, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        obstacles.push(mesh);
        // Criar BoundingBox para colisão física
        const box = new THREE.Box3().setFromObject(mesh);
        obstacleBoxes.push(box);
    };

    // 15 Árvores (Tronco + Copa)
    for (let i = 0; i < 15; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x3d2b1f }));
        trunk.position.y = 3;
        const leaves = new THREE.Mesh(new THREE.SphereGeometry(2.5, 8, 8), new THREE.MeshStandardMaterial({ color: 0x0a5d0a }));
        leaves.position.y = 7;
        tree.add(trunk, leaves);
        tree.userData.yOffset = 0;
        addObstacle(tree, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80);
    }

    // 10 Pedras Altas (Cubos Irregulares)
    for (let i = 0; i < 10; i++) {
        const stone = new THREE.Mesh(
            new THREE.BoxGeometry(3, 8, 3),
            new THREE.MeshStandardMaterial({ color: 0x444444 })
        );
        stone.userData.yOffset = 4;
        stone.scale.set(Math.random() + 0.5, 1.2, Math.random() + 0.5);
        addObstacle(stone, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70);
    }
}

// --- 2. O JOGADOR (FPS MODE) ---
const weaponProxy = new THREE.Group();
function createWeapon() {
    weaponProxy.clear();
    const iron = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0xd2b48c }));
    const magnum = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.5), iron);
    magnum.rotation.x = Math.PI / 2;
    magnum.position.set(0.1, -0.1, -0.4);
    arm.position.set(0.1, -0.2, -0.2);
    weaponProxy.add(arm, magnum);
    recoilGroup.add(weaponProxy);
}
createWeapon();

// --- 3. O BOT (IA COM PÉS NO CHÃO) ---
class ArenaBot {
    constructor() {
        this.group = new THREE.Group();
        this.hp = 100;
        this.maxHp = 100;
        this.seePlayerTime = 0;
        this.lastShot = 0;

        // Visual do Bot
        const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69 });
        const clothes = new THREE.MeshStandardMaterial({ color: 0x222222 });
        this.body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.4, 0.4), clothes);
        this.body.position.y = 0.7; // Pés no y=0
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
        head.position.y = 1.6;
        this.group.add(this.body, head);

        // Barra de Vida acima da cabeça
        const hpGeo = new THREE.PlaneGeometry(1, 0.15);
        this.hpMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.hpBar = new THREE.Mesh(hpGeo, this.hpMat);
        this.hpBar.position.y = 2.2;
        this.group.add(this.hpBar);

        scene.add(this.group);
        this.respawn();
    }

    respawn() {
        this.hp = 100;
        this.group.visible = true;
        this.group.position.set((Math.random() - 0.5) * 40, 0, -20);
        this.updateHpBar();
    }

    updateHpBar() {
        this.hpBar.scale.x = Math.max(0, this.hp / this.maxHp);
        if (this.hp < 40) this.hpMat.color.set(0xff0000);
    }

    onHit(dmg) {
        this.hp -= dmg;
        this.updateHpBar();
        // Feedback Vermelho
        this.body.material.color.set(0xff0000);
        setTimeout(() => this.body.material.color.set(0x222222), 100);

        if (this.hp <= 0) {
            this.group.visible = false;
            checkGameState();
        }
    }

    update() {
        if (!this.group.visible || gameState !== 'PLAYING') return;

        const dist = this.group.position.distanceTo(camera.position);
        const dir = new THREE.Vector3().subVectors(camera.position, this.group.position).normalize();

        // LOS Raycast (Não atira através de árvores/pedras)
        const ray = new THREE.Raycaster(this.group.position.clone().add(new THREE.Vector3(0, 1.5, 0)), dir);
        const hits = ray.intersectObjects(obstacles, true);
        const playerVisible = (hits.length === 0 || hits[0].distance > dist);

        if (playerVisible) {
            this.group.lookAt(camera.position.x, 0, camera.position.z);

            if (this.seePlayerTime === 0) this.seePlayerTime = Date.now();

            // Movimentação (Para a 6 metros)
            if (dist > STATS.BOT.STOP_DIST) {
                this.group.position.add(new THREE.Vector3(dir.x, 0, dir.z).multiplyScalar(STATS.BOT.SPEED));
            }

            // Atirar (Nerf IA)
            const timeSeen = Date.now() - this.seePlayerTime;
            if (timeSeen > STATS.BOT.REACTION && Date.now() - this.lastShot > STATS.BOT.COOLDOWN) {
                this.shoot();
            }
        } else {
            this.seePlayerTime = 0;
        }
    }

    shoot() {
        this.lastShot = Date.now();
        // Simular Dispersão
        if (Math.random() > STATS.BOT.ACCURACY_ERROR) {
            playerHp -= STATS.BOT.DAMAGE;
            document.body.style.boxShadow = "inset 0 0 100px #ff0000";
            setTimeout(() => document.body.style.boxShadow = "none", 100);
            updateUI();
            checkGameState();
        }
    }
}

// --- MECÂNICAS JOGADOR ---
function handleShoot() {
    if (gameState !== 'PLAYING' || isReloading || currentMag <= 0) return;

    currentMag--;
    lastShotTime = Date.now();
    updateUI();

    // Recoil
    recoilGroup.rotation.x += 0.1;
    weaponProxy.position.z += 0.1;

    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    ray.set(camera.position, dir);

    // Checar Obstáculos
    const wallHits = ray.intersectObjects(obstacles, true);
    const wallDist = wallHits.length > 0 ? wallHits[0].distance : Infinity;

    // Checar Bot
    let target = null;
    let bestDist = Infinity;
    bots.forEach(b => {
        if (b.group.visible) {
            const hit = ray.intersectObject(b.group, true);
            if (hit.length > 0 && hit[0].distance < bestDist) {
                bestDist = hit[0].distance; target = b;
            }
        }
    });

    if (target && bestDist < wallDist) {
        target.onHit(STATS.PLAYER.DAMAGE);
    }
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
    document.getElementById('player-health-fill').style.width = Math.max(0, playerHp) + '%';
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
    if (bots.every(b => !b.group.visible) && gameState === 'PLAYING') {
        gameState = 'VICTORY';
        runVictorySequence();
    }
}

function runVictorySequence() {
    document.getElementById('victory-overlay').classList.remove('hidden');
    controls.unlock();
    new Audio('assets/dally_trend.mp3').play().catch(() => { });

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

        // Suavizar Recoil
        recoilGroup.rotation.x *= 0.9;
        weaponProxy.position.z *= 0.8;
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
        // Colisão Física Simples
        const pBox = new THREE.Box3().setFromCenterAndSize(next, new THREE.Vector3(1, 2, 1));
        if (!obstacleBoxes.some(box => pBox.intersectsBox(box))) {
            camera.position.copy(next);
        }
    }
}

// --- EVENTOS ---
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR') reload();
});
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', e => { if (e.button === 0) handleShoot(); });

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-overlay').classList.add('hidden');
    gameState = 'PLAYING';
    camera.position.set(0, 2, 12);
    controls.lock();
    updateUI();
});

document.getElementById('next-phase-btn').addEventListener('click', () => {
    currentPhase++;
    gameState = 'PLAYING';
    document.getElementById('victory-overlay').classList.add('hidden');
    generateMap();
    bots.forEach(b => b.respawn());
    playerHp = 100;
    camera.position.set(0, 2, 12);
    controls.lock();
    updateUI();
});

// START
generateMap();
bots = [new ArenaBot()];
loop();
