import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D - REVISÃO TÉCNICA 2026
 * Foco: Feedback de Dano, Balanceamento IA e Física de Obstáculos
 */

// --- CONFIGURAÇÕES ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 35, SPEED: 0.16, MAG_SIZE: 10, TOTAL_RESERVE: 30, RELOAD_TIME: 2500 },
    BOT: { HP: 100, DAMAGE: 25, SPEED: 0.07, ACCURACY_ERROR: 0.15, REACTION_TIME: 500, COOLDOWN: 800 }
};

// --- ESTADO GLOBAL ---
let gameState = 'START';
let currentPhase = 1;
let coins = 0;
let playerHp = 100;
let currentMag = STATS.PLAYER.MAG_SIZE;
let reserveAmmo = STATS.PLAYER.TOTAL_RESERVE;
let isReloading = false;
let lastShotTime = 0;
let lastStep = 0;

let bots = [];
let solidObjects = [];
let obstacleBoxes = [];
const keys = {};

// --- SETUP THREE.JS ---
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

// Iluminação
const ambient = new THREE.HemisphereLight(0xffffff, 0x080820, 0.5);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(20, 40, 10);
sun.castShadow = true;
scene.add(sun);

// Sistema de Partículas Simples
const particlePool = [];
function createHitEffect(point) {
    const geo = new THREE.SphereGeometry(0.05, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    for (let i = 0; i < 5; i++) {
        const p = new THREE.Mesh(geo, mat);
        p.position.copy(point);
        p.userData.vel = new THREE.Vector3((Math.random()-0.5)*0.2, Math.random()*0.2, (Math.random()-0.5)*0.2);
        p.userData.life = 1.0;
        scene.add(p);
        particlePool.push(p);
    }
}

function updateParticles() {
    for (let i = particlePool.length - 1; i >= 0; i--) {
        const p = particlePool[i];
        p.position.add(p.userData.vel);
        p.userData.life -= 0.05;
        p.scale.setScalar(p.userData.life);
        if (p.userData.life <= 0) {
            scene.remove(p);
            particlePool.splice(i, 1);
        }
    }
}

// --- MAGNUM .357 ---
const weaponProxy = new THREE.Group();
function createMagnum() {
    weaponProxy.clear();
    const iron = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.2 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.5), iron);
    barrel.position.z = -0.35;
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.15, 8), iron);
    cylinder.rotation.x = Math.PI/2; cylinder.position.z = -0.1;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.12), wood);
    grip.position.set(0, -0.15, 0); grip.rotation.x = 0.3;
    weaponProxy.add(barrel, cylinder, grip);
    weaponProxy.position.set(0.3, -0.2, -0.4);
    recoilGroup.add(weaponProxy);
}
createMagnum();

// --- ARENA ---
function generateArena() {
    solidObjects.forEach(o => scene.remove(o));
    solidObjects = []; obstacleBoxes = [];
    
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x070707 }));
    floor.rotation.x = -Math.PI/2; floor.receiveShadow = true;
    scene.add(floor);

    const addObstacle = (mesh, x, z) => {
        mesh.position.set(x, mesh.geometry.parameters.height/2 || 1.5, z);
        mesh.castShadow = true; mesh.receiveShadow = true;
        scene.add(mesh);
        solidObjects.push(mesh);
        obstacleBoxes.push(new THREE.Box3().setFromObject(mesh));
    };

    // Árvores Bloqueadoras
    for(let i=0; i<12; i++) {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 6), new THREE.MeshStandardMaterial({color: 0x24140e}));
        addObstacle(trunk, (Math.random()-0.5)*70, (Math.random()-0.5)*70);
    }
    // Pedras (Cover)
    for(let i=0; i<10; i++) {
        const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(2), new THREE.MeshStandardMaterial({color: 0x333333}));
        addObstacle(stone, (Math.random()-0.5)*70, (Math.random()-0.5)*70);
    }
}

// --- BOT CLASSE ---
class ArenaBot {
    constructor() {
        this.id = Math.random().toString(36).substr(2, 9);
        this.hp = 100;
        this.maxHp = 100;
        this.mesh = new THREE.Group();
        this.lastShotTime = 0;
        this.seePlayerTime = 0;
        this.isFlashing = false;

        const mat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        this.body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.2, 0.4), mat);
        this.body.position.y = 0.6;
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({color: 0xd2b48c}));
        head.position.y = 1.4;
        this.mesh.add(this.body, head);
        
        // Barra de Vida Flutuante
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 32;
        this.hpTex = new THREE.CanvasTexture(canvas);
        const hpSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.hpTex }));
        hpSprite.position.y = 2.0; hpSprite.scale.set(1, 0.25, 1);
        this.mesh.add(hpSprite);

        this.updateHpBar();
        scene.add(this.mesh);
        this.respawn();
    }

    respawn() {
        this.hp = 100;
        this.mesh.position.set((Math.random()-0.5)*40, 0, -20); // y=0 FIXED
        this.mesh.visible = true;
        this.updateHpBar();
    }

    updateHpBar() {
        const ctx = this.hpTex.image.getContext('2d');
        ctx.fillStyle = '#440000'; ctx.fillRect(0,0,128,32);
        ctx.fillStyle = '#ff0000'; ctx.fillRect(0,0, (this.hp/this.maxHp)*128, 32);
        this.hpTex.needsUpdate = true;
    }

    onHit(damage, point) {
        this.hp -= damage;
        this.updateHpBar();
        createHitEffect(point);
        
        // Damage Flash
        if(!this.isFlashing) {
            this.isFlashing = true;
            this.body.material.color.set(0xff0000);
            this.body.material.emissive.set(0x330000);
            setTimeout(() => {
                this.body.material.color.set(0x111111);
                this.body.material.emissive.set(0x000000);
                this.isFlashing = false;
            }, 100);
        }

        if(this.hp <= 0) {
            this.mesh.visible = false;
            checkGameState();
        }
    }

    update() {
        if(this.hp <= 0 || gameState !== 'PLAYING') return;

        const dist = this.mesh.position.distanceTo(camera.position);
        const dirToPlayer = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();

        // Raycast de Linha de Visão (LOS)
        const ray = new THREE.Raycaster(this.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0)), dirToPlayer);
        const hits = ray.intersectObjects(solidObjects, true);
        const playerVisible = (hits.length === 0 || hits[0].distance > dist);

        if (playerVisible) {
            if (this.seePlayerTime === 0) this.seePlayerTime = Date.now();
            
            this.mesh.lookAt(camera.position.x, 0, camera.position.z);

            // Reação e Cooldown
            const timeSinceSeen = Date.now() - this.seePlayerTime;
            const timeSinceLastShot = Date.now() - this.lastShotTime;

            if (timeSinceSeen > STATS.BOT.REACTION_TIME && timeSinceLastShot > STATS.BOT.COOLDOWN) {
                this.shootPlayer();
            }

            if (dist > 8) {
                this.mesh.position.add(new THREE.Vector3(dirToPlayer.x, 0, dirToPlayer.z).multiplyScalar(STATS.BOT.SPEED));
            }
        } else {
            this.seePlayerTime = 0; // Perdeu de vista
        }
    }

    shootPlayer() {
        this.lastShotTime = Date.now();
        
        // Cálculo de Erro (Dispersão)
        const spread = STATS.BOT.ACCURACY_ERROR;
        const targetPos = camera.position.clone().add(new THREE.Vector3(
            (Math.random()-0.5)*spread*5,
            (Math.random()-0.5)*spread*5,
            (Math.random()-0.5)*spread*5
        ));

        // Raycast do Tiro do Bot (Checa se atinge parede ou player)
        const botEye = this.mesh.position.clone().add(new THREE.Vector3(0, 1.4, 0));
        const shotDir = new THREE.Vector3().subVectors(targetPos, botEye).normalize();
        const shotRay = new THREE.Raycaster(botEye, shotDir);
        
        const wallHits = shotRay.intersectObjects(solidObjects, true);
        const distToWall = wallHits.length > 0 ? wallHits[0].distance : Infinity;
        const distToPlayer = botEye.distanceTo(camera.position);

        // Tracer
        const endPoint = distToWall < distToPlayer ? wallHits[0].point : camera.position;
        this.renderTracer(botEye, endPoint);

        if (distToPlayer < distToWall) {
             // Hit Player!
             playerHp -= STATS.BOT.DAMAGE;
             document.body.style.boxShadow = "inset 0 0 100px #ff0000";
             setTimeout(() => document.body.style.boxShadow = "none", 100);
             checkGameState();
        } else if (wallHits.length > 0) {
            createHitEffect(wallHits[0].point);
        }
    }

    renderTracer(start, end) {
        const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff0000, opacity: 0.5, transparent: true }));
        scene.add(line);
        setTimeout(() => scene.remove(line), 50);
    }
}

// --- MECÂNICAS JOGADOR ---
function handleShoot() {
    if (isReloading || gameState !== 'PLAYING' || currentMag <= 0) {
        if(currentMag <= 0 && !isReloading) reload();
        return;
    }
    if (Date.now() - lastShotTime < 400) return;

    lastShotTime = Date.now();
    currentMag--;
    updateUI();

    // Recoil
    recoilGroup.rotation.x += 0.1;
    weaponProxy.position.z += 0.15;

    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    ray.set(camera.position, dir);

    const wallHits = ray.intersectObjects(solidObjects, true);
    const wallDist = wallHits.length > 0 ? wallHits[0].distance : Infinity;

    let hitBot = null;
    let botDist = Infinity;
    let hitPoint = null;

    bots.forEach(b => {
        if(b.mesh.visible) {
            const hits = ray.intersectObject(b.mesh, true);
            if(hits.length > 0 && hits[0].distance < botDist) {
                botDist = hits[0].distance;
                hitBot = b;
                hitPoint = hits[0].point;
            }
        }
    });

    if (hitBot && botDist < wallDist) {
        hitBot.onHit(STATS.PLAYER.DAMAGE, hitPoint);
        showHitMarker();
    } else if (wallHits.length > 0) {
        createHitEffect(wallHits[0].point);
    }
}

function reload() {
    if (isReloading || reserveAmmo <= 0 || currentMag === STATS.PLAYER.MAG_SIZE) return;
    isReloading = true;
    document.getElementById('ammo-count').innerText = "RECARREGANDO...";
    
    setTimeout(() => {
        const needed = STATS.PLAYER.MAG_SIZE - currentMag;
        const take = Math.min(needed, reserveAmmo);
        currentMag += take;
        reserveAmmo -= take;
        isReloading = false;
        updateUI();
    }, STATS.PLAYER.RELOAD_TIME);
}

function updateUI() {
    document.getElementById('player-health-fill').style.width = Math.max(0, playerHp) + '%';
    document.getElementById('ammo-count').innerText = currentMag;
    document.getElementById('total-ammo').innerText = reserveAmmo;
    document.getElementById('coin-count').innerText = coins;
    document.getElementById('phase-display').innerText = `FASE ${currentPhase}`;
}

function showHitMarker() {
    const c = document.getElementById('crosshair'); c.style.borderColor = 'red';
    setTimeout(() => c.style.borderColor = 'rgba(255,255,255,0.8)', 100);
}

function checkGameState() {
    updateUI();
    if (playerHp <= 0 && gameState === 'PLAYING') {
        gameState = 'GAMEOVER';
        document.getElementById('game-over-overlay').classList.remove('hidden');
        controls.unlock();
    }
    if (bots.every(b => !b.mesh.visible) && gameState === 'PLAYING') {
        gameState = 'VICTORY';
        runVictorySequence();
    }
}

function runVictorySequence() {
    document.getElementById('victory-overlay').classList.remove('hidden');
    controls.unlock();
    const music = new Audio('assets/dally_trend.mp3');
    music.play().catch(() => {});
    
    // Transição 3ª Pessoa
    camera.position.set(0, 3, 6);
    camera.lookAt(0, 1.5, 0);
}

function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        move();
        bots.forEach(b => b.update());
        updateParticles();
        recoilGroup.rotation.x *= 0.9;
        weaponProxy.position.z *= 0.85;
    }
    renderer.render(scene, camera);
}

function move() {
    if (!controls.isLocked) return;
    const mv = new THREE.Vector3();
    const f = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
    const r = new THREE.Vector3(1,0,0).applyQuaternion(camera.quaternion);
    f.y = 0; r.y = 0; f.normalize(); r.normalize();

    if (keys['KeyW']) mv.add(f); if (keys['KeyS']) mv.sub(f);
    if (keys['KeyA']) mv.sub(r); if (keys['KeyD']) mv.add(r);

    if (mv.length() > 0) {
        mv.normalize().multiplyScalar(STATS.PLAYER.SPEED);
        const next = camera.position.clone().add(mv);
        const pBox = new THREE.Box3().setFromCenterAndSize(next, new THREE.Vector3(0.8, 2, 0.8));
        if (!obstacleBoxes.some(b => pBox.intersectsBox(b))) camera.position.copy(next);
    }
}

// --- INPUTS ---
window.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (e.code === 'KeyR') reload();
});
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', e => { if(e.button === 0) handleShoot(); });

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-overlay').classList.add('hidden');
    gameState = 'PLAYING';
    camera.position.set(0, 1.7, 12);
    controls.lock();
});

document.getElementById('next-phase-btn').addEventListener('click', () => {
    currentPhase++;
    gameState = 'PLAYING';
    document.getElementById('victory-overlay').classList.add('hidden');
    generateArena();
    bots.forEach(b => b.respawn());
    if(currentPhase > bots.length) bots.push(new ArenaBot());
    playerHp = 100;
    camera.position.set(0, 1.7, 12);
    controls.lock();
    updateUI();
});

// INITIALIZE
generateArena();
bots = [new ArenaBot()];
loop();

