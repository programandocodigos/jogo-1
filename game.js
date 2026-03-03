/**
 * Box Fight Shooter - Logic
 * Developed by AntiGravity
 */

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score-val');
const levelEl = document.getElementById('level-val');
const startBtn = document.getElementById('start-btn');
const startOverlay = document.getElementById('start-overlay');
const victoryOverlay = document.getElementById('victory-overlay');

// Configuration
const GRID_SIZE = 20;
const TILE_SIZE = 40; // 800 / 20
const PLAYER_SPEED = 4;
const BASE_BOT_SPEED = 2;
const BULLET_SPEED = 7;
const BOT_SHOOT_INTERVAL = 1500; // ms

// Game State
let gameState = 'START'; // START, PLAYING, VICTORY
let score = 0;
let level = 1;
let walls = [];
let player = null;
let bot = null;
let bullets = [];
let keys = {};
let mouse = { x: 0, y: 0 };

// Setup Canvas size
canvas.width = 800;
canvas.height = 800;

// --- Entity Classes ---

class Wall {
    constructor(x, y, w, h) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
    }

    draw() {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(this.x, this.y, this.w, this.h);

        // Border
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.strokeRect(this.x, this.y, this.w, this.h);

        // Inner highlight
        ctx.fillStyle = '#2d3748';
        ctx.fillRect(this.x + 4, this.y + 4, this.w - 8, this.h - 8);
    }
}

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 15;
        this.angle = 0;
        this.scale = 1;
        this.rotation = 0;
    }

    update() {
        if (gameState !== 'PLAYING') return;

        // Movement
        let dx = 0;
        let dy = 0;
        if (keys['w'] || keys['ArrowUp']) dy -= PLAYER_SPEED;
        if (keys['s'] || keys['ArrowDown']) dy += PLAYER_SPEED;
        if (keys['a'] || keys['ArrowLeft']) dx -= PLAYER_SPEED;
        if (keys['d'] || keys['ArrowRight']) dx += PLAYER_SPEED;

        // Normalize diagonal speed
        if (dx !== 0 && dy !== 0) {
            dx *= 0.7071;
            dy *= 0.7071;
        }

        // Collision detection X
        this.x += dx;
        if (this.checkWallCollision()) this.x -= dx;

        // Collision detection Y
        this.y += dy;
        if (this.checkWallCollision()) this.y -= dy;

        // Aiming
        const rect = canvas.getBoundingClientRect();
        const mx = mouse.x - rect.left;
        const my = mouse.y - rect.top;
        this.angle = Math.atan2(my - this.y, mx - this.x);
    }

    checkWallCollision() {
        for (let wall of walls) {
            if (this.x + this.radius > wall.x &&
                this.x - this.radius < wall.x + wall.w &&
                this.y + this.radius > wall.y &&
                this.y - this.radius < wall.y + wall.h) {
                return true;
            }
        }
        return false;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle + this.rotation);
        ctx.scale(this.scale, this.scale);

        // Body
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#6366f1';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Gun/Facing indicator
        ctx.fillStyle = '#4338ca';
        ctx.fillRect(this.radius - 5, -5, 15, 10);
        ctx.strokeRect(this.radius - 5, -5, 15, 10);

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(5, -6, 3, 0, Math.PI * 2);
        ctx.arc(5, 6, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    startVictoryAnimation() {
        let startTime = Date.now();
        const anim = () => {
            let elapsed = Date.now() - startTime;
            if (elapsed < 2000) {
                // Pulse and spin
                const t = elapsed / 2000;
                this.scale = 1 + Math.sin(elapsed * 0.01) * 0.3;
                this.rotation = (elapsed * 0.02) % (Math.PI * 2);
                requestAnimationFrame(anim);
            } else {
                this.scale = 1;
                this.rotation = 0;
            }
        };
        anim();
    }
}

class Bot {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = 15;
        this.angle = 0;
        this.targetAngle = 0;
        this.state = 'WANDER'; // WANDER, CHASE
        this.lastShot = 0;
        this.velocity = { x: 0, y: 0 };
        this.wanderTimer = 0;
        this.speed = BASE_BOT_SPEED + Math.min(level * 0.1, 2);
    }

    update() {
        if (gameState !== 'PLAYING') return;

        const distToPlayer = Math.hypot(player.x - this.x, player.y - this.y);

        //Vision check
        let canSeePlayer = distToPlayer < 350;

        if (canSeePlayer) {
            this.state = 'CHASE';
        } else if (distToPlayer > 450) {
            this.state = 'WANDER';
        }

        if (this.state === 'CHASE') {
            const angleToPlayer = Math.atan2(player.y - this.y, player.x - this.x);
            // Smoothly rotate towards player
            let diff = angleToPlayer - this.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            this.angle += diff * 0.1;

            // Move towards player but keep some distance
            if (distToPlayer > 180) {
                this.velocity.x = Math.cos(this.angle) * this.speed;
                this.velocity.y = Math.sin(this.angle) * this.speed;
            } else {
                this.velocity.x = 0;
                this.velocity.y = 0;
            }

            // Shoot
            if (Date.now() - this.lastShot > BOT_SHOOT_INTERVAL) {
                this.shoot();
                this.lastShot = Date.now();
            }
        } else {
            // Wander
            if (Date.now() > this.wanderTimer) {
                this.targetAngle = Math.random() * Math.PI * 2;
                this.wanderTimer = Date.now() + 2000 + Math.random() * 2000;
            }

            let diff = this.targetAngle - this.angle;
            while (diff < -Math.PI) diff += Math.PI * 2;
            while (diff > Math.PI) diff -= Math.PI * 2;
            this.angle += diff * 0.05;

            this.velocity.x = Math.cos(this.angle) * this.speed * 0.7;
            this.velocity.y = Math.sin(this.angle) * this.speed * 0.7;
        }

        // Apply movement with collision
        this.x += this.velocity.x;
        if (this.checkWallCollision()) {
            this.x -= this.velocity.x;
            this.targetAngle += Math.PI;
            if (this.state === 'CHASE') this.state = 'WANDER';
        }

        this.y += this.velocity.y;
        if (this.checkWallCollision()) {
            this.y -= this.velocity.y;
            this.targetAngle += Math.PI;
            if (this.state === 'CHASE') this.state = 'WANDER';
        }
    }

    checkWallCollision() {
        for (let wall of walls) {
            if (this.x + this.radius > wall.x &&
                this.x - this.radius < wall.x + wall.w &&
                this.y + this.radius > wall.y &&
                this.y - this.radius < wall.y + wall.h) {
                return true;
            }
        }
        return false;
    }

    shoot() {
        bullets.push(new Bullet(this.x, this.y, this.angle, 'BOT'));
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Body
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#e11d48';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Gun
        ctx.fillStyle = '#9f1239';
        ctx.fillRect(this.radius - 5, -5, 15, 10);
        ctx.strokeRect(this.radius - 5, -5, 15, 10);

        // Angry Eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.moveTo(3, -8); ctx.lineTo(10, -5); ctx.lineTo(10, -2); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(3, 8); ctx.lineTo(10, 5); ctx.lineTo(10, 2); ctx.fill();

        ctx.restore();
    }
}

class Bullet {
    constructor(x, y, angle, owner) {
        this.x = x;
        this.y = y;
        this.angle = angle;
        this.owner = owner; // 'PLAYER' or 'BOT'
        this.radius = 4;
        this.speed = BULLET_SPEED;
        this.active = true;
    }

    update() {
        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        // Wall collision
        for (let wall of walls) {
            if (this.x > wall.x && this.x < wall.x + wall.w &&
                this.y > wall.y && this.y < wall.y + wall.h) {
                this.active = false;
                return;
            }
        }

        // Entity collision
        if (this.owner === 'PLAYER') {
            const dist = Math.hypot(bot.x - this.x, bot.y - this.y);
            if (dist < bot.radius + this.radius) {
                this.active = false;
                onBotKilled();
            }
        } else {
            const dist = Math.hypot(player.x - this.x, player.y - this.y);
            if (dist < player.radius + this.radius) {
                this.active = false;
            }
        }

        // Screen bounds
        if (this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
            this.active = false;
        }
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.owner === 'PLAYER' ? '#fbbf24' : '#f87171';
        ctx.fill();

        ctx.strokeStyle = this.owner === 'PLAYER' ? 'rgba(251, 191, 36, 0.4)' : 'rgba(248, 113, 113, 0.4)';
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - Math.cos(this.angle) * 15, this.y - Math.sin(this.angle) * 15);
        ctx.stroke();
    }
}

// --- World Generation ---

function generateMap() {
    walls = [];

    // Borders
    const BORDER = 20;
    walls.push(new Wall(0, 0, canvas.width, BORDER));
    walls.push(new Wall(0, canvas.height - BORDER, canvas.width, BORDER));
    walls.push(new Wall(0, 0, BORDER, canvas.height));
    walls.push(new Wall(canvas.width - BORDER, 0, BORDER, canvas.height));

    const density = Math.min(0.3 + level * 0.02, 0.6);

    for (let i = 2; i < GRID_SIZE - 2; i += 2) {
        for (let j = 2; j < GRID_SIZE - 2; j += 2) {
            if (Math.random() < density) {
                let w = TILE_SIZE;
                let h = TILE_SIZE;
                if (Math.random() > 0.5) w *= 2;
                else h *= 2;

                walls.push(new Wall(i * TILE_SIZE, j * TILE_SIZE, w, h));
            }
        }
    }

    spawnPlayerAndBot();
}

function spawnPlayerAndBot() {
    const getClearSpot = () => {
        let x, y, tries = 0;
        let clear = false;
        while (!clear && tries < 500) {
            x = 60 + Math.random() * (canvas.width - 120);
            y = 60 + Math.random() * (canvas.height - 120);
            clear = !checkSpotCollision(x, y);
            tries++;
        }
        return { x, y };
    };

    function checkSpotCollision(x, y) {
        for (let wall of walls) {
            const buffer = 30;
            if (x + buffer > wall.x && x - buffer < wall.x + wall.w &&
                y + buffer > wall.y && y - buffer < wall.y + wall.h) return true;
        }
        return false;
    }

    const pSpot = getClearSpot();
    player = new Player(pSpot.x, pSpot.y);

    let bSpot;
    let tries = 0;
    do {
        bSpot = getClearSpot();
        tries++;
    } while (Math.hypot(bSpot.x - pSpot.x, bSpot.y - pSpot.y) < 300 && tries < 100);

    bot = new Bot(bSpot.x, bSpot.y);
    bullets = [];
}

// --- Game Logic ---

function onBotKilled() {
    gameState = 'VICTORY';
    score += 100;
    scoreEl.innerText = score;

    victoryOverlay.classList.remove('hidden');
    player.startVictoryAnimation();

    setTimeout(() => {
        victoryOverlay.classList.add('hidden');
        level++;
        levelEl.innerText = level;
        resetRound();
    }, 2000);
}

function resetRound() {
    generateMap();
    gameState = 'PLAYING';
}

function update() {
    if (gameState === 'PLAYING') {
        player.update();
        bot.update();
        bullets.forEach((b, i) => {
            b.update();
            if (!b.active) bullets.splice(i, 1);
        });
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background pattern
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= canvas.width; i += TILE_SIZE) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for (let i = 0; i <= canvas.height; i += TILE_SIZE) {
        ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    walls.forEach(w => w.draw());
    bullets.forEach(b => b.draw());

    if (bot) bot.draw();
    if (player) player.draw();
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// --- Inputs ---

window.addEventListener('keydown', e => keys[e.key] = true);
window.addEventListener('keyup', e => keys[e.key] = false);
window.addEventListener('mousemove', e => {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
});
window.addEventListener('mousedown', e => {
    if (gameState === 'PLAYING' && e.button === 0) {
        bullets.push(new Bullet(player.x, player.y, player.angle, 'PLAYER'));
    }
});

startBtn.addEventListener('click', () => {
    startOverlay.classList.add('hidden');
    level = 1;
    score = 0;
    levelEl.innerText = level;
    scoreEl.innerText = score;
    generateMap();
    gameState = 'PLAYING';
});

// Start
gameLoop();
