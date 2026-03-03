import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D - HARDCORE EDITION
 * Features: Magnum .357 with Ammo, Humanoid AI Bot, Dally Dance, Realistic Nature.
 */

// --- COMBAT STATS ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 30, SPEED: 0.15, AMMO_MAX: 10, SPARE_PAGS: 2 },
    BOT: { HP: 100, DAMAGE: 40, SPEED: 0.085, ACCURACY: 0.8, FIRE_DELAY: 1500, RELOAD_DELAY: 2500, AMMO_MAX: 10 }
};

// --- SCENE SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);
scene.fog = new THREE.Fog(0x050510, 0, 50);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.getElementById('game-container').appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);
const keys = {};

// --- LIGHTING ---
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 0.8);
sun.position.set(10, 20, 10);
sun.castShadow = true;
sun.shadow.mapSize.width = 1024;
sun.shadow.mapSize.height = 1024;
scene.add(sun);

// --- WORLD ASSETS ---
function createRealisticWorld() {
    // Floor
    const grassGeo = new THREE.PlaneGeometry(100, 100);
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x1a2b1a, roughness: 0.8 });
    const floor = new THREE.Mesh(grassGeo, grassMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Realistic Obstacles (Trees and Rocks)
    const obstacles = [];
    const createTree = (x, z) => {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 5, 8), new THREE.MeshStandardMaterial({ color: 0x3d2b1f }));
        trunk.position.set(x, 2.5, z);
        trunk.castShadow = true;
        trunk.receiveShadow = true;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2, 4, 8), new THREE.MeshStandardMaterial({ color: 0x0a3d0a }));
        leaves.position.set(0, 3, 0);
        trunk.add(leaves);
        scene.add(trunk);
        obstacles.push(trunk);
    };

    const createRock = (x, z, size) => {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size), new THREE.MeshStandardMaterial({ color: 0x444444 }));
        rock.position.set(x, size / 2, z);
        rock.castShadow = true;
        rock.receiveShadow = true;
        scene.add(rock);
        obstacles.push(rock);
    };

    // Barriers
    for (let i = 0; i < 8; i++) {
        const r = 15;
        const angle = (i / 8) * Math.PI * 2;
        if (i % 2 === 0) createTree(Math.cos(angle) * r, Math.sin(angle) * r);
        else createRock(Math.cos(angle) * r, Math.sin(angle) * r, 1 + Math.random() * 2);
    }
    return obstacles;
}
const worldObstacles = createRealisticWorld();

// --- PLAYER WEAPON (Magnum .357) ---
const weaponGroup = new THREE.Group();
const createMagnum = () => {
    const silverMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.7), silverMat);
    barrel.position.z = -0.3;
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.25, 8), silverMat);
    cylinder.rotation.x = Math.PI / 2;
    cylinder.position.z = -0.15;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.12), new THREE.MeshStandardMaterial({ color: 0x221100 }));
    grip.position.set(0, -0.2, -0.1);
    grip.rotation.x = 0.2;
    weaponGroup.add(barrel, cylinder, grip);
    weaponGroup.position.set(0.4, -0.25, -0.5);
    camera.add(weaponGroup);
};
createMagnum();

// --- BOT CHARACTER (Humanoid) ---
class Bot {
    constructor() {
        this.group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0x333366 });
        // Humanoid Model
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.4), mat);
        torso.position.y = 1.3;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat);
        head.position.y = 2.1;
        const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), mat);
        lArm.position.set(-0.4, 1.4, 0);
        this.rArm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), mat); // The arm that shoots
        this.rArm.position.set(0.4, 1.4, 0);

        // Bot Gun
        const botGun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        botGun.position.z = 0.3;
        this.rArm.add(botGun);

        const legGeo = new THREE.BoxGeometry(0.25, 0.9, 0.25);
        const lLeg = new THREE.Mesh(legGeo, mat); lLeg.position.set(-0.18, 0.45, 0);
        const rLeg = new THREE.Mesh(legGeo, mat); rLeg.position.set(0.18, 0.45, 0);

        this.group.add(torso, head, lArm, this.rArm, lLeg, rLeg);
        this.group.castShadow = true;
        scene.add(this.group);

        this.ray = new THREE.Raycaster();
        this.hp = 100;
        this.ammo = STATS.BOT.AMMO_MAX;
        this.isReloading = false;
        this.lastShotTime = 0;
        this.targetPos = new THREE.Vector3();
    }

    reset() {
        this.hp = 100;
        this.ammo = STATS.BOT.AMMO_MAX;
        this.group.position.set((Math.random() - 0.5) * 20, 0, -20);
        this.group.visible = true;
    }

    update() {
        if (gameState !== 'PLAYING' || this.hp <= 0) return;

        const dist = this.group.position.distanceTo(camera.position);
        const direction = new THREE.Vector3().subVectors(camera.position, this.group.position).normalize();

        // Raycasting for Vision
        this.ray.set(this.group.position.clone().add(new THREE.Vector3(0, 2, 0)), direction);
        const intersects = this.ray.intersectObjects([...worldObstacles, floor]);
        const hasLineOfSight = intersects.length === 0 || intersects[0].distance > dist;

        if (hasLineOfSight) {
            // Smooth Rotation towards player
            this.targetPos.copy(camera.position);
            this.group.lookAt(this.targetPos.x, 0, this.targetPos.z);
            this.rArm.lookAt(camera.position); // Point gun at player

            // Movement: Pursue the player
            if (dist > 5) this.group.position.addScaledVector(direction, STATS.BOT.SPEED);

            // Combat Logic
            if (!this.isReloading) {
                if (Date.now() - this.lastShotTime > STATS.BOT.FIRE_DELAY) {
                    this.shoot();
                    this.lastShotTime = Date.now();
                }
            }
        }
    }

    shoot() {
        if (this.ammo <= 0) {
            this.isReloading = true;
            setTimeout(() => { this.ammo = STATS.BOT.AMMO_MAX; this.isReloading = false; }, STATS.BOT.RELOAD_DELAY);
            return;
        }

        this.ammo--;
        // Accuracy Check
        if (Math.random() < STATS.BOT.ACCURACY) {
            playerLogic.takeDamage(STATS.BOT.DAMAGE);
        }
    }
}

// --- GAME LOGIC ---
let gameState = 'START';
let playerHp = 100;
let currentAmmo = 10;
let sparePags = 2; // Total 30 bullets = 10 + 2*10
let isReloading = false;
const bot = new Bot();

const playerLogic = {
    takeDamage(amt) {
        playerHp -= amt;
        this.updateUI();
        if (playerHp <= 0) this.die();
    },
    updateUI() {
        document.getElementById('player-health-fill').style.width = playerHp + '%';
        document.getElementById('bot-health-fill').style.width = bot.hp + '%';
        document.getElementById('ammo-count').innerText = currentAmmo;
        document.getElementById('total-ammo').innerText = sparePags * 10;
    },
    shoot() {
        if (isReloading || gameState !== 'PLAYING') return;
        if (currentAmmo <= 0) { this.reload(); return; }

        currentAmmo--;
        this.updateUI();

        // Animation
        weaponGroup.position.z += 0.15;

        // Raycast Shoot
        const raycaster = new THREE.Raycaster();
        const mouseDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        raycaster.set(camera.position, mouseDir);

        const hitBot = raycaster.intersectObject(bot.group, true);
        const hitWorld = raycaster.intersectObjects(worldObstacles, true);

        if (hitBot.length > 0) {
            // Check if world obstructed the bot
            if (hitWorld.length === 0 || hitWorld[0].distance > hitBot[0].distance) {
                bot.hp -= STATS.PLAYER.DAMAGE;
                this.updateUI();
                if (bot.hp <= 0) this.win();
            }
        }
    },
    reload() {
        if (sparePags <= 0 || isReloading) return;
        isReloading = true;
        // Animation
        const startY = weaponGroup.position.y;
        const reloadAnim = () => {
            weaponGroup.position.y -= 0.05;
            if (weaponGroup.position.y > -1.5) requestAnimationFrame(reloadAnim);
            else {
                setTimeout(() => {
                    currentAmmo = 10; sparePags--;
                    this.updateUI();
                    weaponGroup.position.y = startY;
                    isReloading = false;
                }, 1000);
            }
        }
        reloadAnim();
    },
    die() {
        gameState = 'GAMEOVER';
        document.getElementById('game-over-overlay').classList.remove('hidden');
        controls.unlock();
    },
    win() {
        gameState = 'VICTORY';
        bot.group.visible = false;
        document.getElementById('victory-overlay').classList.remove('hidden');
        document.getElementById('victory-music').play();
        controls.unlock();
        this.startDally();
    },
    startDally() {
        // Change to 3rd person and animate
        const playerModel = bot.group.clone(); // Reusing the bot model as the player for 3rd person
        playerModel.visible = true;
        playerModel.position.set(0, 0, 0);
        scene.add(playerModel);

        camera.position.set(0, 2, 6);
        camera.lookAt(0, 1.5, 0);

        let t = 0;
        const dallyAnim = () => {
            if (gameState !== 'VICTORY') return;
            t += 0.1;
            playerModel.position.y = Math.abs(Math.sin(t)) * 0.3; // Bounce
            playerModel.rotation.y += 0.05;
            renderer.render(scene, camera);
            requestAnimationFrame(dallyAnim);
        };
        dallyAnim();
    }
};

// --- CONTROLS ---
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', (e) => {
    if (e.button === 0) playerLogic.shoot();
});

function handleMovement() {
    const moveDir = new THREE.Vector3();
    const fv = (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0);
    const sv = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);

    moveDir.set(sv, 0, fv).normalize().multiplyScalar(STATS.PLAYER.SPEED).applyQuaternion(camera.quaternion);
    moveDir.y = 0;

    // Collision Detect
    const nextPos = camera.position.clone().add(moveDir);
    let collide = false;
    worldObstacles.forEach(obs => {
        if (nextPos.distanceTo(obs.position) < 2) collide = true;
    });

    if (!collide) camera.position.add(moveDir);
}

// --- ANIMATION LOOP ---
function animate() {
    requestAnimationFrame(animate);
    if (gameState === 'PLAYING') {
        handleMovement();
        bot.update();
        weaponGroup.position.z += (-0.5 - weaponGroup.position.z) * 0.1;
        renderer.render(scene, camera);
    } else if (gameState === 'START') {
        renderer.render(scene, camera);
    }
}

// --- INITIALIZE ---
document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-overlay').classList.add('hidden');
    camera.position.set(0, 1.7, 5);
    gameState = 'PLAYING';
    controls.lock();
    animate();
});

document.getElementById('retry-btn').addEventListener('click', () => location.reload());
playerLogic.updateUI();
bot.reset();
