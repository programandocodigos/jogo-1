import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D (V.2026) - MEME 67 & HUMANOID EDITION
 * Developed by AntiGravity
 */

// --- COMBAT STATS (V.2026) ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 30, SPEED: 0.16, MAG_SIZE: 10, TOTAL_RESERVE: 20 },
    BOT: { HP: 100, DAMAGE: 40, SPEED: 0.095, ACCURACY: 0.88, MAG_SIZE: 10, RELOAD_TIME: 2500 }
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
const ambient = new THREE.HemisphereLight(0xffffff, 0x080820, 0.6);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff0ee, 1.0);
sun.position.set(20, 30, 10);
sun.castShadow = true;
sun.shadow.mapSize.width = 2048;
sun.shadow.mapSize.height = 2048;
scene.add(sun);

// --- PLAYER WEAPON ---
const weaponProxy = new THREE.Group();
const createWeapon = () => {
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.1 });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.6), gunMat);
    barrel.position.z = -0.3;
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 8), gunMat);
    cyl.rotation.x = Math.PI / 2; cyl.position.z = -0.15;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.15), new THREE.MeshStandardMaterial({ color: 0x221100 }));
    grip.position.set(0, -0.2, -0.1); grip.rotation.x = 0.2;
    weaponProxy.add(barrel, cyl, grip);
    weaponProxy.position.set(0.35, -0.25, -0.4);
    camera.add(weaponProxy);
    scene.add(camera);
};
createWeapon();

// --- MAP GENERATION (Procedural) ---
function generateMap() {
    obstacles.forEach(o => scene.remove(o));
    obstacles = [];

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(100, 100),
        new THREE.MeshStandardMaterial({ color: 0x0a0a15, roughness: 0.9, metalness: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const addObj = (obj, x, z) => {
        obj.position.set(x, 0, z);
        obj.castShadow = true;
        obj.receiveShadow = true;
        scene.add(obj);
        obstacles.push(obj);
    };

    // Concrete Walls
    for (let i = 0; i < 8; i++) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 1.5), new THREE.MeshStandardMaterial({ color: 0x444455 }));
        wall.position.y = 2;
        addObj(wall, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40);
    }
    // Trees
    for (let i = 0; i < 12; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 5, 8), new THREE.MeshStandardMaterial({ color: 0x2d1b1f }));
        trunk.position.y = 2.5;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2, 4, 8), new THREE.MeshStandardMaterial({ color: 0x052d05 }));
        leaves.position.y = 5; tree.add(trunk, leaves);
        tree.position.set((Math.random() - 0.5) * 60, 0, (Math.random() - 0.5) * 60);
        scene.add(tree);
        obstacles.push(trunk);
    }
}

// --- HUMANOID BOT SNIPER AI ---
class HumanoidBot {
    constructor() {
        this.mesh = new THREE.Group();
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c }); // Tan skin
        const clothesMat = new THREE.MeshStandardMaterial({ color: 0x111111 }); // Black tactical

        // Head
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.35), skinMat);
        head.position.y = 1.9;

        // Torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), clothesMat);
        torso.position.y = 1.35;

        // Shoulders & Arms
        const armGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
        this.lArm = new THREE.Mesh(armGeo, skinMat);
        this.lArm.position.set(-0.35, 1.4, 0);
        this.rArm = new THREE.Group(); // Weapon arm
        const rArmMesh = new THREE.Mesh(armGeo, skinMat);
        rArmMesh.position.y = -0.3;
        this.rArm.add(rArmMesh);
        this.rArm.position.set(0.35, 1.7, 0);

        // Bot Gun
        const botGun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.45), new THREE.MeshStandardMaterial({ color: 0x000000 }));
        botGun.position.set(0, -0.6, 0.25);
        this.rArm.add(botGun);

        // Hips & Legs
        const legGeo = new THREE.BoxGeometry(0.2, 0.8, 0.2);
        const lLeg = new THREE.Mesh(legGeo, clothesMat); lLeg.position.set(-0.15, 0.5, 0);
        const rLeg = new THREE.Mesh(legGeo, clothesMat); rLeg.position.set(0.15, 0.5, 0);

        this.mesh.add(head, torso, this.lArm, this.rArm, lLeg, rLeg);
        this.mesh.traverse(n => { if (n.isMesh) n.castShadow = true; });
        scene.add(this.mesh);

        this.ray = new THREE.Raycaster();
        this.reset();
    }

    reset() {
        this.mesh.position.set((Math.random() - 0.5) * 35, 0, -20);
        this.mesh.visible = true; botHp = 100; botAmmo = 10;
    }

    update() {
        if (gameState !== 'PLAYING' || botHp <= 0) return;
        const dist = this.mesh.position.distanceTo(camera.position);
        const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();
        this.ray.set(this.mesh.position.clone().add(new THREE.Vector3(0, 1.6, 0)), dir);
        const hits = this.ray.intersectObjects(obstacles, true);
        const hasLoS = hits.length === 0 || hits[0].distance > dist;

        if (hasLoS) {
            this.mesh.lookAt(camera.position.x, 0, camera.position.z);
            this.rArm.lookAt(camera.position);
            this.rArm.rotation.x += Math.PI / 2; // Orient gun properly

            if (dist > 7) this.mesh.position.addScaledVector(dir, STATS.BOT.SPEED);
            if (!botIsReloading && Date.now() - lastBotShot > 1300) this.shoot();
        } else {
            // Patrol/Search
            this.mesh.position.x += Math.cos(Date.now() * 0.002) * 0.06;
        }

        // Simple human float animation
        this.mesh.position.y = Math.sin(Date.now() * 0.005) * 0.05;
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
const bot = new HumanoidBot();

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
        runVictorySequence();
    }
}

function handleShoot() {
    if (isReloading || gameState !== 'PLAYING' || currentMag <= 0) return;
    currentMag--;
    weaponProxy.position.z += 0.2; // Recoil kick

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
    const initialY = weaponProxy.position.y;
    const reloadLoop = () => {
        weaponProxy.position.y -= 0.05;
        if (weaponProxy.position.y > -1.5) requestAnimationFrame(reloadLoop);
        else {
            setTimeout(() => {
                reserveAmmo -= 10; currentMag = 10;
                weaponProxy.position.y = initialY;
                isReloading = false; checkGameState();
            }, 1000);
        }
    };
    reloadLoop();
}

function runVictorySequence() {
    document.getElementById('victory-overlay').classList.remove('hidden');
    const audio = document.getElementById('victory-audio');
    audio.currentTime = 0;
    audio.play().catch(e => console.log("Áudio bloqueado ou não encontrado: assets/meme67.mp3"));

    controls.unlock();

    // Spawn a clone of the bot as the player in 3rd person
    const playerActor = bot.mesh.clone();
    playerActor.visible = true;
    playerActor.position.set(0, 0, 0);
    scene.add(playerActor);
    bot.mesh.visible = false;

    const targetCamP = new THREE.Vector3(0, 4, 8);
    const victoryAnim = () => {
        if (gameState !== 'VICTORY') return;
        camera.position.lerp(targetCamP, 0.05);
        camera.lookAt(playerActor.position.x, 2, playerActor.position.z);

        // MEME 67 DANCE (Dally but with vibe)
        const t = Date.now() * 0.008;
        playerActor.position.y = Math.abs(Math.sin(t * 2)) * 0.5;
        playerActor.rotation.y += 0.04;
        playerActor.children[2].rotation.z = Math.sin(t * 4) * 0.5; // Left arm

        renderer.render(scene, camera);
        requestAnimationFrame(victoryAnim);
    };
    victoryAnim();
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
    obstacles.forEach(o => { if (np.distanceTo(o.position) < 1.8) collide = true; });
    if (!collide) camera.position.add(dir);
}

function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        move();
        bot.update();
        weaponProxy.position.z += (-0.4 - weaponProxy.position.z) * 0.1; // Smooth Reset
        renderer.render(scene, camera);
    } else if (gameState === 'START') {
        renderer.render(scene, camera);
    }
}

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-overlay').classList.add('hidden');
    camera.position.set(0, 1.7, 12);
    gameState = 'PLAYING';
    controls.lock();
    loop();
});

document.getElementById('retry-btn').addEventListener('click', () => location.reload());
generateMap();
checkGameState();
bot.reset();
