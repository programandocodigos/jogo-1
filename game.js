import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D - EMERGENCY RECONSTRUCTION
 * Estabilidade visual total e correção de bloqueio de tela.
 */

console.log("Iniciando Motor do Jogo...");

// --- CONFIGURAÇÕES ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 35, SPEED: 0.16, MAG: 10, TOTAL: 30, RELOAD: 2500 },
    BOT: { HP: 100, DAMAGE: 40, SPEED: 0.08, ACCURACY_ERROR: 0.15, STOP_DIST: 6 }
};

// --- ESTADO GLOBAL ---
let gameState = 'START';
let currentPhase = 1;
let playerHp = 100;
let botHp = 100;
let currentMag = STATS.PLAYER.MAG;
let reserveAmmo = STATS.PLAYER.TOTAL - STATS.PLAYER.MAG;
let isReloading = false;
let lastShotTime = 0;

let bots = [];
let obstacles = [];
let obstacleBoxes = [];
const keys = {};

// --- SETUP THREE.JS ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510); // Azul escuro profundo (não preto total)
scene.fog = new THREE.FogExp2(0x050510, 0.01);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.7, 12);
const recoilGroup = new THREE.Group();
camera.add(recoilGroup);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;

// Garantir que o canvas fique atrás do HUD mas visível
renderer.domElement.style.position = 'absolute';
renderer.domElement.style.top = '0';
renderer.domElement.style.left = '0';
renderer.domElement.style.zIndex = '1';

const container = document.getElementById('game-container');
if (container) {
    container.appendChild(renderer.domElement);
}

const controls = new PointerLockControls(camera, document.body);

// ILUMINAÇÃO (Garantir que nada fique escuro demais)
const ambient = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(10, 20, 10);
scene.add(sun);

// --- GERAR MAPA ---
function generateMap() {
    obstacles.forEach(o => scene.remove(o));
    obstacles = []; obstacleBoxes = [];

    // Chão (Grama)
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshStandardMaterial({ color: 0x228b22 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Obstáculos Simples
    for (let i = 0; i < 20; i++) {
        const type = Math.random() > 0.5 ? 'TREE' : 'ROCK';
        let mesh;
        if (type === 'TREE') {
            mesh = new THREE.Group();
            const t = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 5), new THREE.MeshStandardMaterial({ color: 0x3d2b1f }));
            t.position.y = 2.5;
            const l = new THREE.Mesh(new THREE.ConeGeometry(2, 4, 8), new THREE.MeshStandardMaterial({ color: 0x0a5d0a }));
            l.position.y = 6;
            mesh.add(t, l);
        } else {
            mesh = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 4), new THREE.MeshStandardMaterial({ color: 0x444444 }));
            mesh.position.y = 3;
        }
        mesh.position.x = (Math.random() - 0.5) * 80;
        mesh.position.z = (Math.random() - 0.5) * 80;
        scene.add(mesh);
        obstacles.push(mesh);
        obstacleBoxes.push(new THREE.Box3().setFromObject(mesh));
    }
}

// --- ARMA ---
const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0xd2b48c }));
arm.position.set(0.3, -0.2, -0.4);
recoilGroup.add(arm);

// --- BOT ---
class ArenaBot {
    constructor() {
        this.mesh = new THREE.Group();
        this.hp = 100;
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.5, 0.4), new THREE.MeshStandardMaterial({ color: 0xff0000 }));
        b.position.y = 0.75;
        this.mesh.add(b);
        scene.add(this.mesh);
        this.reset();
    }
    reset() {
        this.hp = 100;
        botHp = 100;
        this.mesh.visible = true;
        this.mesh.position.set((Math.random() - 0.5) * 20, 0, -10);
        updateUI();
    }
    onHit(dmg) {
        this.hp -= dmg;
        botHp = this.hp;
        updateUI();
        if (this.hp <= 0) {
            this.mesh.visible = false;
            checkGameState();
        }
    }
    update() {
        if (!this.mesh.visible || gameState !== 'PLAYING') return;
        this.mesh.lookAt(camera.position.x, 0, camera.position.z);
        const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();
        if (this.mesh.position.distanceTo(camera.position) > 6) {
            this.mesh.position.add(new THREE.Vector3(dir.x, 0, dir.z).multiplyScalar(STATS.BOT.SPEED));
        }
    }
}

// --- LOGICA ---
function handleShoot() {
    if (gameState !== 'PLAYING' || currentMag <= 0) return;
    currentMag--;
    updateUI();

    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, 0), camera);
    const hits = ray.intersectObjects(scene.children, true);

    for (let hit of hits) {
        if (obstacles.includes(hit.object) || obstacles.some(o => o.children && o.children.includes(hit.object))) break;
        if (bots[0].mesh === hit.object || bots[0].mesh.children.includes(hit.object)) {
            bots[0].onHit(STATS.PLAYER.DAMAGE);
            break;
        }
    }
}

function updateUI() {
    const p = document.getElementById('player-health-fill');
    const b = document.getElementById('bot-health-fill');
    if (p) p.style.width = playerHp + '%';
    if (b) b.style.width = botHp + '%';
    const a = document.getElementById('ammo-count');
    if (a) a.innerText = currentMag;
}

function checkGameState() {
    if (botHp <= 0) {
        gameState = 'VICTORY';
        alert("VITÓRIA! O Bot foi derrotado.");
        location.reload();
    }
}

function loop() {
    requestAnimationFrame(loop);
    if (gameState === 'PLAYING') {
        movePlayer();
        bots.forEach(b => b.update());
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
    camera.position.add(mv.multiplyScalar(STATS.PLAYER.SPEED));
}

window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', e => handleShoot());

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-overlay').style.display = 'none';
    gameState = 'PLAYING';
    controls.lock();
    updateUI();
});

// START
generateMap();
bots = [new ArenaBot()];
loop();
console.log("Jogo pronto para iniciar!");
