import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D (V.2026) - MEME 67 & HUMANOID EDITION
 * Balance: Player 20 Dmg | Bot 10 Dmg | Dist <= 10m | No walls shooting
 */

// --- COMBAT STATS (Ajustado conforme pedido) ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 20, SPEED: 0.16, MAG_SIZE: 10, TOTAL_RESERVE: 20 },
    BOT: { HP: 100, DAMAGE: 10, SPEED: 0.10, ACCURACY: 0.75, MAG_SIZE: 12, RELOAD_TIME: 2000, MAX_RANGE: 25 }
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
let obstacleBoxes = []; // Caixas de colisão AABB
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

// --- MAP GENERATION ---
function generateMap() {
    obstacles.forEach(o => scene.remove(o));
    obstacles = [];

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(120, 120),
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

        // Criar caixa de colisão para o objeto
        const box = new THREE.Box3().setFromObject(obj);
        obstacleBoxes.push(box);
    };

    // Concrete Walls
    for (let i = 0; i < 10; i++) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 2), new THREE.MeshStandardMaterial({ color: 0x444455 }));
        wall.position.y = 2;
        addObj(wall, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50);
    }
    // Trees
    for (let i = 0; i < 15; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 5, 8), new THREE.MeshStandardMaterial({ color: 0x2d1b1f }));
        trunk.position.y = 2.5;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(2, 4, 8), new THREE.MeshStandardMaterial({ color: 0x052d05 }));
        leaves.position.y = 5; tree.add(trunk, leaves);
        const x = (Math.random() - 0.5) * 70;
        const z = (Math.random() - 0.5) * 70;
        tree.position.set(x, 0, z);
        scene.add(tree);
        obstacles.push(trunk);

        // Caixa de colisão para a árvore (baseada no tronco)
        const box = new THREE.Box3().setFromObject(trunk);
        obstacleBoxes.push(box);
    }
}

// --- HUMANOID BOT SNIPER AI ---
class HumanoidBot {
    constructor() {
        this.mesh = new THREE.Group();
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xd2b48c });
        const clothesMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.35), skinMat); head.position.y = 1.9;
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), clothesMat); torso.position.y = 1.35;
        const armGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
        this.lArm = new THREE.Mesh(armGeo, skinMat); this.lArm.position.set(-0.35, 1.4, 0);
        this.rArm = new THREE.Group();
        const rArmMesh = new THREE.Mesh(armGeo, skinMat); rArmMesh.position.y = -0.3; this.rArm.add(rArmMesh);
        this.rArm.position.set(0.35, 1.7, 0);
        const botGun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.45), new THREE.MeshStandardMaterial({ color: 0x000000 }));
        botGun.position.set(0, -0.6, 0.25); this.rArm.add(botGun);
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
        this.mesh.position.set((Math.random() - 0.5) * 40, 0, -20);
        this.mesh.visible = true; botHp = 100; botAmmo = 10;
    }

    update() {
        if (gameState !== 'PLAYING' || botHp <= 0) return;
        const dist = this.mesh.position.distanceTo(camera.position);
        const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();

        // Raycast Visibility Check (Não atira atrás de obstáculos)
        this.ray.set(this.mesh.position.clone().add(new THREE.Vector3(0, 1.6, 0)), dir);
        const hits = this.ray.intersectObjects(obstacles, true);
        const hasLoS = hits.length === 0 || hits[0].distance > dist;

        if (hasLoS) {
            this.mesh.lookAt(camera.position.x, 0, camera.position.z);
            this.rArm.lookAt(camera.position);
            this.rArm.rotation.x += Math.PI / 2;

            // NOVA INTELIGÊNCIA: Se o jogador estiver muito perto ( < 4m), o bot recua
            // Se estiver longe ( > 7m), o bot avança
            if (dist > 7) {
                // Avançar
                this.moveBot(dir, STATS.BOT.SPEED);
            } else if (dist < 4) {
                // Recuar (direção oposta ao jogador)
                const retreatDir = dir.clone().negate();
                this.moveBot(retreatDir, STATS.BOT.SPEED * 0.8);
            }

            // Atirar se estiver no alcance aumentado (25m)
            if (!botIsReloading && dist <= STATS.BOT.MAX_RANGE && Date.now() - lastBotShot > 1200) {
                this.shoot();
            }
        } else {
            // Se perdeu a visão, tenta se mover para o lado para reencontrar o jogador (flanquear)
            const sideDir = new THREE.Vector3(-dir.z, 0, dir.x);
            this.moveBot(sideDir, STATS.BOT.SPEED * 0.5);
        }
        this.mesh.position.y = Math.sin(Date.now() * 0.005) * 0.05;
    }

    moveBot(direction, speed) {
        const nextBotPos = this.mesh.position.clone().addScaledVector(direction, speed);
        const botBox = new THREE.Box3().setFromCenterAndSize(nextBotPos, new THREE.Vector3(1, 2, 1));
        let collide = false;
        for (let box of obstacleBoxes) {
            if (botBox.intersectsBox(box)) { collide = true; break; }
        }
        if (!collide) {
            this.mesh.position.copy(nextBotPos);
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
            playerHp -= STATS.BOT.DAMAGE; // Bot tira 10 de dano
            checkGameState();
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
    weaponProxy.position.z += 0.2;

    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    ray.set(camera.position, dir);

    const hitsBot = ray.intersectObject(bot.mesh, true);
    const hitsObs = ray.intersectObjects(obstacles, true);

    let hitPoint = null;
    let hitSomething = false;

    // Verificar se acertou obstáculo primeiro
    if (hitsObs.length > 0) {
        hitPoint = hitsObs[0].point;
        hitSomething = true;
    }

    if (hitsBot.length > 0) {
        const botDist = hitsBot[0].distance;
        const obsDist = hitsObs.length > 0 ? hitsObs[0].distance : Infinity;

        if (botDist < obsDist) {
            botHp -= STATS.PLAYER.DAMAGE;
            hitPoint = hitsBot[0].point;
            hitSomething = true;
        }
    }

    // Efeito visual do tiro (Tracer)
    const tracerGeo = new THREE.BufferGeometry().setFromPoints([
        camera.position.clone().add(new THREE.Vector3(0.3, -0.3, -0.5).applyQuaternion(camera.quaternion)),
        hitPoint || camera.position.clone().add(dir.multiplyScalar(50))
    ]);
    const tracerMat = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8 });
    const tracer = new THREE.Line(tracerGeo, tracerMat);
    scene.add(tracer);
    setTimeout(() => scene.remove(tracer), 50);

    // Faísca no impacto
    if (hitSomething && hitPoint) {
        const spark = new THREE.Mesh(
            new THREE.SphereGeometry(0.05),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        spark.position.copy(hitPoint);
        scene.add(spark);
        setTimeout(() => scene.remove(spark), 100);
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
    audio.play().catch(e => console.log("Erro de áudio"));
    controls.unlock();
    const playerActor = bot.mesh.clone();
    playerActor.visible = true; playerActor.position.set(0, 0, 0); scene.add(playerActor);
    bot.mesh.visible = false;
    const victoryAnim = () => {
        if (gameState !== 'VICTORY') return;
        camera.position.lerp(new THREE.Vector3(0, 4, 8), 0.05);
        camera.lookAt(playerActor.position.x, 2, playerActor.position.z);
        const t = Date.now() * 0.008;
        playerActor.position.y = Math.abs(Math.sin(t * 2)) * 0.5;
        playerActor.rotation.y += 0.04;
        renderer.render(scene, camera);
        requestAnimationFrame(victoryAnim);
    };
    victoryAnim();
}

function fullReset() { location.reload(); }

window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', (e) => { if (e.button === 0) handleShoot(); });

function checkPlayerCollision(position) {
    const playerBox = new THREE.Box3().setFromCenterAndSize(
        position,
        new THREE.Vector3(0.8, 2.0, 0.8) // Tamanho aproximado do jogador
    );

    for (let box of obstacleBoxes) {
        if (playerBox.intersectsBox(box)) return true;
    }
    return false;
}

function move() {
    if (!controls.isLocked) return;

    const moveVector = new THREE.Vector3();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);

    forward.y = 0;
    right.y = 0;
    forward.normalize();
    right.normalize();

    if (keys['KeyW']) moveVector.add(forward);
    if (keys['KeyS']) moveVector.sub(forward);
    if (keys['KeyA']) moveVector.sub(right);
    if (keys['KeyD']) moveVector.add(right);

    if (moveVector.length() > 0) {
        moveVector.normalize().multiplyScalar(STATS.PLAYER.SPEED);

        // Tentativa de movimento no eixo X
        const nextPosX = camera.position.clone();
        nextPosX.x += moveVector.x;
        if (!checkPlayerCollision(nextPosX)) {
            camera.position.x = nextPosX.x;
        }

        // Tentativa de movimento no eixo Z
        const nextPosZ = camera.position.clone();
        nextPosZ.z += moveVector.z;
        if (!checkPlayerCollision(nextPosZ)) {
            camera.position.z = nextPosZ.z;
        }
    }
}

function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        move(); bot.update();
        weaponProxy.position.z += (-0.4 - weaponProxy.position.z) * 0.1;
        renderer.render(scene, camera);
    } else if (gameState === 'START') {
        renderer.render(scene, camera);
    }
}

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-overlay').classList.add('hidden');
    camera.position.set(0, 1.7, 12);
    gameState = 'PLAYING'; controls.lock(); loop();
});

document.getElementById('retry-btn').addEventListener('click', () => fullReset());
document.getElementById('reset-btn').addEventListener('click', () => fullReset());
generateMap(); checkGameState(); bot.reset();
