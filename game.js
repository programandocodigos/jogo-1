import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D - HUMANOID BOT EDITION
 * Foco em: Personagem no chão e Bot com formato humano.
 */

// --- CONFIGURAÇÕES ---
const STATS = {
    PLAYER: { HP: 100, SPEED: 0.15 },
    BOT: { HP: 100, SPEED: 0.08, DAMAGE: 25 }
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
scene.fog = new THREE.Fog(0x020205, 0, 40);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById('game-container').appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, document.body);
const keys = {};

// --- MUNDO ---
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: 0x111122 })
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// Iluminação
const ambient = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambient);
const point = new THREE.PointLight(0x00f2ff, 100, 50);
point.position.set(0, 10, 0);
scene.add(point);

// --- ARMA DO JOGADOR (Magnum 357) ---
const weapon = new THREE.Group();
const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x555555 }));
barrel.position.z = -0.3;
const grip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), new THREE.MeshStandardMaterial({ color: 0x221100 }));
grip.position.y = -0.15;
weapon.add(barrel, grip);
weapon.position.set(0.3, -0.2, -0.4);
camera.add(weapon);
scene.add(camera);

// --- CLASSE DO BOT HUMANOIDE ---
class HumanBot {
    constructor() {
        this.group = new THREE.Group();
        const mat = new THREE.MeshStandardMaterial({ color: 0xff00ff });

        // Tronco
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.7), mat);
        body.position.y = 1.1;
        this.group.add(body);

        // Cabeça
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat);
        head.position.y = 1.8;
        this.group.add(head);

        // Braço que aponta (Direito)
        this.arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), mat);
        this.arm.position.set(0.4, 1.4, 0.3);
        this.group.add(this.arm);

        // Arma do Bot
        const botGun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.3), new THREE.MeshStandardMaterial({ color: 0x333333 }));
        botGun.position.z = 0.4;
        this.arm.add(botGun);

        // Pernas (Blocos simples para dar o formato)
        const leg = new THREE.BoxGeometry(0.15, 0.8, 0.15);
        const lLeg = new THREE.Mesh(leg, mat); lLeg.position.set(-0.15, 0.4, 0);
        const rLeg = new THREE.Mesh(leg, mat); rLeg.position.set(0.15, 0.4, 0);
        this.group.add(lLeg, rLeg);

        scene.add(this.group);
        this.hp = 100;
        this.lastShot = 0;
        this.reset();
    }

    reset() {
        this.hp = 100;
        this.group.position.set(10, 0, -10);
        this.group.visible = true;
    }

    update() {
        if (this.hp <= 0 || gameState !== 'PLAYING') return;

        // Olhar para o jogador
        this.group.lookAt(camera.position.x, 0, camera.position.z);

        // Movimento (Andar em direção ao jogador)
        const dir = new THREE.Vector3().subVectors(camera.position, this.group.position).normalize();
        dir.y = 0;
        this.group.position.addScaledVector(dir, STATS.BOT.SPEED);

        // Atirar se estiver perto
        const dist = this.group.position.distanceTo(camera.position);
        if (dist < 15 && Date.now() - this.lastShot > 1500) {
            this.shoot();
            this.lastShot = Date.now();
        }
    }

    shoot() {
        playerHp -= STATS.BOT.DAMAGE;
        updateHUD();
        if (playerHp <= 0) endGame();
    }
}

const bot = new HumanBot();
let playerHp = 100;
let gameState = 'START';

// --- LÓGICA DE JOGO ---
function updateHUD() {
    document.getElementById('player-health-fill').style.width = playerHp + '%';
    document.getElementById('bot-health-fill').style.width = bot.hp + '%';
}

function endGame() {
    gameState = 'GAMEOVER';
    document.getElementById('game-over-overlay').classList.remove('hidden');
    controls.unlock();
}

// Balas do Jogador
let bullets = [];
function shoot() {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const bullet = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0x00f2ff }));
    bullet.position.copy(camera.position);
    scene.add(bullet);
    bullets.push({ mesh: bullet, dir: dir, life: 0 });

    // Animação de Recuo
    weapon.position.z += 0.1;
}

function updateBullets() {
    bullets.forEach((b, i) => {
        b.mesh.position.addScaledVector(b.dir, 0.8);
        b.life++;

        // Colisão com o Bot
        if (b.mesh.position.distanceTo(bot.group.position.clone().add(new THREE.Vector3(0, 1, 0))) < 1) {
            bot.hp -= 25;
            updateHUD();
            scene.remove(b.mesh);
            bullets.splice(i, 1);
            if (bot.hp <= 0) bot.reset(); // Bot renasce
        }

        if (b.life > 100) { scene.remove(b.mesh); bullets.splice(i, 1); }
    });
}

// --- LOOP PRINCIPAL ---
function animate() {
    requestAnimationFrame(animate);

    if (gameState === 'PLAYING') {
        const moveDir = new THREE.Vector3();
        const fv = (keys['KeyS'] ? 1 : 0) - (keys['KeyW'] ? 1 : 0);
        const sv = (keys['KeyA'] ? 1 : 0) - (keys['KeyD'] ? 1 : 0);

        // Movimento relativo à câmera, mas preso ao chão (y=0)
        moveDir.set(sv, 0, fv).normalize().multiplyScalar(STATS.PLAYER.SPEED).applyQuaternion(camera.quaternion);
        moveDir.y = 0;
        camera.position.add(moveDir);

        bot.update();
        updateBullets();

        // Suavizar recuo da arma
        weapon.position.z += (-0.4 - weapon.position.z) * 0.1;
    }

    renderer.render(scene, camera);
}

// --- EVENTOS ---
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', () => {
    if (gameState === 'PLAYING') shoot();
});

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-overlay').classList.add('hidden');
    camera.position.set(0, 1.7, 5); // Altura de humano (1.7m)
    gameState = 'PLAYING';
    controls.lock();
    animate();
});

document.getElementById('retry-btn').addEventListener('click', () => location.reload());
