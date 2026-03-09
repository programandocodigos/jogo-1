import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

console.log("BOX FIGHT 3D - RECONSTRUÇÃO TOTAL V3.0 (ULTIMATO) ATIVADA");

// --- CONFIGURAÇÕES GLOBAIS ---
const STATS = {
    PLAYER: { HP: 100, SPEED: 0.16, RELOAD: 2500, HEIGHT: 1.7 },
    WEAPONS: {
        MAGNUM: {
            DAMAGE: 30, MAG: 10, TOTAL: 40, RATE: 400, AUTO: false,
            MODEL_COLOR: 0x444444, SCALE: 1.0,
            URL: 'https://cdn.pixabay.com/audio/2022/03/10/audio_783d10a102.mp3'
        },
        RIFLE: {
            DAMAGE: 15, MAG: 20, TOTAL: 80, RATE: 100, AUTO: true,
            MODEL_COLOR: 0x1a1a1a, SCALE: 1.2,
            URL: 'https://cdn.pixabay.com/audio/2022/03/10/audio_783d10a102.mp3'
        }
    },
    BOT: {
        HP: 100, DAMAGE: 25, SPEED: 0.08, ACCURACY: 0.4, SPREAD: 0.04,
        REACTION: 500, STOP_DIST: 10, STRAFE_SPEED: 0.06
    }
};

const UNLOCKED_WEAPONS = ['MAGNUM'];

// --- ESTADO DO JOGO ---
let gameState = 'START';
let currentPhase = 1;
let coins = 0;
let playerHp = 100;
let currentMag = 10;
let reserveAmmo = 30;
let isReloading = false;
let currentWeapon = 'MAGNUM';
let isMouseDown = false;
let lastFireTime = 0;
let isMoving = false;
let isJumping = false;
const keys = {};
let botsArray = [];
let solidObjects = [];
let obstacleBoxes = [];

// --- ÁUDIO ---
const sfxShot = new Audio('https://cdn.pixabay.com/audio/2022/03/10/audio_783d10a102.mp3');
const sfxClick = new Audio('assets/click.mp3');
const sfxReload = new Audio('assets/reload.mp3');
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

controls.addEventListener('lock', () => {
    if (gameState === 'PLAYING') {
        document.getElementById('pause-overlay').classList.add('hidden');
    }
});

controls.addEventListener('unlock', () => {
    if (gameState === 'PLAYING') {
        document.getElementById('pause-overlay').classList.remove('hidden');
    }
});

// Luzes
scene.add(new THREE.HemisphereLight(0xffffff, 0x080820, 0.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(30, 50, 20);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
scene.add(sun);

// --- MAPA (RECONSTRUÇÃO) ---
function generateMap() {
    // Limpeza
    solidObjects.forEach(o => scene.remove(o));
    solidObjects = []; obstacleBoxes = [];

    // Solo (Grama Verde)
    const floorGeo = new THREE.PlaneGeometry(150, 150);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a4a1a }); // Verde Escuro
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Tufos de Grama
    for (let i = 0; i < 300; i++) {
        const tuf = new THREE.Mesh(
            new THREE.PlaneGeometry(0.3, 0.5),
            new THREE.MeshBasicMaterial({ color: 0x2d5a27, side: THREE.DoubleSide })
        );
        tuf.position.set((Math.random() - 0.5) * 140, 0.25, (Math.random() - 0.5) * 140);
        tuf.rotation.y = Math.random() * Math.PI;
        scene.add(tuf);
    }

    const addObstacle = (mesh, x, z, y = 0) => {
        mesh.position.set(x, y, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
        solidObjects.push(mesh);
        obstacleBoxes.push(new THREE.Box3().setFromObject(mesh));
    };

    // Árvores (Tronco + Copa)
    for (let i = 0; i < 25; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 5), new THREE.MeshStandardMaterial({ color: 0x3d2b1f }));
        trunk.position.y = 2.5;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 8), new THREE.MeshStandardMaterial({ color: 0x0a5d0a }));
        leaves.position.y = 7;
        tree.add(trunk, leaves);
        addObstacle(tree, (Math.random() - 0.5) * 120, (Math.random() - 0.5) * 120);
    }

    // Pedras Altas (Cinza)
    for (let i = 0; i < 18; i++) {
        const h = 6 + Math.random() * 6;
        const rock = new THREE.Mesh(
            new THREE.BoxGeometry(5, h, 5),
            new THREE.MeshStandardMaterial({ color: 0x555555 })
        );
        addObstacle(rock, (Math.random() - 0.5) * 110, (Math.random() - 0.5) * 110, h / 2);
    }
}

// --- BOT HUMANOIDE (FIX REGRESSÃO) ---
class ArenaBot {
    constructor() {
        this.group = new THREE.Group();
        this.hp = 100;
        this.lastShot = 0;
        this.strafeDir = Math.random() < 0.5 ? 1 : -1;
        this.lastStrafeChange = 0;
        this.lastVisibleTime = 0;
        this.isPlayerVisible = false;

        const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69 });
        const clothes = new THREE.MeshStandardMaterial({ color: 0x111111 });

        // Tronco
        this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.35), clothes);
        this.torso.position.y = 1.35;

        // Cabeça
        this.head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), skin);
        this.head.position.y = 2.05;

        // Braços
        const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), skin);
        lArm.position.set(-0.4, 1.3, 0);
        const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), skin);
        rArm.position.set(0.4, 1.3, 0);

        // Pernas
        const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.9, 0.24), clothes);
        lLeg.position.set(-0.18, 0.45, 0);
        const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.9, 0.24), clothes);
        rLeg.position.set(0.18, 0.45, 0);

        // Arma
        const botGun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.6), new THREE.MeshBasicMaterial({ color: 0x000 }));
        botGun.position.set(0.4, 1.3, -0.3);

        this.group.add(this.torso, this.head, lArm, rArm, lLeg, rLeg, botGun);
        scene.add(this.group);
        this.respawn();
    }

    respawn() {
        this.hp = 100;
        this.group.visible = true;
        this.torso.material.color.set(0x111111);
        const rx = (Math.random() - 0.5) * 60;
        const rz = (Math.random() - 0.5) * 40 - 25;
        this.group.position.set(rx, 0, rz); // PÉS NO CHÃO (y=0)
    }

    onHit(dmg) {
        this.hp -= dmg;
        this.torso.material.color.set(0xff0000); // Feedback visual
        setTimeout(() => { if (this.group.visible) this.torso.material.color.set(0x111111); }, 100);

        if (this.hp <= 0) {
            this.group.visible = false;
            coins += 50;
            updateUI();
            checkGameState();
        }
    }

    update() {
        if (!this.group.visible || gameState !== 'PLAYING') return;

        const dist = this.group.position.distanceTo(camera.position);
        const toPlayer = new THREE.Vector3().subVectors(camera.position, this.group.position).normalize();

        // Olhar para o jogador
        this.group.lookAt(camera.position.x, 0, camera.position.z);

        // Raycast de Visibilidade
        const ray = new THREE.Raycaster(this.group.position.clone().add(new THREE.Vector3(0, 1.7, 0)), toPlayer);
        const inters = ray.intersectObjects(solidObjects, true);
        this.isPlayerVisible = (inters.length === 0 || inters[0].distance > dist);

        // Movimento (Frente/Trás)
        if (dist > STATS.BOT.STOP_DIST || !this.isPlayerVisible) {
            const nextMove = new THREE.Vector3(toPlayer.x, 0, toPlayer.z).multiplyScalar(STATS.BOT.SPEED);
            if (!this.checkWall(nextMove)) this.group.position.add(nextMove);
        }

        // Strafing (Lateral)
        if (Date.now() - this.lastStrafeChange > 1500 + Math.random() * 2000) {
            this.strafeDir *= -1; this.lastStrafeChange = Date.now();
        }
        const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), toPlayer).normalize();
        const lateralMove = right.multiplyScalar(this.strafeDir * STATS.BOT.STRAFE_SPEED);
        if (!this.checkWall(lateralMove)) this.group.position.add(lateralMove);

        // Tiro do Bot
        if (this.isPlayerVisible && Date.now() - this.lastShot > 1200) {
            this.lastShot = Date.now();
            if (Math.random() < STATS.BOT.ACCURACY) {
                playerHp -= STATS.BOT.DAMAGE;
                document.body.style.boxShadow = "inset 0 0 40px #ff0000";
                setTimeout(() => document.body.style.boxShadow = "none", 100);
                updateUI();
                checkGameState();
            }
        }
    }

    checkWall(vec) {
        const nextX = this.group.position.x + vec.x;
        const nextZ = this.group.position.z + vec.z;
        const p = new THREE.Vector3(nextX, 0, nextZ);
        const b = new THREE.Box3().setFromCenterAndSize(p.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(1, 2, 1));
        return obstacleBoxes.some(rock => rock.intersectsBox(b));
    }
}

// --- ARSENAL JOGADOR ---
const weaponGroup = new THREE.Group();
camera.add(weaponGroup);

function createWeaponModel() {
    weaponGroup.clear();
    const stats = STATS.WEAPONS[currentWeapon];
    const wood = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });
    const iron = new THREE.MeshStandardMaterial({ color: stats.MODEL_COLOR, metalness: 0.9, roughness: 0.1 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xe0ac69 });

    // Braço
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.2), skin);
    arm.position.set(0.6, -0.5, -0.6);
    weaponGroup.add(arm);

    const gunGroup = new THREE.Group();
    if (currentWeapon === 'MAGNUM') {
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.7), iron);
        barrel.position.z = -0.5;
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), iron);
        body.rotation.x = Math.PI / 2; body.position.z = -0.15;
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.12), wood);
        grip.position.set(0, -0.2, 0); grip.rotation.x = 0.3;
        gunGroup.add(barrel, body, grip);
    } else {
        // Rifle
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 1.3), iron);
        body.position.z = -0.5;
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.4, 0.2), iron);
        mag.position.set(0, -0.3, -0.4); mag.rotation.x = 0.2;
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1), iron);
        barrel.rotation.x = Math.PI / 2; barrel.position.z = -1.2;
        const stockNode = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.25, 0.4), wood);
        stockNode.position.set(0, -0.1, 0.2);
        gunGroup.add(body, mag, barrel, stockNode);
    }
    gunGroup.position.set(0.6, -0.35, -1.0);
    weaponGroup.add(gunGroup);
}

// --- MECÂNICAS ---
function handleShoot() {
    if (gameState !== 'PLAYING' || isReloading) return;
    const stats = STATS.WEAPONS[currentWeapon];

    if (Date.now() - lastFireTime < stats.RATE) return;

    if (currentMag <= 0) {
        playSfx('click');
        if (reserveAmmo > 0) handleReload();
        return;
    }

    playSfx('shot');
    currentMag--;
    lastFireTime = Date.now();
    updateUI();

    // Recoil Visual
    recoilGroup.rotation.x += 0.1;
    weaponGroup.position.z += 0.05;

    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const wallHits = ray.intersectObjects(solidObjects, true);
    const wallDist = wallHits.length > 0 ? wallHits[0].distance : Infinity;

    botsArray.forEach(b => {
        if (b.group.visible) {
            const hit = ray.intersectObject(b.group, true);
            if (hit.length > 0 && hit[0].distance < wallDist) {
                b.onHit(stats.DAMAGE);
            }
        }
    });

    if (currentMag === 0 && reserveAmmo > 0) handleReload();
}

function handleReload() {
    if (isReloading || reserveAmmo <= 0) return;
    const stats = STATS.WEAPONS[currentWeapon];
    isReloading = true;
    playSfx('reload');
    weaponGroup.position.y -= 0.3;

    setTimeout(() => {
        const need = stats.MAG - currentMag;
        const load = Math.min(need, reserveAmmo);
        currentMag += load; reserveAmmo -= load;
        isReloading = false;
        weaponGroup.position.y += 0.3;
        updateUI();
    }, STATS.PLAYER.RELOAD);
}

function updateUI() {
    document.getElementById('player-health-fill').style.width = Math.max(0, playerHp) + '%';
    document.getElementById('coin-count').innerText = coins;
    document.getElementById('ammo-count').innerText = currentMag;
    document.getElementById('total-ammo').innerText = reserveAmmo;
    document.getElementById('phase-display').innerText = `FASE ${currentPhase}`;

    // Atualizar Loja
    const buyPistolBtn = document.getElementById('buy-pistol');
    buyPistolBtn.innerText = currentWeapon === 'MAGNUM' ? "EQUIPADO" : "EQUIPAR";
    buyPistolBtn.classList.toggle('bought', currentWeapon === 'MAGNUM');
    buyPistolBtn.disabled = false; // Permitir equipar de volta

    const buyRifleBtn = document.getElementById('buy-rifle');
    if (UNLOCKED_WEAPONS.includes('RIFLE')) {
        buyRifleBtn.innerText = currentWeapon === 'RIFLE' ? "EQUIPADO" : "EQUIPAR";
        buyRifleBtn.classList.add('bought');
        buyRifleBtn.style.background = currentWeapon === 'RIFLE' ? "#475569" : "#fbbf24";
    } else {
        buyRifleBtn.innerText = "COMPRAR (50 MOEDAS)";
        buyRifleBtn.classList.remove('bought');
        buyRifleBtn.style.background = "#fbbf24";
    }

    const targetBot = botsArray.find(b => b.group.visible) || botsArray[0];
    if (targetBot) document.getElementById('bot-health-fill').style.width = Math.max(0, targetBot.hp) + '%';
}

function checkGameState() {
    if (playerHp <= 0) {
        gameState = 'GAMEOVER';
        document.getElementById('game-over-overlay').classList.remove('hidden');
        controls.unlock();
        return;
    }
    const allDead = botsArray.every(b => !b.group.visible);
    if (allDead && gameState === 'PLAYING') {
        gameState = 'VICTORY';
        if (sfxVictory) sfxVictory.play().catch(() => { });
        document.getElementById('victory-overlay').classList.remove('hidden');
        controls.unlock();
    }
}

function startPhase(phase) {
    currentPhase = phase;
    playerHp = 100;
    const stats = STATS.WEAPONS[currentWeapon];
    currentMag = stats.MAG;
    reserveAmmo = stats.TOTAL - stats.MAG;
    isReloading = false;

    document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden'));
    gameState = 'PLAYING';
    camera.position.set(0, 1.7, 15);

    generateMap();
    botsArray.forEach(b => scene.remove(b.group));
    botsArray = [];
    const count = (phase === 1) ? 1 : 2;
    for (let i = 0; i < count; i++) botsArray.push(new ArenaBot());

    controls.lock();
    updateUI();
    createWeaponModel();
}

// --- LOJA ---
document.getElementById('shop-btn-vic').onclick = () => document.getElementById('shop-overlay').classList.remove('hidden');
document.getElementById('close-shop').onclick = () => document.getElementById('shop-overlay').classList.add('hidden');

document.getElementById('buy-pistol').onclick = () => {
    if (currentWeapon === 'MAGNUM') return;
    currentWeapon = 'MAGNUM';
    const stats = STATS.WEAPONS[currentWeapon];
    currentMag = stats.MAG;
    reserveAmmo = stats.TOTAL - stats.MAG;
    createWeaponModel();
    updateUI();
    playSfx('click');
};
document.getElementById('buy-rifle').onclick = () => {
    if (currentWeapon === 'RIFLE') return;
    if (UNLOCKED_WEAPONS.includes('RIFLE')) {
        currentWeapon = 'RIFLE';
        const stats = STATS.WEAPONS[currentWeapon];
        currentMag = stats.MAG;
        reserveAmmo = stats.TOTAL - stats.MAG;
        createWeaponModel();
        updateUI();
        playSfx('click');
    } else if (coins >= 50) {
        coins -= 50;
        UNLOCKED_WEAPONS.push('RIFLE');
        currentWeapon = 'RIFLE';
        const stats = STATS.WEAPONS[currentWeapon];
        currentMag = stats.MAG;
        reserveAmmo = stats.TOTAL - stats.MAG;
        createWeaponModel();
        updateUI();
        playSfx('reload');
    } else {
        alert("MOEDAS INSUFICIENTES!");
    }
};

// --- CONTROLES ---
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR') handleReload();
});
window.addEventListener('keyup', e => keys[e.code] = false);

window.addEventListener('mousedown', e => {
    if (e.button === 0) {
        isMouseDown = true;
        // Destrava áudio
        [sfxShot, sfxClick, sfxReload].forEach(a => {
            a.play().then(() => { a.pause(); a.currentTime = 0; }).catch(() => { });
        });
        if (!STATS.WEAPONS[currentWeapon].AUTO) handleShoot();
    }
});
window.addEventListener('mouseup', e => { if (e.button === 0) isMouseDown = false; });

document.getElementById('start-btn').onclick = () => startPhase(1);
document.getElementById('retry-btn').onclick = () => startPhase(currentPhase);
document.getElementById('next-phase-btn').onclick = () => startPhase(2);
document.getElementById('reset-btn').onclick = () => {
    coins = 0; currentWeapon = 'MAGNUM'; startPhase(1);
};
document.getElementById('resume-btn').onclick = () => controls.lock();
document.getElementById('buy-medkit').onclick = () => {
    if (coins >= 30 && playerHp < 100) {
        coins -= 30;
        playerHp = Math.min(100, playerHp + 50);
        updateUI();
        playSfx('reload');
    } else if (playerHp >= 100) {
        alert("SANGUE JÁ ESTÁ NO MÁXIMO!");
    } else {
        alert("MOEDAS INSUFICIENTES!");
    }
};

// --- LOOP PRINCIPAL ---
function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        movePlayer();
        botsArray.forEach(b => b.update());

        // Fogo Automático
        if (isMouseDown && STATS.WEAPONS[currentWeapon].AUTO) handleShoot();

        // Efeitos Visuais Arma
        recoilGroup.rotation.x *= 0.9;
        weaponGroup.position.z *= 0.8;
        weaponGroup.position.y = Math.sin(Date.now() * 0.005) * 0.01;
    }
    renderer.render(scene, camera);
}

function movePlayer() {
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
        const vel = mv.normalize().multiplyScalar(STATS.PLAYER.SPEED);
        const next = camera.position.clone().add(vel);
        const pBox = new THREE.Box3().setFromCenterAndSize(next, new THREE.Vector3(1, 2, 1));
        if (!obstacleBoxes.some(rock => rock.intersectsBox(pBox))) camera.position.add(vel);
    }

    if (keys['Space'] && !isJumping) {
        isJumping = true;
        let v = 0.16;
        const j = setInterval(() => {
            camera.position.y += v; v -= 0.01;
            if (camera.position.y <= 1.7) { camera.position.y = 1.7; isJumping = false; clearInterval(j); }
        }, 16);
    }
}

// Início
generateMap();
createWeaponModel();
loop();
