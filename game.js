import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

console.log("BOX FIGHT 3D - VERSÃO 2.1 (FIX ESTABILIDADE) CARREGADA");

/**
 * RECONSTRUÇÃO TOTAL: CORREÇÃO DE MORTE INSTANTÂNEA E TRAVA DE CÂMERA
 */

// --- CONFIGURAÇÕES ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 30, SPEED: 0.16, MAG: 10, TOTAL: 30, RELOAD: 2500, RADIUS: 0.8 },
    BOT: { HP: 100, DAMAGE: 40, SPEED: 0.1, ACCURACY_BASE: 0.6, ACCURACY_MOVING: 0.4, REACTION: 500, STOP_DIST: 12, STRAFE_SPEED: 0.06, RADIUS: 0.7 }
};

// --- ESTADO GLOBAL ---
let gameState = 'START';
let currentPhase = 1;
let playerHp = 100;
let botHp = 100;
let currentMag = STATS.PLAYER.MAG;
let reserveAmmo = STATS.PLAYER.TOTAL - STATS.PLAYER.MAG;
let isReloading = false;
let isMoving = false;
let isJumping = false;
const keys = {};

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
scene.add(new THREE.HemisphereLight(0xffffff, 0x080820, 0.7));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(20, 50, 10);
sun.castShadow = true;
sun.shadow.mapSize.width = 1024;
sun.shadow.mapSize.height = 1024;
scene.add(sun);

// --- 1. O MAPA (LABIRINTO FUNCIONAL) ---
function generateMap() {
    solidObjects.forEach(o => scene.remove(o));
    solidObjects = []; obstacleBoxes = [];

    // Solo (Grama)
    const floorGeo = new THREE.PlaneGeometry(120, 120);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a401a });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Adicionar "Grama" visual (pequenos tufos)
    for (let i = 0; i < 200; i++) {
        const g = new THREE.Mesh(
            new THREE.PlaneGeometry(0.2, 0.4),
            new THREE.MeshBasicMaterial({ color: 0x2d5a27, side: THREE.DoubleSide })
        );
        g.position.set((Math.random() - 0.5) * 100, 0.2, (Math.random() - 0.5) * 100);
        g.rotation.y = Math.random() * Math.PI;
        scene.add(g);
    }

    const addSolid = (mesh, x, z, y = 0) => {
        mesh.position.set(x, y, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
        solidObjects.push(mesh);
        const box = new THREE.Box3().setFromObject(mesh);
        obstacleBoxes.push(box);
    };

    // Árvores
    for (let i = 0; i < 20; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 5), new THREE.MeshStandardMaterial({ color: 0x3d2b1f }));
        trunk.position.y = 2.5;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.5, 5, 8), new THREE.MeshStandardMaterial({ color: 0x0a5d0a }));
        leaves.position.y = 6.5;
        tree.add(trunk, leaves);
        addSolid(tree, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90);
    }

    // Pedras / Obstáculos (Labirinto)
    for (let i = 0; i < 15; i++) {
        const stone = new THREE.Mesh(
            new THREE.BoxGeometry(4, 5 + Math.random() * 5, 4),
            new THREE.MeshStandardMaterial({ color: 0x555555 })
        );
        addSolid(stone, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 2.5);
    }
}

// --- 2. JOGADOR: MAGNUM .357 (VIEWMODEL FIX) ---
const weaponGroup = new THREE.Group();
function createWeapon() {
    weaponGroup.clear();
    const iron = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.1 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xd2b48c });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });

    // Braço
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.2), skin);
    arm.position.set(0.6, -0.5, -0.5);
    arm.rotation.y = -0.1;

    // Magnum .357
    const gun = new THREE.Group();
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.8), iron);
    barrel.position.z = -0.6;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), iron);
    body.rotation.x = Math.PI / 2;
    body.position.z = -0.15;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.15), wood);
    grip.position.set(0, -0.2, 0); grip.rotation.x = 0.4;

    gun.add(barrel, body, grip);
    gun.position.set(0.6, -0.35, -0.8);

    weaponGroup.add(arm, gun);
    camera.add(weaponGroup); // FIX: Adicionado diretamente à câmera para FPS real
}
createWeapon();

// --- 3. BOT HUMANOIDE AVANÇADO ---
class ArenaBot {
    constructor() {
        this.group = new THREE.Group();
        this.hp = 100;
        this.lastShot = 0;
        this.isFlashing = false;
        this.strafeDir = 1;
        this.lastStrafeChange = 0;
        this.lastVisibleTime = 0;
        this.isPlayerVisible = false;

        const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69 });
        const clothes = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333 });

        // Corpo
        this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), clothes);
        this.torso.position.y = 1.25;
        this.head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
        this.head.position.y = 1.9;

        // Membros
        const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.25), clothes); lLeg.position.set(-0.18, 0.4, 0);
        const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.25), clothes); rLeg.position.set(0.18, 0.4, 0);
        const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), skin); lArm.position.set(-0.4, 1.3, 0);
        this.rArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), skin); this.rArm.position.set(0.4, 1.3, 0);

        // Arma na Mão
        this.weaponGroup = new THREE.Group();
        const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.6), gunMat);
        gunBody.position.z = -0.3;
        this.weaponGroup.add(gunBody);
        this.weaponGroup.position.set(0.4, 1.3, -0.2); // Na mão direita

        // Muzzle Flash
        this.muzzleFlash = new THREE.PointLight(0xffaa00, 0, 3);
        this.muzzleFlash.position.set(0.4, 1.35, -0.8);
        scene.add(this.muzzleFlash);

        this.group.add(this.torso, this.head, lLeg, rLeg, lArm, this.rArm, this.weaponGroup);
        scene.add(this.group);
        this.respawn();
    }

    respawn() {
        this.hp = 100; botHp = 100;
        this.group.visible = true;
        this.group.position.set((Math.random() - 0.5) * 30, 0, -15);
        updateUI();
    }

    onHit(dmg) {
        this.hp -= dmg; botHp = this.hp;
        updateUI();
        if (!this.isFlashing) {
            this.isFlashing = true;
            this.torso.material.color.set(0xff0000);
            setTimeout(() => { if (this.torso) this.torso.material.color.set(0x1a1a1a); this.isFlashing = false; }, 100);
        }
        if (this.hp <= 0) { this.group.visible = false; checkGameState(); }
    }

    update() {
        if (!this.group.visible || gameState !== 'PLAYING') return;

        const dist = this.group.position.distanceTo(camera.position);
        const toPlayer = new THREE.Vector3().subVectors(camera.position, this.group.position).normalize();
        this.group.lookAt(camera.position.x, this.group.position.y, camera.position.z);

        // Raycast Profissional para Visibilidade e Colisão de Tiro
        const eyePos = this.group.position.clone().add(new THREE.Vector3(0, 1.7, 0));
        const raycaster = new THREE.Raycaster(eyePos, toPlayer);
        const intersects = raycaster.intersectObjects(solidObjects, true);

        const wasVisible = this.isPlayerVisible;
        this.isPlayerVisible = (intersects.length === 0 || intersects[0].distance > dist);

        if (this.isPlayerVisible && !wasVisible) {
            this.lastVisibleTime = Date.now(); // Inicia tempo de reação
        }

        // IA de Movimentação com "Anti-Ghosting"
        if (dist > STATS.BOT.STOP_DIST || !this.isPlayerVisible) {
            const moveVec = new THREE.Vector3(toPlayer.x, 0, toPlayer.z).multiplyScalar(STATS.BOT.SPEED);
            if (!this.checkCollision(moveVec)) {
                this.group.position.add(moveVec);
            }
        }

        // Strafing (Movimento Lateral) com Colisão
        if (Date.now() - this.lastStrafeChange > 1500 + Math.random() * 2000) {
            this.strafeDir *= -1;
            this.lastStrafeChange = Date.now();
        }
        const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), toPlayer).normalize();
        const strafeVec = right.multiplyScalar(this.strafeDir * STATS.BOT.STRAFE_SPEED);
        if (!this.checkCollision(strafeVec)) {
            this.group.position.add(strafeVec);
        }

        // Lógica de Ataque (1s de cooldown + 0.5s de reação)
        if (this.isPlayerVisible && (Date.now() - this.lastVisibleTime > STATS.BOT.REACTION) && (Date.now() - this.lastShot > 1000)) {
            this.lastShot = Date.now();

            // Muzzle Flash Visual
            this.muzzleFlash.intensity = 10;
            const flashPos = this.group.position.clone().add(new THREE.Vector3(0, 1.35, 0)).add(toPlayer.clone().multiplyScalar(0.8));
            this.muzzleFlash.position.copy(flashPos);

            const flashMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
            flashMesh.position.copy(flashPos);
            scene.add(flashMesh);
            setTimeout(() => {
                this.muzzleFlash.intensity = 0;
                scene.remove(flashMesh);
            }, 50);

            // Cálulo de Precisão Dinâmica (Inaccuracy Offset)
            const baseAcc = (isMoving || isJumping) ? STATS.BOT.ACCURACY_MOVING : STATS.BOT.ACCURACY_BASE;
            const playerVelFactor = isMoving ? 0.3 : 0;
            const hitChance = baseAcc - playerVelFactor;

            if (Math.random() < hitChance) {
                playerHp -= STATS.BOT.DAMAGE;
                document.body.style.boxShadow = "inset 0 0 50px #ff0000";
                setTimeout(() => document.body.style.boxShadow = "none", 100);
                updateUI();
                checkGameState();
            }
        }
    }

    checkCollision(vec) {
        const nextPos = this.group.position.clone().add(vec);
        const botBox = new THREE.Box3().setFromCenterAndSize(
            nextPos.clone().add(new THREE.Vector3(0, 1, 0)),
            new THREE.Vector3(1, 2, 1)
        );
        return obstacleBoxes.some(box => box.intersectsBox(botBox));
    }
}

// --- MECÂNICAS ---
function handleShoot() {
    if (gameState !== 'PLAYING' || isReloading || currentMag <= 0) return;
    currentMag--; updateUI();
    recoilGroup.rotation.x += 0.15;
    weaponGroup.position.z += 0.05;

    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const wallHits = ray.intersectObjects(solidObjects, true);
    const wallDist = wallHits.length > 0 ? wallHits[0].distance : Infinity;

    bots.forEach(b => {
        if (b.group.visible) {
            const hit = ray.intersectObject(b.group, true);
            // Bloqueio de Tiro: Se houver obstáculo entre o atirador e o alvo, o tiro não conta
            if (hit.length > 0 && hit[0].distance < wallDist) {
                b.onHit(STATS.PLAYER.DAMAGE);
            }
        }
    });
}

function updateUI() {
    const p = document.getElementById('player-health-fill');
    const b = document.getElementById('bot-health-fill');
    if (p) p.style.width = Math.max(0, playerHp) + '%';
    if (b) b.style.width = Math.max(0, botHp) + '%';
    const ammoCount = document.getElementById('ammo-count');
    const ammoTotal = document.getElementById('total-ammo');
    if (ammoCount) ammoCount.innerText = currentMag;
    if (ammoTotal) ammoTotal.innerText = reserveAmmo + currentMag;
}

function checkGameState() {
    if (playerHp <= 0 && gameState === 'PLAYING') {
        gameState = 'GAMEOVER';
        document.getElementById('game-over-overlay').classList.remove('hidden');
        controls.unlock();
    }
    if (botHp <= 0 && gameState === 'PLAYING') {
        gameState = 'VICTORY';
        document.getElementById('victory-overlay').classList.remove('hidden');
        controls.unlock();
    }
}

function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        move();
        bots.forEach(b => b.update());
        recoilGroup.rotation.x *= 0.9;
        weaponGroup.position.z *= 0.85;
        weaponGroup.position.y = Math.sin(Date.now() * 0.005) * 0.01; // Bobbing effect
    }
    renderer.render(scene, camera);
}

function move() {
    if (!controls.isLocked) return;
    const mv = new THREE.Vector3();
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    f.y = 0; r.y = 0; f.normalize(); r.normalize();

    isMoving = false;
    if (keys['KeyW']) { mv.add(f); isMoving = true; }
    if (keys['KeyS']) { mv.sub(f); isMoving = true; }
    if (keys['KeyA']) { mv.sub(r); isMoving = true; }
    if (keys['KeyD']) { mv.add(r); isMoving = true; }

    if (isMoving) {
        const moveVec = mv.normalize().multiplyScalar(STATS.PLAYER.SPEED);
        // Colisão Player (Box Checking)
        const nextPos = camera.position.clone().add(moveVec);
        const playerBox = new THREE.Box3().setFromCenterAndSize(
            nextPos,
            new THREE.Vector3(1, 2, 1)
        );

        const collision = obstacleBoxes.some(box => box.intersectsBox(playerBox));
        if (!collision) {
            camera.position.add(moveVec);
        }
    }

    // Pulo
    if (keys['Space'] && !isJumping) {
        isJumping = true;
        let v0 = 0.15;
        const jumpInterval = setInterval(() => {
            camera.position.y += v0;
            v0 -= 0.01;
            if (camera.position.y <= 1.7) {
                camera.position.y = 1.7;
                isJumping = false;
                clearInterval(jumpInterval);
            }
        }, 16);
    }
}

// INICIALIZAÇÃO
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', e => { if (e.button === 0) handleShoot(); });

// Listeners de UI
document.getElementById('start-btn').addEventListener('click', () => resetGame());
document.getElementById('retry-btn').addEventListener('click', () => resetGame());
document.getElementById('reset-btn').addEventListener('click', () => resetGame());

function resetGame() {
    // RESET TOTAL
    playerHp = 100; botHp = 100;
    currentMag = STATS.PLAYER.MAG;
    reserveAmmo = STATS.PLAYER.TOTAL - STATS.PLAYER.MAG;

    document.getElementById('start-overlay').classList.add('hidden');
    document.getElementById('game-over-overlay').classList.add('hidden');
    document.getElementById('victory-overlay').classList.add('hidden');

    gameState = 'PLAYING';
    camera.position.set(0, 1.7, 12);

    // Regenerar Mapa
    generateMap();

    // Reset Bots
    bots.forEach(b => b.respawn());

    controls.lock();
    updateUI();
}

generateMap();
bots = [new ArenaBot()];
loop();
