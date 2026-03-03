import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D (V.2026) - HIGH FIDELITY SPEC
 * Developed by AntiGravity
 */

// --- COMBAT STATS (V.2026) ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 30, SPEED: 0.16, MAG_SIZE: 10, TOTAL_RESERVE: 20 },
    BOT: { HP: 100, DAMAGE: 40, SPEED: 0.09, ACCURACY: 0.85, MAG_SIZE: 10, RELOAD_TIME: 2500 }
};

// --- SYSTEM STATE ---
let gameState = 'START';
let playerHp = 100;
let botHp = 100;
let currentMag = STATS.PLAYER.MAG_SIZE;
let reserveAmmo = STATS.PLAYER.TOTAL_RESERVE;
let isReloading = false;
let botAmmo = STATS.BOT.MAG_SIZE;
let botIsReloading = false;
let lastBotShot = 0;
let obstacles = [];
const keys = {};

// --- THREE.JS SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020208);
scene.fog = new THREE.Fog(0x020208, 0, 50);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.getElementById('game-container').appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);

// --- LIGHTING ---
const ambient = new THREE.HemisphereLight(0xffffff, 0x080820, 0.5);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffeebb, 0.8);
sun.position.set(10, 20, 10);
sun.castShadow = true;
sun.shadow.mapSize.width = 1024;
sun.shadow.mapSize.height = 1024;
scene.add(sun);

// --- PLAYER WEAPON (Magnum .357 High-Fi) ---
const weapon = new THREE.Group();
const createWeapon = () => {
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), gunMat);
    barrel.position.z = -0.3;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), gunMat);
    cyl.rotation.x = Math.PI / 2;
    cyl.position.z = -0.15;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.15), new THREE.MeshStandardMaterial({ color: 0x331100 }));
    grip.position.set(0, -0.2, -0.1);
    grip.rotation.x = 0.2;
    weapon.add(barrel, cyl, grip);
    weapon.position.set(0.35, -0.25, -0.4);
    camera.add(weapon);
    scene.add(camera);
};
createWeapon();

// --- MAP GENERATION (Procedural V.2026) ---
function generateMap() {
    obstacles.forEach(o => scene.remove(o));
    obstacles = [];

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(80, 80),
        new THREE.MeshStandardMaterial({ color: 0x111122, roughness: 0.8, metalness: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const addObj = (mesh, x, z) => {
        mesh.position.set(x, mesh.geometry.parameters.height / 2 || 2.5, z);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);
        obstacles.push(mesh);
    };

    // Barriers: Concrete Walls
    for (let i = 0; i < 6; i++) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 1), new THREE.MeshStandardMaterial({ color: 0x444455 }));
        addObj(wall, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30);
    }
    // Trees and Rocks
    for (let i = 0; i < 10; i++) {
        if (Math.random() > 0.5) {
            const tree = new THREE.Group();
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 5, 8), new THREE.MeshStandardMaterial({ color: 0x3d2b1f }));
            const leave = new THREE.Mesh(new THREE.ConeGeometry(2, 4, 8), new THREE.MeshStandardMaterial({ color: 0x0a3d0a }));
            leave.position.y = 3; tree.add(trunk, leave);
            tree.position.set((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 40);
            scene.add(tree); obstacles.push(trunk);
        } else {
            const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5 + Math.random() * 2), new THREE.MeshStandardMaterial({ color: 0x555555 }));
            rock.position.set((Math.random() - 0.5) * 40, 1, (Math.random() - 0.5) * 40);
            scene.add(rock); obstacles.push(rock);
        }
    }
}

// --- BOT SNIPER AI ---
class SniperBot {
    constructor() {
        this.mesh = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x660066 });
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.2), mat);
        body.position.y = 1;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
        head.position.y = 2;
        this.arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.6), mat);
        this.arm.position.set(0.5, 1.4, 0);
        this.mesh.add(body, head, this.arm);
        scene.add(this.mesh);
        this.ray = new THREE.Raycaster();
        this.reset();
    }
    reset() {
        this.mesh.position.set((Math.random() - 0.5) * 30, 0, -15);
        this.mesh.visible = true; botHp = 100; botAmmo = 10;
    }
    update() {
        if (gameState !== 'PLAYING' || botHp <= 0) return;
        const dist = this.mesh.position.distanceTo(camera.position);
        const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();
        this.ray.set(this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)), dir);
        const hits = this.ray.intersectObjects(obstacles, true);
        const hasLoS = hits.length === 0 || hits[0].distance > dist;

        if (hasLoS) {
            this.mesh.lookAt(camera.position.x, 0, camera.position.z);
            this.arm.lookAt(camera.position);
            if (dist > 8) this.mesh.position.addScaledVector(dir, STATS.BOT.SPEED);
            if (!botIsReloading && Date.now() - lastBotShot > 1400) this.shoot();
        } else {
            this.mesh.position.x += Math.sin(Date.now() * 0.001) * 0.05; // Patrol
        }
    }
    shoot() {
        if (botAmmo <= 0) {
            botIsReloading = true;
            setTimeout(() => { botAmmo = 10; botIsReloading = false; }, STATS.BOT.RELOAD_TIME);
            return;
        }
        botAmmo--; lastBotShot = Date.now();
        if (Math.random() < STATS.BOT.ACCURACY) {
            playerHp -= STATS.BOT.DAMAGE; checkGameState();
        }
    }
}
const bot = new SniperBot();

// --- GAMEPLAY CORE ---
function checkGameState() {
    document.getElementById('player-health-fill').style.width = playerHp + '%';
    document.getElementById('bot-health-fill').style.width = botHp + '%';
    document.getElementById('ammo-count').innerText = currentMag;
    document.getElementById('total-ammo').innerText = reserveAmmo;

    if (playerHp <= 0 && gameState === 'PLAYING') {
        gameState = 'GAMEOVER';
        document.getElementById('game-over-overlay').classList.remove('hidden');
        controls.unlock();
    }
    if (botHp <= 0 && gameState === 'PLAYING') {
        gameState = 'VICTORY';
        victoryDance();
    }
}

function handleShoot() {
    if (isReloading || gameState !== 'PLAYING' || currentMag <= 0) return;
    currentMag--;
    weapon.position.z += 0.2; // Kickback
    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    ray.set(camera.position, dir);
    const hitsBot = ray.intersectObject(bot.mesh, true);
    const hitsObs = ray.intersectObjects(obstacles, true);
    if (hitsBot.length > 0 && (hitsObs.length === 0 || hitsObs[0].distance > hitsBot[0].distance)) {
        botHp -= STATS.PLAYER.DAMAGE;
    }
    checkGameState();
    if (currentMag === 0) handleReload();
}

function handleReload() {
    if (isReloading || reserveAmmo <= 0) return;
    isReloading = true;
    const initialY = weapon.position.y;
    // Reload animation
    const reloadLoop = () => {
        weapon.position.y -= 0.04;
        if (weapon.position.y > -1.2) requestAnimationFrame(reloadLoop);
        else {
            setTimeout(() => {
                reserveAmmo -= 10; currentMag = 10;
                weapon.position.y = initialY;
                isReloading = false; checkGameState();
            }, 1000);
        }
    }
    reloadLoop();
}

function victoryDance() {
    document.getElementById('victory-overlay').classList.remove('hidden');
    document.getElementById('dally-audio').play();
    controls.unlock();

    // Change to 3rd person and dance
    const playerModel = bot.mesh.clone(); // Pseudo-player model
    playerModel.visible = true; playerModel.position.set(0, 0, 0); scene.add(playerModel);

    const targetCamPos = new THREE.Vector3(0, 3, 6);
    const danceLoop = () => {
        if (gameState !== 'VICTORY') return;
        camera.position.lerp(targetCamPos, 0.05);
        camera.lookAt(playerModel.position.x, 1.5, playerModel.position.z);
        playerModel.rotation.y += 0.1;
        playerModel.position.y = Math.abs(Math.sin(Date.now() * 0.01)) * 0.5;
        renderer.render(scene, camera);
        requestAnimationFrame(danceLoop);
    }
    danceLoop();
}

// --- INPUTS & ENGINE ---
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', (e) => { if (e.button === 0) handleShoot(); });

function move() {
    const dir = new THREE.Vector3();
    const f = (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0);
    const s = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);
    dir.set(s, 0, f).normalize().multiplyScalar(STATS.PLAYER.SPEED).applyQuaternion(camera.quaternion);
    dir.y = 0;
    const np = camera.position.clone().add(dir);
    let collide = false;
    obstacles.forEach(o => { if (np.distanceTo(o.position) < 2) collide = true; });
    if (!collide) camera.position.add(dir);
}

function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        move();
        bot.update();
        weapon.position.z += (-0.4 - weapon.position.z) * 0.1; // Smooth Reset
        renderer.render(scene, camera);
    } else if (gameState === 'START') {
        renderer.render(scene, camera);
    }
}

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-overlay').classList.add('hidden');
    camera.position.set(0, 1.7, 10);
    gameState = 'PLAYING';
    controls.lock();
    loop();
});

document.getElementById('retry-btn').addEventListener('click', () => location.reload());
generateMap();
checkGameState();
bot.reset();
