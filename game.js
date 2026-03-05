import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

/**
 * BOX FIGHT 3D (V.2026) - MEME 67 & HUMANOID EDITION
 * Balance: Player 20 Dmg | Bot 10 Dmg | Dist <= 10m | No walls shooting
 */

// --- COMBAT STATS (Ajustado conforme pedido) ---
const STATS = {
    PLAYER: { HP: 100, DAMAGE: 20, SPEED: 0.16, MAG_SIZE: 20, TOTAL_RESERVE: 40 },
    BOT: { HP: 100, DAMAGE: 10, SPEED: 0.07, ACCURACY: 0.75, MAG_SIZE: 12, RELOAD_TIME: 2000, MAX_RANGE: 40 }
};

// --- AUDIO SYSTEM (Procedural Sounds V2.0) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// 1. Distortion Curve (Para dar textura metálica/explosiva)
function makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50;
    const n_samples = 44100;
    const curve = new Float32Array(n_samples);
    const deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
        const x = i * 2 / n_samples - 1;
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
}
const distortionCurve = makeDistortionCurve(400);

// 2. Compressor Principal (Dá o "punch" e cola os sons)
const mainCompressor = audioCtx.createDynamicsCompressor();
mainCompressor.threshold.setValueAtTime(-24, audioCtx.currentTime);
mainCompressor.knee.setValueAtTime(30, audioCtx.currentTime);
mainCompressor.ratio.setValueAtTime(12, audioCtx.currentTime);
mainCompressor.attack.setValueAtTime(0.003, audioCtx.currentTime);
mainCompressor.release.setValueAtTime(0.25, audioCtx.currentTime);
mainCompressor.connect(audioCtx.destination);

// 3. Noise Buffer
const noiseBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 2, audioCtx.sampleRate);
const noiseOutput = noiseBuffer.getChannelData(0);
for (let i = 0; i < noiseBuffer.length; i++) noiseOutput[i] = Math.random() * 2 - 1;

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    if (type === 'SHOOT') {
        const weapon = currentWeapon || 'PISTOL';
        const now = audioCtx.currentTime;

        // Cadeia: Source -> Filter -> Distortion -> Gain -> Compressor
        const gainNode = audioCtx.createGain();
        const distNode = audioCtx.createWaveShaper();
        const filterNode = audioCtx.createBiquadFilter();

        distNode.curve = distortionCurve;
        distNode.oversampling = '4x';

        filterNode.connect(distNode);
        distNode.connect(gainNode);
        gainNode.connect(mainCompressor);

        // Camada 1: Explosão (Ruído filtrado)
        const noise = audioCtx.createBufferSource();
        noise.buffer = noiseBuffer;
        const noiseFilter = audioCtx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noise.connect(noiseFilter);
        noiseFilter.connect(distNode);

        // Camada 2: O "Corpo" (Oscilador)
        const osc = audioCtx.createOscillator();
        osc.connect(filterNode);

        if (weapon === 'SHOTGUN') {
            filterNode.type = 'lowpass';
            filterNode.frequency.setValueAtTime(1000, now);
            osc.frequency.setValueAtTime(100, now);
            osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.3);

            noiseFilter.frequency.setValueAtTime(2000, now);
            noiseFilter.frequency.exponentialRampToValueAtTime(100, now + 0.2);

            gainNode.gain.setValueAtTime(0.8, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

            osc.start(now); osc.stop(now + 0.4);
            noise.start(now); noise.stop(now + 0.4);
        } else if (weapon === 'RIFLE') {
            filterNode.type = 'bandpass';
            filterNode.frequency.setValueAtTime(800, now);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(180, now);
            osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.12);

            noiseFilter.frequency.setValueAtTime(4000, now);

            gainNode.gain.setValueAtTime(0.4, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

            osc.start(now); osc.stop(now + 0.15);
            noise.start(now); noise.stop(now + 0.15);
        } else {
            // PISTOL
            filterNode.type = 'lowpass';
            filterNode.frequency.setValueAtTime(1500, now);
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.15);

            noiseFilter.frequency.setValueAtTime(3000, now);

            gainNode.gain.setValueAtTime(0.5, now);
            gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

            osc.start(now); osc.stop(now + 0.2);
            noise.start(now); noise.stop(now + 0.2);
        }
    } else if (type === 'STEP') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(50, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'RELOAD') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(800, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.start(); osc.stop(audioCtx.currentTime + 0.5);
    }
}

// --- SYSTEM STATE ---
let gameState = 'START';
let currentPhase = 1;
let coins = 0;
let currentWeapon = 'PISTOL'; // 'PISTOL', 'RIFLE', 'SHOTGUN'
let playerHp = 100;
const PLAYER_MAX_HP = 100;
let botHp = 100;
let botMaxHp = 100;
let currentMag = 20;
let reserveAmmo = 40;
let isReloading = false;
let isMouseDown = false;
let lastShotTime = 0;
let botAmmo = STATS.BOT.MAG_SIZE;
let botIsReloading = false;
let lastBotShot = 0;
let lastPlayerDamageTime = 0; // Para regeneração de vida
let obstacles = [];
let obstacleBoxes = []; // Caixas de colisão AABB
let solidObstacles = []; // Apenas paredes e objetos grandes (não grama)
let playerActor = null; // Para a cena de vitória
let bots = []; // Novo sistema de múltiplos bots
let footstepCooldown = 0;
const keys = {};

// --- THREE.JS SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020205);
scene.fog = new THREE.FogExp2(0x020205, 0.015);

// --- ESTRELAS (CÉU DINÂMICO) ---
function createStarfield() {
    const starGeo = new THREE.BufferGeometry();
    const starCount = 2000;
    const pos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) pos[i] = (Math.random() - 0.5) * 400;
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.8 });
    const stars = new THREE.Points(starGeo, starMat);
    scene.add(stars);
}
createStarfield();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const cameraHolder = new THREE.Group();
cameraHolder.add(camera);
scene.add(cameraHolder);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
document.getElementById('game-container').appendChild(renderer.domElement);

const controls = new PointerLockControls(cameraHolder, document.body);

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
};
createWeapon();

// --- MAP GENERATION ---
let floor;
function generateMap() {
    // Limpeza total de obstáculos e colidsores
    obstacles.forEach(o => scene.remove(o));
    obstacles = [];
    obstacleBoxes = [];

    if (floor) scene.remove(floor);
    floor = new THREE.Mesh(
        new THREE.PlaneGeometry(120, 120),
        new THREE.MeshStandardMaterial({ color: 0x0a0a15, roughness: 0.9, metalness: 0.1 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const addObj = (obj, x, z) => {
        // --- ÁREA DE SEGURANÇA NO SPAWN ---
        // Evita spawnar objetos a menos de 8 metros do jogador (0, 12)
        const distToPlayer = Math.sqrt(x * x + (z - 12) * (z - 12));
        if (distToPlayer < 8) return;

        // Evita spawnar objetos no centro (onde o bot costuma transitar)
        if (Math.abs(x) < 3 && Math.abs(z) < 3) return;

        obj.position.set(x, 0, z);
        obj.castShadow = true;
        obj.receiveShadow = true;
        scene.add(obj);
        obstacles.push(obj);

        // Criar caixa de colisão para o objeto
        const box = new THREE.Box3().setFromObject(obj);
        obstacleBoxes.push(box);
        solidObstacles.push(obj);
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
        solidObstacles.push(trunk);
    } // Fim do loop de árvores

    // --- LIMITES DO MAPA (PAREDES INVISÍVEIS) ---
    const wallSize = 120;
    const borderGeo = new THREE.BoxGeometry(wallSize, 10, 2);
    const borderMat = new THREE.MeshBasicMaterial({ visible: false });

    const b1 = new THREE.Mesh(borderGeo, borderMat); b1.position.set(0, 5, wallSize / 2); // Sul
    const b2 = new THREE.Mesh(borderGeo, borderMat); b2.position.set(0, 5, -wallSize / 2); // Norte
    const b3 = new THREE.Mesh(borderGeo, borderMat); b3.position.set(wallSize / 2, 5, 0); b3.rotation.y = Math.PI / 2; // Leste
    const b4 = new THREE.Mesh(borderGeo, borderMat); b4.position.set(-wallSize / 2, 5, 0); b4.rotation.y = Math.PI / 2; // Oeste

    [b1, b2, b3, b4].forEach(b => {
        scene.add(b);
        obstacleBoxes.push(new THREE.Box3().setFromObject(b));
    });

    // Containers e Caixas extras para diversão (Apenas uma vez)
    for (let i = 0; i < 10; i++) {
        const container = new THREE.Mesh(
            new THREE.BoxGeometry(4, 3, 8),
            new THREE.MeshStandardMaterial({ color: Math.random() < 0.5 ? 0x0000ff : 0xff0000 })
        );
        addObj(container, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90);
    }

    // --- CHÃO COM TEXTURA DE GRAMA (SIMULADA) ---
    const grassMat = new THREE.MeshStandardMaterial({
        color: 0x052d05,
        roughness: 0.8,
        metalness: 0.1
    });
    const grassFloor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), grassMat);
    grassFloor.rotation.x = -Math.PI / 2;
    grassFloor.receiveShadow = true;
    scene.add(grassFloor);
    floor = grassFloor;

    // --- DETALHES DE GRAMA 3D (FIOS) ---
    for (let i = 0; i < 300; i++) {
        const grass = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, Math.random() * 0.4, 0.05),
            new THREE.MeshStandardMaterial({ color: 0x114411 })
        );
        const gx = (Math.random() - 0.5) * 110;
        const gz = (Math.random() - 0.5) * 110;
        grass.position.set(gx, 0.1, gz);
        scene.add(grass);
        // NÃO ADICIONAR AO solidObstacles PARA NÃO PESAR A IA
    }
}

// --- HUMANOID BOT SNIPER AI ---
class HumanoidBot {
    constructor(isBoss = false) {
        this.isBoss = isBoss;
        this.id = Math.random().toString(36).substr(2, 9);
        this.hp = botMaxHp;
        this.maxHp = botMaxHp;
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
        this.mesh.visible = true;
        botHp = botMaxHp;
        botAmmo = 10;

        // Aparência diferente baseada na fase
        const clothesMat = this.mesh.children[1].material;
        if (currentPhase === 2) {
            clothesMat.color.set(0xff0000); // Roupas vermelhas na fase 2
            this.mesh.scale.set(1.2, 1.2, 1.2); // Um pouco maior
            STATS.BOT.ACCURACY = 0.85; // Mais preciso na f2
            STATS.BOT.RELOAD_TIME = 1200; // Recarga rápida
        } else {
            clothesMat.color.set(0x111111);
            STATS.BOT.ACCURACY = 0.75;
            STATS.BOT.RELOAD_TIME = 2000;
        }

        // --- APARÊNCIA DE BOSS (FASE 3) ---
        if (this.isBoss) {
            this.mesh.scale.set(5, 5, 5);
            this.mesh.children[0].material.color.set(0x000000); // Cabeça preta
            this.hp = 1000;
            this.maxHp = 1000;
        }

        // Criar elemento de interface para este bot se não existir
        if (!document.getElementById(`bar-wrapper-${this.id}`)) {
            this.createHealthBar();
        }
    }

    createHealthBar() {
        const container = document.getElementById('bots-health-container');
        const barWrapper = document.createElement('div');
        barWrapper.id = `bar-wrapper-${this.id}`;
        barWrapper.innerHTML = `
            <span style="font-size:0.7rem; color:var(--primary)">BOT ${this.isBoss ? 'BOSS' : 'ARENA'}</span>
            <div class="health-bar bot-health">
                <div id="fill-${this.id}" class="health-fill" style="width: 100%"></div>
            </div>
        `;
        container.appendChild(barWrapper);
    }

    updateUI() {
        const fill = document.getElementById(`fill-${this.id}`);
        if (fill) {
            const percent = (this.hp / this.maxHp) * 100;
            fill.style.width = percent + '%';
        }
    }

    update() {
        if (gameState !== 'PLAYING' || this.hp <= 0) {
            this.mesh.visible = false;
            return;
        }
        const dist = this.mesh.position.distanceTo(camera.position);
        const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();

        // Raycast Visibility Check (Subir um pouco para sair do chão)
        const scanStart = this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
        this.ray.set(scanStart, dir);

        // Verificamos apenas contra sólidos reais (ignora grama)
        const hits = this.ray.intersectObjects(solidObstacles, true);
        const hasLoS = (hits.length === 0 || hits[0].distance > dist);

        // --- SISTEMA DE COBERTURA (BOT COM POUCA VIDA) ---
        if (botHp < 30) {
            // Encontrar o obstáculo mais próximo para se esconder
            let nearestObs = null;
            let minDist = Infinity;
            obstacles.forEach(obs => {
                const d = this.mesh.position.distanceTo(obs.position);
                if (d < minDist) { minDist = d; nearestObs = obs; }
            });

            if (nearestObs) {
                // Direção do obstáculo em relação ao jogador (vetor de fuga)
                const hideDir = new THREE.Vector3().subVectors(nearestObs.position, camera.position).normalize();
                // O ponto ideal é um pouco "atrás" do obstáculo
                const targetHidePos = nearestObs.position.clone().addScaledVector(hideDir, 1.5);
                const toHideDir = new THREE.Vector3().subVectors(targetHidePos, this.mesh.position).normalize();

                if (this.mesh.position.distanceTo(targetHidePos) > 0.5) {
                    this.moveBot(toHideDir, STATS.BOT.SPEED * 1.2); // Corre mais quando está com medo
                    this.mesh.lookAt(targetHidePos.x, 0, targetHidePos.z);
                }
            }

            // Regeneração lenta em cobertura
            if (!hasLoS) {
                botHp = Math.min(botMaxHp, botHp + 0.05); // Recupera vida fugindo da mira (respeita maxHp)
                checkGameState();
            }

            // Se recuperou vida suficiente (ex: > 60%), volta a lutar
            if (botHp > (botMaxHp * 0.6)) { /* volta ao normal */ }
        } else if (hasLoS) {
            // IA DE ATAQUE (Já existente com Strafe)
            this.mesh.lookAt(camera.position.x, 0, camera.position.z);
            this.rArm.lookAt(camera.position);
            this.rArm.rotation.x += Math.PI / 2;

            if (dist > 7) this.moveBot(dir, STATS.BOT.SPEED);
            else if (dist < 4) this.moveBot(dir.clone().negate(), STATS.BOT.SPEED * 0.8);

            if (!this.strafeTime || Date.now() > this.strafeTime) {
                this.strafeDir = Math.random() < 0.5 ? 1 : -1;
                this.strafeTime = Date.now() + 500 + Math.random() * 1000;
            }
            const sideMovement = new THREE.Vector3(-dir.z, 0, dir.x);
            this.moveBot(sideMovement, STATS.BOT.SPEED * 0.7 * this.strafeDir);

            const botFireRate = (currentPhase >= 2) ? 800 : 1200;
            if (!botIsReloading && dist <= STATS.BOT.MAX_RANGE && Date.now() - lastBotShot > botFireRate) {
                this.shoot();
            }

            // --- LANÇAR GRANADA (NOVO!) ---
            if (!this.lastGrenade) this.lastGrenade = 0;
            if (dist > 12 && hasLoS && Date.now() - this.lastGrenade > 7000) {
                this.throwGrenade(camera.position);
                this.lastGrenade = Date.now();
            }
        } else {
            // IA DE FLANQUEIO
            const sideDir = new THREE.Vector3(-dir.z, 0, dir.x);
            this.moveBot(sideDir, STATS.BOT.SPEED * 0.5);
            this.mesh.lookAt(camera.position.x, 0, camera.position.z);
        }
        this.mesh.position.y = Math.sin(Date.now() * 0.005) * 0.05;
    }

    moveBot(direction, speed) {
        // --- EVITAR OUTROS BOTS ---
        bots.forEach(other => {
            if (other === this || other.hp <= 0) return;
            const dist = this.mesh.position.distanceTo(other.mesh.position);
            if (dist < 2) {
                const pushDir = new THREE.Vector3().subVectors(this.mesh.position, other.mesh.position).normalize();
                direction.addScaledVector(pushDir, 0.5); // Força de separação
            }
        });

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

    throwGrenade(targetPos) {
        console.log("BOT LANÇOU GRANADA!");
        const gear = new THREE.Mesh(new THREE.SphereGeometry(0.3), new THREE.MeshStandardMaterial({ color: 0x00ff00 }));
        gear.position.copy(this.mesh.position).add(new THREE.Vector3(0, 2, 0));
        scene.add(gear);

        const dir = new THREE.Vector3().subVectors(targetPos, gear.position).normalize();
        let time = 0;
        const gLoop = () => {
            time += 0.05;
            gear.position.addScaledVector(dir, 0.4);
            gear.position.y += Math.sin(time) * 0.1;
            if (time < 3) requestAnimationFrame(gLoop);
            else {
                // Explosão
                const exp = new THREE.Mesh(new THREE.SphereGeometry(3), new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0.5 }));
                exp.position.copy(gear.position);
                scene.add(exp);
                if (camera.position.distanceTo(exp.position) < 4) {
                    playerHp -= 30; checkGameState();
                    document.body.style.filter = "blur(5px)";
                    setTimeout(() => document.body.style.filter = "none", 500);
                }
                scene.remove(gear);
                setTimeout(() => scene.remove(exp), 300);
            }
        };
        gLoop();
    }

    shoot() {
        if (botAmmo <= 0) {
            botIsReloading = true;
            setTimeout(() => { botAmmo = 10; botIsReloading = false; }, STATS.BOT.RELOAD_TIME);
            return;
        }
        botAmmo--; lastBotShot = Date.now();

        const hit = Math.random() < STATS.BOT.ACCURACY;
        const dir = new THREE.Vector3().subVectors(camera.position, this.mesh.position).normalize();

        // Tracer do Bot (Cor Amarela para unificar)
        const tracerGeo = new THREE.BufferGeometry().setFromPoints([
            this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
            hit ? camera.position.clone().add(new THREE.Vector3(0, -0.5, 0)) : this.mesh.position.clone().addScaledVector(dir, 50)
        ]);
        const tracerMat = new THREE.LineBasicMaterial({ color: 0xffff00, transparent: true, opacity: 0.8 });
        const tracer = new THREE.Line(tracerGeo, tracerMat);
        scene.add(tracer);
        setTimeout(() => scene.remove(tracer), 40); // Some em 40ms

        if (hit) {
            playerHp -= STATS.BOT.DAMAGE;
            lastPlayerDamageTime = Date.now();
            checkGameState();

            document.body.style.boxShadow = "inset 0 0 50px #ff0000";
            setTimeout(() => document.body.style.boxShadow = "none", 100);
        }
    }

    die() {
        this.mesh.visible = false;
        const wrapper = document.getElementById(`bar-wrapper-${this.id}`);
        if (wrapper) wrapper.remove();
        checkGameState();
    }
} // <--- FECHAMENTO DA CLASSE HUMANOIDBOT
const bot = null; // Removido bot global solto
let isPaused = false;
let cameraRecoilX = 0; // Para recuperar a rotação vertical
let cameraRecoilZ = 0; // Para recuperar a "torção" (roll)
let cameraPunchY = 0; // Para o shake vertical suave

// --- GAMEPLAY CORE ---
function checkGameState() {
    const playerPercent = (playerHp / PLAYER_MAX_HP) * 100;
    const playerFill = document.getElementById('player-health-fill');
    if (playerFill) playerFill.style.width = playerPercent + '%';
    document.getElementById('ammo-count').innerText = currentMag;
    document.getElementById('total-ammo').innerText = reserveAmmo;
    document.getElementById('coin-count').innerText = coins;
    document.getElementById('phase-display').innerText = `FASE ${currentPhase}`;

    // Atualizar UI de todos os bots vivos
    bots.forEach(b => b.updateUI());

    // HUD de Bot
    const botsHud = document.getElementById('bots-health-container');
    if (botsHud) botsHud.classList.remove('hidden');

    if (playerHp <= 0 && gameState === 'PLAYING') {
        gameState = 'GAMEOVER';
        document.getElementById('game-over-overlay').classList.remove('hidden');
        controls.unlock();
    }

    const aliveBots = bots.filter(b => b.hp > 0);
    if (aliveBots.length === 0 && gameState === 'PLAYING') {
        gameState = 'VICTORY';
        coins += 50;
        document.getElementById('coin-count').innerText = coins;
        runVictorySequence();
    }
}

function handleShoot() {
    if (isReloading || gameState !== 'PLAYING' || currentMag <= 0) return;

    // Controle de cadência (Rifle: 100ms, Shotgun: 800ms, Pistola: 400ms)
    let fireRate = 400;
    if (currentWeapon === 'RIFLE') fireRate = 100;
    else if (currentWeapon === 'SHOTGUN') fireRate = 800;

    if (Date.now() - lastShotTime < fireRate) return;

    lastShotTime = Date.now();
    currentMag--;
    weaponProxy.position.z += 0.3; // Recuo visual da arma
    playSound('SHOOT');

    // Muzzle Flash Effect (Luz rápida)
    const flash = new THREE.PointLight(0xffcc00, 10, 10);
    const flashDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    flash.position.copy(camera.position).add(flashDir.multiplyScalar(1));
    scene.add(flash);
    setTimeout(() => scene.remove(flash), 40);

    // Efeito de "Soco" na Câmera (Recuo & Inclinação)
    const shake = currentWeapon === 'SHOTGUN' ? 0.08 : 0.025;

    // Inclinação para a DIREITA conforme solicitado para o Rifle
    let tilt = 0;
    if (currentWeapon === 'RIFLE') {
        tilt = -0.015; // Rotação Z negativa inclina para a direita no Three.js
    } else {
        tilt = (Math.random() - 0.5) * 0.01;
    }

    camera.rotation.x += (shake * 0.4);
    camera.rotation.z += tilt;

    // Guardar valores para o loop desfazer suavemente no objeto CAMERA (que é imune ao mouse do holder)
    cameraRecoilX += (shake * 0.4);
    cameraRecoilZ += tilt;

    // Soco rápido na posição
    camera.position.y += shake;
    setTimeout(() => {
        camera.position.y -= shake;
    }, 40);

    let hitSomething = false;
    const pellets = currentWeapon === 'SHOTGUN' ? 6 : 1;
    const spread = currentWeapon === 'SHOTGUN' ? 0.08 : 0.01;

    for (let i = 0; i < pellets; i++) {
        const ray = new THREE.Raycaster();
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

        if (currentWeapon === 'SHOTGUN') {
            dir.x += (Math.random() - 0.5) * spread;
            dir.y += (Math.random() - 0.5) * spread;
            dir.normalize();
        }

        ray.set(camera.position, dir);

        let targetBot = null;
        let bestBotDist = Infinity;
        let hitPoint = null; // LOCAL SCOPE FIX

        bots.forEach(b => {
            const hits = ray.intersectObject(b.mesh, true);
            if (hits.length > 0 && hits[0].distance < bestBotDist) {
                bestBotDist = hits[0].distance;
                targetBot = b;
                hitPoint = hits[0].point;
            }
        });

        const hitsObs = ray.intersectObjects(obstacles, true);
        const obsDist = hitsObs.length > 0 ? hitsObs[0].distance : Infinity;

        let damage = STATS.PLAYER.DAMAGE;
        if (currentWeapon === 'RIFLE') damage = 15;
        else if (currentWeapon === 'SHOTGUN') damage = 8;

        if (targetBot && bestBotDist < obsDist) {
            targetBot.hp -= damage;
            if (targetBot.hp <= 0) targetBot.die();
            else if (currentPhase !== 2) botHp = targetBot.hp; // Fallback para sistemas que ainda usem botHp global
            hitSomethingInPellet = true;
            hitSomething = true;
        } else if (hitsObs.length > 0) {
            hitPoint = hitsObs[0].point;
            hitSomethingInPellet = true;
        }

        // Tracer for each pellet
        const tracerGeo = new THREE.BufferGeometry().setFromPoints([
            camera.position.clone().add(new THREE.Vector3(0.3, -0.3, -0.5).applyQuaternion(camera.quaternion)),
            hitPoint || camera.position.clone().add(dir.multiplyScalar(50))
        ]);
        const tracerMat = new THREE.LineBasicMaterial({
            color: 0xffff00,
            transparent: true, opacity: 0.8
        });
        const tracer = new THREE.Line(tracerGeo, tracerMat);
        scene.add(tracer);
        setTimeout(() => scene.remove(tracer), 30); // Tiro do player some ainda mais rápido

        if (hitSomethingInPellet && hitPoint) {
            const spark = new THREE.Mesh(new THREE.SphereGeometry(0.04), new THREE.MeshBasicMaterial({ color: 0xffffff }));
            spark.position.copy(hitPoint);
            scene.add(spark);
            setTimeout(() => scene.remove(spark), 100);
        }
    }

    checkGameState();
    if (hitSomething) showHitMarker();
    if (currentMag === 0) handleReload();
}

function showHitMarker() {
    const crosshair = document.getElementById('crosshair');
    crosshair.style.borderColor = '#ff0000';
    crosshair.style.transform = 'translate(-50%, -50%) scale(1.5)';
    setTimeout(() => {
        crosshair.style.borderColor = 'rgba(255, 255, 255, 0.8)';
        crosshair.style.transform = 'translate(-50%, -50%) scale(1)';
    }, 100);
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
                const magSize = currentWeapon === 'RIFLE' ? 30 : (currentWeapon === 'SHOTGUN' ? 12 : 20);
                const needed = magSize - currentMag;
                const toReload = Math.min(needed, reserveAmmo);
                reserveAmmo -= toReload;
                currentMag += toReload;
                weaponProxy.position.y = initialY; // CORREÇÃO: Volta a arma para a posição original
                isReloading = false; checkGameState();
                playSound('RELOAD');
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

    // Limpar ator anterior se houver
    if (playerActor) scene.remove(playerActor);

    // Pegar o mesh de um dos bots para a sequência de vitória
    const templateMesh = (bots.length > 0) ? bots[0].mesh : new THREE.Group();
    playerActor = templateMesh.clone();
    playerActor.visible = true;
    playerActor.position.set(0, 0, 0);
    scene.add(playerActor);

    // Esconder todos os bots originais
    bots.forEach(b => b.mesh.visible = false);
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

function fullReset() {
    if (playerActor) scene.remove(playerActor);
    location.reload();
}

window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);
window.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
        isMouseDown = true;
        if (currentWeapon === 'PISTOL') handleShoot(); // Pistola é um clique por vez
    }
});
window.addEventListener('mouseup', () => isMouseDown = false);

// Ajuste no loop para tiro automático
function autoFire() {
    if (isMouseDown && currentWeapon !== 'PISTOL' && gameState === 'PLAYING') {
        handleShoot();
    }
    // RECARGA AUTOMÁTICA
    if (currentMag === 0 && !isReloading && reserveAmmo > 0 && gameState === 'PLAYING') {
        handleReload();
    }
}

function nextPhase() {
    currentPhase++;
    document.getElementById('victory-overlay').classList.add('hidden');

    // Limpar o ator da vitória da cena para evitar "arma flutuando"
    if (playerActor) {
        scene.remove(playerActor);
        playerActor = null;
    }

    // Reset Player
    playerHp = PLAYER_MAX_HP;
    const magSize = currentWeapon === 'RIFLE' ? 30 : (currentWeapon === 'SHOTGUN' ? 12 : 20);
    const reserveSize = currentWeapon === 'RIFLE' ? 120 : (currentWeapon === 'SHOTGUN' ? 36 : 40);
    currentMag = magSize;
    reserveAmmo = reserveSize;

    // Reset Map
    generateMap();
    bots.forEach(b => scene.remove(b.mesh));
    document.getElementById('bots-health-container').innerHTML = ''; // Limpa HUD
    bots = [];

    if (currentPhase === 2) {
        botMaxHp = 150;
        bots.push(new HumanoidBot(), new HumanoidBot());
    } else if (currentPhase >= 3) {
        botMaxHp = 1000;
        const boss = new HumanoidBot(true); // Passa isBoss = true
        bots.push(boss);
        alert("FASE 3: O BOSS GIGANTE APARECEU!");
    }

    bots.forEach(b => b.reset());

    // RESET CAMERA PARA EVITAR "FLUTUAR"
    camera.position.set(0, 1.7, 12);
    camera.lookAt(0, 1.7, 0);

    gameState = 'PLAYING';
    controls.lock();
}

function openShop() {
    document.getElementById('shop-overlay').classList.remove('hidden');
    controls.unlock();
}

function buyRifle() {
    if (coins >= 50 && currentWeapon !== 'RIFLE') {
        coins -= 50;
        currentWeapon = 'RIFLE';
        document.getElementById('coin-count').innerText = coins;
        updateShopButtons();

        // Visual do Rifle (longo e fino)
        weaponProxy.children[0].scale.set(1, 1, 2);
        weaponProxy.children[0].position.z = -0.6;

        alert("RIFLE ADQUIRIDO! Atire segurando o mouse.");
    } else if (currentWeapon === 'RIFLE') {
        alert("Já possui o Rifle!");
    } else {
        alert("Moedas insuficientes!");
    }
}

function buyShotgun() {
    if (coins >= 80 && currentWeapon !== 'SHOTGUN') {
        coins -= 80;
        currentWeapon = 'SHOTGUN';
        document.getElementById('coin-count').innerText = coins;
        updateShopButtons();

        // Visual da Shotgun (larga e curta)
        weaponProxy.children[0].scale.set(2.5, 1.2, 1);
        weaponProxy.children[0].position.z = -0.3;

        alert("ESCRAVOLTA ADQUIRIDA! Dano massivo a curta distância.");
    } else if (currentWeapon === 'SHOTGUN') {
        alert("Já possui a Shotgun!");
    } else {
        alert("Moedas insuficientes!");
    }
}

function buyPistol() {
    currentWeapon = 'PISTOL';
    updateShopButtons();

    // Visual da Pistola (padrão)
    weaponProxy.children[0].scale.set(1, 1, 1);
    weaponProxy.children[0].position.z = -0.3;

    alert("PISTOLA EQUIPADA!");
}

function updateShopButtons() {
    document.getElementById('buy-rifle').innerText = currentWeapon === 'RIFLE' ? "EQUIPADO" : "COMPRAR (50 MOEDAS)";
    document.getElementById('buy-rifle').disabled = currentWeapon === 'RIFLE';

    document.getElementById('buy-shotgun').innerText = currentWeapon === 'SHOTGUN' ? "EQUIPADO" : "COMPRAR (80 MOEDAS)";
    document.getElementById('buy-shotgun').disabled = currentWeapon === 'SHOTGUN';

    document.getElementById('buy-pistol').innerText = currentWeapon === 'PISTOL' ? "EQUIPADO" : "EQUIPAR PISTOLA (GRÁTIS)";
    document.getElementById('buy-pistol').disabled = currentWeapon === 'PISTOL';
}

function buyMedkit() {
    if (coins >= 30) {
        if (playerHp >= PLAYER_MAX_HP) {
            alert("Vida já está cheia!");
            return;
        }
        coins -= 30;
        playerHp = Math.min(PLAYER_MAX_HP, playerHp + 50);
        document.getElementById('coin-count').innerText = coins;
        checkGameState();
        alert("Vida recuperada!");
    } else {
        alert("Moedas insuficientes!");
    }
}

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

        // --- SOM DE PASSOS ---
        if (Date.now() > footstepCooldown) {
            playSound('STEP');
            camera.position.y += Math.sin(Date.now() * 0.01) * 0.05;
            footstepCooldown = Date.now() + 350;
        }

        // Tentativa de movimento no eixo X
        const nextPosX = cameraHolder.position.clone();
        nextPosX.x += moveVector.x;
        if (!checkPlayerCollision(nextPosX)) {
            cameraHolder.position.x = nextPosX.x;
        }

        // Tentativa de movimento no eixo Z
        const nextPosZ = cameraHolder.position.clone();
        nextPosZ.z += moveVector.z;
        if (!checkPlayerCollision(nextPosZ)) {
            cameraHolder.position.z = nextPosZ.z;
        }
    }
}

function loop() {
    requestAnimationFrame(loop);

    if (isPaused) return;

    if (gameState === 'PLAYING') {
        move();
        bots.forEach(b => b.update()); // Atualiza todos os bots
        autoFire();

        // --- SISTEMA DE REGENERAÇÃO ---
        if (playerHp < PLAYER_MAX_HP && Date.now() - lastPlayerDamageTime > 5000) {
            playerHp = Math.min(PLAYER_MAX_HP, playerHp + 0.08); // Recupera vida suavemente
            checkGameState();
        }

        // --- LUZ DE COMBATE (LOW HP) ---
        if (playerHp < 30) {
            const intensity = Math.abs(Math.sin(Date.now() * 0.005)) * 0.5;
            ambient.intensity = 0.6 + intensity;
            ambient.color.setHex(0xff0000);
        } else {
            ambient.intensity = 0.6;
            ambient.color.setHex(0xffffff);
        }

        // --- MÚSICA DE COMBATE (placeholder / visual) ---
        if (bots.some(b => b.hp < (botMaxHp * 0.3))) {
            // Intensificar efeitos visuais se o bot principal estiver morrendo
            sun.intensity = 1.5 + Math.sin(Date.now() * 0.01) * 0.5;
        }

        weaponProxy.position.z += (-0.4 - weaponProxy.position.z) * 0.1;

        // --- RECUPERAÇÃO DE RECUO DA CÂMERA (AUTO-CENTERING) ---
        if (Math.abs(cameraRecoilX) > 0.0001) {
            const step = cameraRecoilX * 0.15; // Velocidade de retorno
            camera.rotation.x -= step;
            cameraRecoilX -= step;
        }
        if (Math.abs(cameraRecoilZ) > 0.0001) {
            const step = cameraRecoilZ * 0.15;
            camera.rotation.z -= step;
            cameraRecoilZ -= step;
        } else {
            camera.rotation.z = 0;
            cameraRecoilZ = 0;
        }

        renderer.render(scene, camera);
    } else if (gameState === 'START') {
        renderer.render(scene, camera);
    }
}

document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-overlay').classList.add('hidden');
    cameraHolder.position.set(0, 1.7, 12);
    camera.position.set(0, 0, 0); // Reset do soco/kick
    gameState = 'PLAYING'; controls.lock(); loop();
});

document.getElementById('next-phase-btn').addEventListener('click', nextPhase);
document.getElementById('shop-btn-vic').addEventListener('click', openShop);
document.getElementById('close-shop').addEventListener('click', () => {
    document.getElementById('shop-overlay').classList.add('hidden');
});
document.getElementById('buy-rifle').addEventListener('click', buyRifle);
document.getElementById('buy-shotgun').addEventListener('click', buyShotgun);
document.getElementById('buy-pistol').addEventListener('click', buyPistol);
document.getElementById('buy-medkit').addEventListener('click', buyMedkit);
document.getElementById('retry-btn').addEventListener('click', () => {
    document.getElementById('game-over-overlay').classList.add('hidden');
    playerHp = 100;
    botHp = botMaxHp;
    currentMag = 20;
    gameState = 'PLAYING';
    controls.lock();
    checkGameState();
});
document.getElementById('reset-btn').addEventListener('click', fullReset);

// --- SISTEMA DE PAUSA ---
function togglePause() {
    if (gameState !== 'PLAYING') return;
    isPaused = !isPaused;
    const pauseOverlay = document.getElementById('pause-overlay');
    if (isPaused) {
        pauseOverlay.classList.remove('hidden');
        controls.unlock();
    } else {
        pauseOverlay.classList.add('hidden');
        controls.lock();
    }
}

document.getElementById('resume-btn').addEventListener('click', togglePause);

controls.addEventListener('unlock', () => {
    if (gameState === 'PLAYING' && !isPaused && !document.getElementById('shop-overlay').classList.contains('hidden') === false) {
        // Se o jogador pressionar ESC sem ser pelo shop ou menu, pausamos
        if (gameState === 'PLAYING') {
            isPaused = true;
            document.getElementById('pause-overlay').classList.remove('hidden');
        }
    }
});

window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
        togglePause();
    }
});

console.log("Iniciando Arena...");
try {
    generateMap();
    checkGameState();

    // Inicializar o primeiro bot (SOMENTE UM NA FASE 1)
    bots.forEach(b => {
        scene.remove(b.mesh);
        const wrapper = document.getElementById(`bar-wrapper-${b.id}`);
        if (wrapper) wrapper.remove();
    });
    document.getElementById('bots-health-container').innerHTML = '';
    bots = [];
    const bot1 = new HumanoidBot();
    bots.push(bot1);
    // bot1.reset() removido para não duplicar a criação da barra de vida no constructor

    console.log("Jogo pronto para iniciar!");
} catch (err) {
    console.error("Erro na inicialização:", err);
}
