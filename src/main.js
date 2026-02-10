import { gameContext } from './gameContext.js';
import { Audio } from './audio.js';
import {
    WEAPONS,
    SECONDARIES,
    WEAPON_UPGRADES,
    PLAYER_ACCEL,
    PLAYER_FRICTION,
    DASH_COOLDOWN,
    DASH_DURATION,
    DASH_IMPULSE,
    GRENADE_COOLDOWN,
    SLOW_MO_FACTOR,
    FOCUS_DRAIN,
    FOCUS_REGEN,
    normalizeAngle,
    getWeaponStats,
    Bullet,
    Grenade,
    Mine,
    Turret,
    Pickup
} from './player.js';
import { Enemy, BossFragment, Debris, Particle } from './enemy.js';

class ChunkManager {
    constructor(worldSize, chunkSize) {
        this.chunkSize = chunkSize;
        this.cols = Math.ceil(worldSize / chunkSize);
        this.rows = Math.ceil(worldSize / chunkSize);
        this.chunks = [];
        for (let x = 0; x < this.cols; x++) {
            this.chunks[x] = [];
            for (let y = 0; y < this.rows; y++) {
                const c = document.createElement('canvas');
                c.width = chunkSize;
                c.height = chunkSize;
                this.chunks[x][y] = { canvas: c, ctx: c.getContext('2d') };
            }
        }
        this.reset();
    }
    reset() {
        for (let x = 0; x < this.cols; x++) {
            for (let y = 0; y < this.rows; y++) {
                const ctx = this.chunks[x][y].ctx;
                ctx.clearRect(0, 0, this.chunkSize, this.chunkSize);
            }
        }
    }
    drawDebris(x, y, rotation, color, w, h) {
        const cx = Math.floor(x / this.chunkSize);
        const cy = Math.floor(y / this.chunkSize);
        if (cx >= 0 && cx < this.cols && cy >= 0 && cy < this.rows) {
            const chunk = this.chunks[cx][cy];
            const localX = x - (cx * this.chunkSize);
            const localY = y - (cy * this.chunkSize);
            chunk.ctx.save();
            chunk.ctx.translate(localX, localY);
            chunk.ctx.rotate(rotation);
            chunk.ctx.fillStyle = color;
            chunk.ctx.globalAlpha = 0.5;
            chunk.ctx.fillRect(-w/2, -h/2, w, h);
            chunk.ctx.restore();
        }
    }
    render(ctx, camera) {
        const startCol = Math.floor(camera.x / this.chunkSize);
        const endCol = Math.floor((camera.x + ctx.canvas.width) / this.chunkSize);
        const startRow = Math.floor(camera.y / this.chunkSize);
        const endRow = Math.floor((camera.y + ctx.canvas.height) / this.chunkSize);
        for (let x = startCol; x <= endCol; x++) {
            for (let y = startRow; y <= endRow; y++) {
                if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
                    const drawX = x * this.chunkSize;
                    const drawY = y * this.chunkSize;
                    ctx.drawImage(this.chunks[x][y].canvas, drawX, drawY);
                }
            }
        }
    }
}

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const WORLD_SIZE = 3000;
const CHUNK_SIZE = 1000;
const chunkManager = new ChunkManager(WORLD_SIZE, CHUNK_SIZE);

const SPAWN_RATE = 1100;
const MAX_PARTICLES = 200;
const ARENA_START_SIZE = 800;
const ARENA_GROWTH = 100;
const KILLS_PER_WAVE = 35;

let width, height;
let camera = { x: 0, y: 0 };
let player = {
    x: 0, y: 0, vx: 0, vy: 0,
    hp: 100, maxHp: 100, angle: 0,
    weapon: 'pistol', ammo: Infinity,
    secondaryWeapon: null, secondaryAmmo: 0,
    focus: 100, maxFocus: 100, focusActive: false,
    minigunWindup: 0, minigunSoundTimer: 0,
    universalUpgrades: [], dashUnlocked: false, focusUnlocked: false, grenadesUnlocked: false, ammoBonusPercent: 0,
    dead: false,
    deathTimer: 0
};

let bullets = [];
let grenades = [];
let mines = [];
let turrets = [];
let enemies = [];
let particles = [];
let debris = [];
let pickups = [];
let corpses = [];

let keys = { w: false, a: false, s: false, d: false, space: false, shift: false };
let mouse = { x: 0, y: 0, left: false, right: false };

let lastShotTime = 0;
let lastGrenadeTime = 0;
let lastDashTime = 0;
let lastSpawnTime = 0;
let lastNukeSpawnTime = -99999;

let score = 0;
let points = 0;
let highScore = 0;
let lives = 3;
let wave = 1;
let gameTime = 0;
let isGameRunning = false;
let shakeX = 0, shakeY = 0;
let hitStop = 0;
let noisePos = null;
let nukeTimer = 0;

let godMode = false;
let superDamage = false;
let isPaused = false;
let isDeathScreenShowing = false;
let hasProcessedDeathScreen = false;
let bossKilled = false;
let arena = { x: 0, y: 0, w: 0, h: 0, targetW: 0, targetH: 0 };

let weaponXP = {
    smg: { xp: 0, level: 0, upgrades: [] },
    shotgun: { xp: 0, level: 0, upgrades: [] }
};

let weaponShotCount = {
    smg: 0
};

let weaponKills = {
    smg: 0,
    shotgun: 0,
    minigun: 0,
    rocket: 0,
    railgun: 0
};

let isUpgradeSelecting = false;
let upgradeSelectingWeapon = null;
let updateAborted = false;

const UNIVERSAL_UPGRADES = [
    { id: 'unlock_dash', name: 'Unlock Dash', description: 'Enables SPACE to dash.', stackable: false },
    { id: 'unlock_focus', name: 'Unlock Focus', description: 'Enables SHIFT for bullet time.', stackable: false },
    { id: 'unlock_grenades', name: 'Unlock Grenades', description: 'Enables R-CLICK for default grenade.', stackable: false },
    { id: 'bonus_hp', name: '+10 HP', description: 'Increase max health by 10.', stackable: true },
    { id: 'ammo_bonus', name: 'Ammo +10%', description: '+10% ammo from boxes and max ammo (all weapons).', stackable: true },
    { id: 'double_focus', name: 'Double Focus Duration', description: 'Focus lasts 2x longer.', stackable: false, requires: 'unlock_focus' },
    { id: 'dash_cooldown', name: 'Dash Cooldown -50%', description: 'Dash recharges twice as fast.', stackable: false, requires: 'unlock_dash' }
];

function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
}
window.addEventListener('resize', resize);
window.addEventListener('contextmenu', e => e.preventDefault());

function updateUI() {
    document.getElementById('health-fill').style.width = Math.max(0, (player.hp / (player.maxHp || 100)) * 100) + '%';
    const livesEl = document.getElementById('lives-display');
    if (livesEl) livesEl.innerText = lives;
    document.getElementById('score-display').innerText = score;
    document.getElementById('highscore-display').innerText = highScore;
    document.getElementById('wave-display').innerText = 'WAVE ' + wave;

    const upgrades = (weaponXP[player.weapon] && weaponXP[player.weapon].upgrades) ? weaponXP[player.weapon].upgrades : [];
    const weapon = getWeaponStats(player.weapon, upgrades, player.ammoBonusPercent || 0) || WEAPONS[player.weapon];
    document.getElementById('p-name').innerText = weapon.name;
    document.getElementById('p-name').style.color = weapon.color;

    const pFill = document.getElementById('p-bar');
    const pCount = document.getElementById('p-count');

    if (player.ammo === Infinity) {
        pFill.style.width = '100%';
        pFill.style.backgroundColor = weapon.color;
        pCount.innerText = '∞';
    } else {
        const pct = Math.min(100, (player.ammo / weapon.maxCarry) * 100);
        pFill.style.width = pct + '%';
        pFill.style.backgroundColor = weapon.color;
        pCount.innerText = player.ammo;
        if (player.ammo <= weapon.ammo * 0.2) pFill.style.backgroundColor = '#ff0000';
    }

    const sWidget = document.getElementById('secondary-widget');
    if (player.secondaryWeapon && player.secondaryAmmo > 0) {
        sWidget.style.display = 'flex';
        const sw = SECONDARIES[player.secondaryWeapon];
        document.getElementById('s-name').innerText = sw.name;
        document.getElementById('s-name').style.color = sw.color;
        document.getElementById('s-count').innerText = player.secondaryAmmo;
        const cdPercent = Math.min(1, (gameTime - lastGrenadeTime) / GRENADE_COOLDOWN);
        const sBar = document.getElementById('s-bar');
        sBar.style.width = (cdPercent * 100) + '%';
        sBar.style.backgroundColor = cdPercent >= 1 ? sw.color : '#555';
        if (cdPercent >= 1) sWidget.classList.add('active'); else sWidget.classList.remove('active');
    } else {
        sWidget.style.display = 'none';
    }

    const xpIndicator = document.getElementById('weapon-xp-indicator');
    const xpThresholds = [40, 200, 600];
    const wt = player.weapon;
    if (weaponXP[wt] && weaponXP[wt].level < 3 && ['smg', 'shotgun', 'minigun', 'rocket', 'railgun'].includes(wt)) {
        const data = weaponXP[wt];
        const next = xpThresholds[data.level];
        xpIndicator.style.display = 'block';
        xpIndicator.innerHTML = `<span class="xp-text">${data.xp}/${next}</span><div class="xp-bar"><div class="xp-bar-fill" style="width:${Math.min(100, (data.xp / next) * 100)}%"></div></div>`;
    } else {
        xpIndicator.style.display = 'none';
    }
}

function setWeapon(type) {
    const upgrades = (weaponXP[type] && weaponXP[type].upgrades) ? weaponXP[type].upgrades : [];
    const w = getWeaponStats(type, upgrades, player.ammoBonusPercent || 0) || WEAPONS[type];
    player.weapon = type; player.ammo = w.ammo; player.minigunWindup = 0;
    updateUI(); Audio.pickup();
}

function setSecondary(type) {
    if (player.secondaryWeapon === type) {
        player.secondaryAmmo = Math.min(SECONDARIES[type].maxAmmo, player.secondaryAmmo + SECONDARIES[type].ammo);
    } else {
        player.secondaryWeapon = type;
        player.secondaryAmmo = SECONDARIES[type].ammo;
    }
    updateUI(); Audio.pickup();
}

function addAmmo(type) {
    const upgrades = (weaponXP[type] && weaponXP[type].upgrades) ? weaponXP[type].upgrades : [];
    const w = getWeaponStats(type, upgrades, player.ammoBonusPercent || 0) || WEAPONS[type];
    player.ammo = Math.min(w.maxCarry, player.ammo + w.ammo);
    updateUI(); Audio.pickup();
}

function spawnNukePickup() {
    lastNukeSpawnTime = gameTime;
    Audio.nukeSpawn();
    const warning = document.getElementById('warning-overlay');
    warning.style.display = 'block';
    setTimeout(() => { warning.style.display = 'none'; }, 3000);
    pickups.push(new Pickup(0, 0, 'nuke'));
}

function detonateNuke(nx, ny) {
    const flash = document.getElementById('flash-overlay');
    flash.style.transition = 'none';
    flash.style.opacity = 1;
    setTimeout(() => {
        flash.style.transition = 'opacity 1.0s ease-out';
        flash.style.opacity = 0;
    }, 50);

    shakeX = 50; shakeY = 50;
    Audio.nukeBlast();

    for (let k = 0; k < 50; k++) {
        const ang = (Math.PI*2/50)*k;
        const spd = 20;
        particles.push(new Particle(nx, ny, '#fff', spd));
    }

    const blastRadius = 800;
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        const dist = Math.hypot(e.x - nx, e.y - ny);
        if (dist < blastRadius) {
            if (e.type === 'boss') {
                e.hp -= (e.maxHp / 7);
                for (let k = 0; k < 5; k++) particles.push(new Particle(e.x, e.y, '#ff0000', 5));
                if (e.hp <= 0 && !e.dying) {
                    e.dying = true;
                    e.dyingTimer = 0;
                }
            } else if (!e.dead) {
                e.dead = true;
                killEnemy(e, 0, true, null);
                enemies.splice(i, 1);
            }
        }
    }
}

function createExplosion(x, y, isBig = false, isMine = false, options = {}) {
    shakeX = isBig ? 40 : 20; shakeY = isBig ? 40 : 20;
    if (isMine) Audio.mineExplode(); else Audio.explode();

    const pCount = isBig ? 60 : 30;
    for (let i = 0; i < pCount; i++) particles.push(new Particle(x, y, '#ffaa00', isBig ? 15 : 10));

    let range = (isBig ? 250 : 150) * (options.rangeMult || 1);
    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i]; const dist = Math.hypot(e.x - x, e.y - y);
        if (dist < range) {
            const damage = (1 - (dist/range)) * (isBig ? 60 : 30); e.hp -= damage;
            const angle = Math.atan2(e.y - y, e.x - x);
            const forceMult = e.type === 'boss' ? 0.05 : 1.0;
            const force = (1 - (dist/range)) * 30 * forceMult * (isBig ? 1.5 : 1.0);
            e.vx += Math.cos(angle) * force; e.vy += Math.sin(angle) * force;
            if (e.hp <= 0 && !e.dead && !e.dying) {
                if (e.type === 'boss') {
                    e.dying = true; e.dyingTimer = 0;
                    bossKilled = true;
                }
                else { e.dead = true; killEnemy(e, angle, false, player.weapon); }
            }
        }
    }

    if (options.shrapnel) {
        const pelletDmg = WEAPONS.shotgun ? WEAPONS.shotgun.damage : 2;
        for (let k = 0; k < 10; k++) {
            const a = Math.random() * Math.PI * 2;
            const pellet = new Bullet(x, y, a, 11, '#ffff00', pelletDmg, false, false, false, 'rocket');
            bullets.push(pellet);
        }
    }

    if (options.cluster) {
        const baseAngle = options.clusterAngle ?? 0;
        for (let k = 0; k < 3; k++) {
            const spread = (Math.random() - 0.5) * 0.4;
            const a = baseAngle + spread;
            const mini = new Bullet(x, y, a, 12, '#ff8800', 3, true, false, false, 'rocket');
            bullets.push(mini);
        }
    }
}

function killEnemy(e, angle, silent = false, weaponType = null) {
    if (e.type === 'boss') bossKilled = true;

    score++; if (score > highScore) { highScore = score; document.getElementById('highscore-display').innerText = highScore; }

    let pts = 1;
    if (e.type === 'flanker' || e.type === 'tank') pts = 3;
    if (e.type === 'boss') pts = 500;
    points += pts;

    if (score % KILLS_PER_WAVE === 0) {
        wave++;
        arena.targetW = Math.min(WORLD_SIZE - 200, ARENA_START_SIZE + (wave * ARENA_GROWTH)); arena.targetH = Math.min(WORLD_SIZE - 200, ARENA_START_SIZE + (wave * ARENA_GROWTH));

        if (wave === 10) for (let i = 0; i < 5; i++) enemies.push(new Enemy('flanker'));
        if (wave === 15) for (let i = 0; i < 6; i++) enemies.push(new Enemy('blind'));
        if (wave === 30) {
            for (const e of enemies) {
                if (e.type === 'tank' && e.tankState !== 'aggro') {
                    e.tankState = 'aggro';
                    e.aggroTime = 900;
                    Audio.tankAggro();
                    shakeX = 10;
                    shakeY = 10;
                    for (let k = 0; k < 15; k++) particles.push(new Particle(e.x, e.y, '#ff0000', 8));
                }
            }
        }
        if (wave === 40) {
            enemies.push(new Enemy('boss'));
            enemies.push(new Enemy('boss'));
        } else if (wave >= 20 && wave % 10 === 0 && wave !== 30) {
            enemies.push(new Enemy('boss'));
        }
        if (wave >= 25 && (wave - 5) % 10 === 0) {
             for (let i = 0; i < 3; i++) enemies.push(new Enemy('tank'));
             for (let i = 0; i < 5; i++) enemies.push(new Enemy('flanker'));
             for (let i = 0; i < 5; i++) enemies.push(new Enemy('blind'));
        }
        updateUI();
    }
    updateUI();
    if (!silent) { if (e.type === 'tank') Audio.tankDeath(); else Audio.squish(); }

    if (weaponType && weaponXP[weaponType]) {
        weaponXP[weaponType].xp += 1;
        checkWeaponLevelUp(weaponType);
    }
    if (weaponType && weaponKills[weaponType] !== undefined) {
        weaponKills[weaponType]++;
    }

    let drop = false; let baseChance = player.weapon === 'pistol' ? 0.25 : 0.12;
    if (e.type === 'tank') drop = true; else if (Math.random() < baseChance) drop = true;

    if (drop) {
        const rand = Math.random();
        if (rand < 0.3) {
            pickups.push(new Pickup(e.x, e.y, 'medikit'));
        } else if (rand < 0.4) {
            let sChoices = ['mine'];
            if (wave >= 10) sChoices.push('turret');
            if (wave >= 20) sChoices.push('cluster');
            const pick = sChoices[Math.floor(Math.random() * sChoices.length)];
            pickups.push(new Pickup(e.x, e.y, pick));
        } else {
             let choices = [];
            if (wave < 5) choices = ['smg', 'shotgun'];
            else if (wave < 10) choices = ['smg', 'shotgun', 'rocket'];
            else if (wave < 15) choices = ['smg', 'shotgun', 'rocket', 'minigun'];
            else choices = ['smg', 'shotgun', 'minigun', 'rocket', 'railgun'];

            if (choices.includes(player.weapon)) {
                choices.push(player.weapon);
                choices.push(player.weapon);
            }
            const pick = choices[Math.floor(Math.random() * choices.length)];
            pickups.push(new Pickup(e.x, e.y, pick));
        }
    }
    else if (Math.random() < 0.05) pickups.push(new Pickup(e.x, e.y, 'medikit'));

    const gibCount = e.type === 'tank' ? 12 : 5;
    for (let i = 0; i < gibCount; i++) debris.push(new Debris(e.x, e.y, e.color));
    chunkManager.drawDebris(e.x, e.y, angle, '#660000', 15, 5);
}

function createPlayerDeathAnimation() {
    // Create explosion particles
    for (let i = 0; i < 30; i++) {
        particles.push(new Particle(player.x, player.y, '#ff0000', 12));
    }
    
    // Create gibs (debris)
    for (let i = 0; i < 8; i++) {
        debris.push(new Debris(player.x, player.y, '#ff0000'));
    }
    
    // Create blood splatter effect
    chunkManager.drawDebris(player.x, player.y, Math.random() * Math.PI * 2, '#660000', 20, 8);
    
    // Screen shake
    shakeX = 20;
    shakeY = 20;
    
    // Play death sound
    Audio.playerDeath();
}

function processPlayerDeath(dt) {
    if (!player.dead || hasProcessedDeathScreen) return;
    
    player.deathTimer += 16.6 * dt; // Use dt for frame-rate independent timing
    
    // Wait 1.5 seconds (1500ms) before showing death screen
    if (player.deathTimer >= 1500) {
        hasProcessedDeathScreen = true; // Mark as processed
        lives--;
        
        if (lives > 0) {
            // Show death screen for respawn
            showDeathScreen();
        } else {
            // No lives remaining - show game-over
            endGame();
        }
        
        // Reset death timer (will be reset in respawn anyway)
        player.deathTimer = 0;
    }
}

function checkWeaponLevelUp(weaponType) {
    const thresholds = [40, 200, 600];
    const data = weaponXP[weaponType];
    if (!data) return;
    if (isUpgradeSelecting) return;
    if (data.level >= 3) return;
    if (data.xp >= thresholds[data.level]) {
        showUpgradeSelection(weaponType);
    }
}

function showUpgradeSelection(weaponType) {
    const data = weaponXP[weaponType];
    if (!data) return;

    const all = WEAPON_UPGRADES[weaponType] || [];
    const weaponAvailable = all.filter(u => !data.upgrades.includes(u.id));
    if (weaponAvailable.length === 0) return;

    const universalPool = UNIVERSAL_UPGRADES.filter(u => {
        if (u.requires && !player.universalUpgrades.includes(u.requires)) return false;
        if (!u.stackable && player.universalUpgrades.includes(u.id)) return false;
        return true;
    });
    if (universalPool.length === 0) return;

    isUpgradeSelecting = true;
    upgradeSelectingWeapon = weaponType;
    isPaused = true;

    let selectedWeaponId = null;
    let selectedUniversalId = null;

    const overlay = document.getElementById('upgrade-selection');
    const weaponNameEl = document.getElementById('upgrade-weapon-name');
    const choicesEl = document.getElementById('upgrade-choices');
    const universalChoicesEl = document.getElementById('upgrade-universal-choices');

    weaponNameEl.innerText = (WEAPONS[weaponType]?.name || weaponType).toUpperCase();
    choicesEl.innerHTML = '';
    universalChoicesEl.innerHTML = '';

    const weaponPool = [...weaponAvailable];
    const weaponPicks = [];
    while (weaponPool.length > 0 && weaponPicks.length < 3) {
        const idx = Math.floor(Math.random() * weaponPool.length);
        weaponPicks.push(weaponPool.splice(idx, 1)[0]);
    }

    const uniPool = [...universalPool];
    const universalPicks = [];
    while (uniPool.length > 0 && universalPicks.length < 3) {
        const idx = Math.floor(Math.random() * uniPool.length);
        universalPicks.push(uniPool.splice(idx, 1)[0]);
    }

    function tryApply() {
        if (selectedWeaponId && selectedUniversalId) {
            applyUpgrade(weaponType, selectedWeaponId);
            applyUniversalUpgrade(selectedUniversalId);
            overlay.style.display = 'none';
            isUpgradeSelecting = false;
            upgradeSelectingWeapon = null;
            isPaused = false;
            updateUI();
        }
    }

    for (const up of weaponPicks) {
        const btn = document.createElement('button');
        btn.className = 'upgrade-choice';
        btn.type = 'button';
        btn.dataset.id = up.id;
        btn.innerHTML = `<div class=\"upgrade-title\">${up.name}</div><div class=\"upgrade-desc\">${up.description}</div>`;
        btn.addEventListener('click', () => {
            document.querySelectorAll('#upgrade-choices .upgrade-choice').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedWeaponId = up.id;
            tryApply();
        });
        choicesEl.appendChild(btn);
    }

    for (const up of universalPicks) {
        const btn = document.createElement('button');
        btn.className = 'upgrade-choice';
        btn.type = 'button';
        btn.dataset.id = up.id;
        btn.innerHTML = `<div class=\"upgrade-title\">${up.name}</div><div class=\"upgrade-desc\">${up.description}</div>`;
        btn.addEventListener('click', () => {
            document.querySelectorAll('#upgrade-universal-choices .upgrade-choice').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedUniversalId = up.id;
            tryApply();
        });
        universalChoicesEl.appendChild(btn);
    }

    overlay.style.display = 'block';
}

function applyUpgrade(weaponType, upgradeId) {
    const data = weaponXP[weaponType];
    if (!data) return;
    if (data.upgrades.includes(upgradeId)) return;

    data.upgrades.push(upgradeId);
    data.level += 1;
}

function applyUniversalUpgrade(universalId) {
    const up = UNIVERSAL_UPGRADES.find(u => u.id === universalId);
    if (!up) return;
    if (!up.stackable && player.universalUpgrades.includes(universalId)) return;

    player.universalUpgrades.push(universalId);

    if (universalId === 'unlock_dash') player.dashUnlocked = true;
    if (universalId === 'unlock_focus') player.focusUnlocked = true;
    if (universalId === 'unlock_grenades') player.grenadesUnlocked = true;
    if (universalId === 'bonus_hp') {
        player.maxHp += 10;
        player.hp = Math.min(player.hp + 10, player.maxHp);
    }
    if (universalId === 'ammo_bonus') player.ammoBonusPercent += 10;
}

function handlePlayerDeath() {
    if (isDeathScreenShowing || player.dead) return; // Prevent multiple calls
    
    // Mark player as dead
    player.dead = true;
    player.deathTimer = 0;
    hasProcessedDeathScreen = false; // Reset flag
    
    // Create death animation
    createPlayerDeathAnimation();
    
    // Set flag to prevent damage/spawning
    isDeathScreenShowing = true;
    
    updateAborted = true;
}

let selectedWeaponForRespawn = null;

function showDeathScreen() {
    isDeathScreenShowing = true;
    
    const deathScreen = document.getElementById('death-screen');
    const deathKills = document.getElementById('death-kills');
    const deathLives = document.getElementById('death-lives');
    const weaponChoices = document.getElementById('weapon-choices');
    const universalUpgradesList = document.getElementById('universal-upgrades-list');
    const continueBtn = document.getElementById('continue-btn');

    // Reset selection
    selectedWeaponForRespawn = null;
    continueBtn.style.display = 'none';

    // Show lives remaining
    deathLives.innerText = `${lives} ${lives === 1 ? 'life' : 'lives'} remaining`;

    // Show kills
    deathKills.innerText = score;

    // Show universal upgrades
    if (player.universalUpgrades.length > 0) {
        const universalNames = player.universalUpgrades.map(up => {
            const upData = UNIVERSAL_UPGRADES.find(u => u.id === up);
            return upData ? upData.name : up;
        }).join(', ');
        universalUpgradesList.innerText = universalNames;
    } else {
        universalUpgradesList.innerText = 'None';
    }

    // Build weapon selection
    weaponChoices.innerHTML = '';
    const availableWeapons = ['smg', 'shotgun', 'minigun', 'rocket', 'railgun'].filter(w => weaponKills[w] > 0);
    if (availableWeapons.length === 0) {
        availableWeapons.push('pistol');
    }

    const xpThresholds = [40, 200, 600];

    availableWeapons.forEach(weaponType => {
        const wp = WEAPONS[weaponType];
        const weaponData = weaponXP[weaponType] || { xp: 0, level: 0, upgrades: [] };
        const upgrades = weaponData.upgrades || [];
        
        // Calculate XP display
        let xpDisplay = '';
        if (weaponData.level >= 3) {
            xpDisplay = '600/600';
        } else {
            const nextThreshold = xpThresholds[weaponData.level];
            xpDisplay = `${weaponData.xp}/${nextThreshold}`;
        }

        // Get upgrade names
        const upgradeNames = upgrades.map(upId => {
            const upData = WEAPON_UPGRADES[weaponType]?.find(u => u.id === upId);
            return upData ? upData.name : upId;
        });

        // Create weapon card
        const card = document.createElement('div');
        card.className = 'weapon-card';
        card.style.cssText = 'background: rgba(0, 0, 0, 0.5); border: 2px solid #555; padding: 15px; min-width: 150px; cursor: pointer; text-align: center;';
        
        const weaponName = document.createElement('div');
        weaponName.innerText = wp.name;
        weaponName.style.cssText = `font-size: 18px; font-weight: bold; color: ${wp.color}; margin-bottom: 5px;`;
        
        const xpInfo = document.createElement('div');
        xpInfo.innerText = xpDisplay;
        xpInfo.style.cssText = 'font-size: 14px; color: #aaa; margin-bottom: 10px;';
        
        const upgradesDiv = document.createElement('div');
        upgradesDiv.style.cssText = 'font-size: 12px; color: #888; text-align: left;';
        if (upgradeNames.length > 0) {
            upgradeNames.forEach(upName => {
                const upLine = document.createElement('div');
                upLine.innerText = upName;
                upgradesDiv.appendChild(upLine);
            });
        } else {
            upgradesDiv.innerText = 'No upgrades';
        }

        card.appendChild(weaponName);
        card.appendChild(xpInfo);
        card.appendChild(upgradesDiv);

        card.onclick = () => {
            // Remove previous selection highlight
            weaponChoices.querySelectorAll('.weapon-card').forEach(c => {
                c.style.borderColor = '#555';
                c.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
            });
            
            // Highlight selected
            card.style.borderColor = wp.color;
            card.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            
            selectedWeaponForRespawn = weaponType;
            continueBtn.style.display = 'block';
        };

        weaponChoices.appendChild(card);
    });

    // Ensure game-over screen is hidden
    document.getElementById('game-over').style.display = 'none';
    
    deathScreen.style.display = 'block';
}

function respawn() {
    isDeathScreenShowing = false;
    player.dead = false;
    player.deathTimer = 0;
    hasProcessedDeathScreen = false;
    
    player.hp = player.maxHp;
    player.x = arena.x + arena.w / 2;
    player.y = arena.y + arena.h / 2;
    player.vx = 0;
    player.vy = 0;
    player.focusActive = false;
    player.focus = player.maxFocus;
    enemies.length = 0;
    bullets.length = 0;
    updateUI();
}

function endGame() {
    isGameRunning = false;
    Audio.playGameOverMusic();
    
    // Hide death screen if it's showing
    document.getElementById('death-screen').style.display = 'none';
    
    // Show game-over screen
    document.getElementById('game-over').style.display = 'block';
    document.getElementById('final-kills').innerText = score;
    document.getElementById('final-points').innerText = points;
    if (bossKilled) {
        document.getElementById('boss-hint').style.display = 'block';
    }
}

function toggleDevMenu() {
    const menu = document.getElementById('dev-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function devSetSmg() {
    if (!isGameRunning) init();
    setWeapon('smg');
    updateUI();
    toggleDevMenu();
}

function devSetShotgun() {
    if (!isGameRunning) init();
    setWeapon('shotgun');
    updateUI();
    toggleDevMenu();
}

function devSetMinigun() {
    if (!isGameRunning) init();
    setWeapon('minigun');
    updateUI();
    toggleDevMenu();
}

function devSetRocket() {
    if (!isGameRunning) init();
    setWeapon('rocket');
    updateUI();
    toggleDevMenu();
}

function devSetRailgun() {
    if (!isGameRunning) init();
    setWeapon('railgun');
    updateUI();
    toggleDevMenu();
}

function devForceLevelUp() {
    if (!isGameRunning) init();
    const wt = player.weapon;
    if (!weaponXP[wt]) return;
    const thresholds = [40, 200, 600];
    const lvl = weaponXP[wt].level;
    if (lvl >= 3) return;
    weaponXP[wt].xp = Math.max(weaponXP[wt].xp, thresholds[lvl]);
    checkWeaponLevelUp(wt);
}

function devBossFight() {
    if (!isGameRunning) init();
    wave = 20; score = 500;
    gameContext.wave = wave;
    arena.targetW = WORLD_SIZE - 200; arena.targetH = WORLD_SIZE - 200;
    arena.w = arena.targetW; arena.h = arena.targetH;
    arena.x = (WORLD_SIZE - arena.w) / 2; arena.y = (WORLD_SIZE - arena.h) / 2;
    setWeapon('railgun'); player.ammo = WEAPONS.railgun.maxCarry;
    enemies = []; enemies.push(new Enemy('boss')); enemies.push(new Enemy('boss'));
    updateUI(); toggleDevMenu();
}

function devMaxAmmo() {
    if (player.weapon !== 'pistol') { player.ammo = WEAPONS[player.weapon].maxCarry; updateUI(); }
    toggleDevMenu();
}

function devToggleGodMode() {
    godMode = !godMode;
    gameContext.godMode = godMode;
    const btn = document.getElementById('god-mode-btn');
    btn.innerText = 'GOD MODE: ' + (godMode ? 'ON' : 'OFF');
    btn.style.color = godMode ? '#00ff00' : '#fff';
}

function devToggleSuperDamage() {
    superDamage = !superDamage;
    const btn = document.getElementById('super-dmg-btn');
    btn.innerText = 'SUPER DAMAGE: ' + (superDamage ? 'ON' : 'OFF');
    btn.style.color = superDamage ? '#00ff00' : '#fff';
}

function devNuke() { spawnNukePickup(); toggleDevMenu(); }
function devChangeTrack() { Audio.nextTrack(); }

function init() {
    resize();
    chunkManager.reset();

    player.x = WORLD_SIZE/2;
    player.y = WORLD_SIZE/2;
    player.vx = 0;
    player.vy = 0;
    player.hp = 100;
    player.maxHp = 100;
    player.dead = false;
    player.deathTimer = 0;
    player.focus = 100;
    player.focusActive = false;
    player.weapon = 'pistol';
    player.ammo = Infinity;
    player.secondaryWeapon = null;
    player.secondaryAmmo = 0;
    player.universalUpgrades = [];
    player.dashUnlocked = false;
    player.focusUnlocked = false;
    player.grenadesUnlocked = false;
    player.ammoBonusPercent = 0;

    isDeathScreenShowing = false;
    hasProcessedDeathScreen = false;

    score = 0;
    points = 0;
    lives = 3;
    wave = 1;
    gameTime = 0;
    isPaused = false;
    bossKilled = false;

    arena.w = ARENA_START_SIZE;
    arena.h = ARENA_START_SIZE;
    arena.targetW = ARENA_START_SIZE;
    arena.targetH = ARENA_START_SIZE;
    arena.x = (WORLD_SIZE - arena.w) / 2;
    arena.y = (WORLD_SIZE - arena.h) / 2;

    bullets = [];
    grenades = [];
    mines = [];
    turrets = [];
    enemies = [];
    particles = [];
    debris = [];
    pickups = [];
    corpses = [];

    weaponXP = {
        smg: { xp: 0, level: 0, upgrades: [] },
        shotgun: { xp: 0, level: 0, upgrades: [] },
        minigun: { xp: 0, level: 0, upgrades: [] },
        rocket: { xp: 0, level: 0, upgrades: [] },
        railgun: { xp: 0, level: 0, upgrades: [] }
    };
    weaponKills = {
        smg: 0,
        shotgun: 0,
        minigun: 0,
        rocket: 0,
        railgun: 0
    };
    weaponShotCount = { smg: 0 };
    isUpgradeSelecting = false;
    upgradeSelectingWeapon = null;

    isGameRunning = true;
    noisePos = null;
    shakeX = 0; shakeY = 0;

    lastGrenadeTime = -GRENADE_COOLDOWN;
    lastDashTime = -DASH_COOLDOWN;
    lastShotTime = 0;
    lastSpawnTime = 0;
    lastNukeSpawnTime = -99999;

    gameContext.player = player;
    gameContext.arena = arena;
    gameContext.wave = wave;
    gameContext.enemies = enemies;
    gameContext.bullets = bullets;
    gameContext.corpses = corpses;
    gameContext.pickups = pickups;
    gameContext.particles = particles;
    gameContext.debris = debris;
    gameContext.grenades = grenades;
    gameContext.mines = mines;
    gameContext.turrets = turrets;
    gameContext.godMode = godMode;
    gameContext.isDeathScreenShowing = isDeathScreenShowing;
    gameContext.noisePos = null;
    gameContext.shakeX = 0;
    gameContext.shakeY = 0;
    gameContext.endGame = endGame;
    gameContext.handlePlayerDeath = handlePlayerDeath;
    gameContext.killEnemy = killEnemy;
    gameContext.createExplosion = createExplosion;
    gameContext.detonateNuke = detonateNuke;
    gameContext.updateUI = updateUI;
    gameContext.Audio = Audio;
    gameContext.normalizeAngle = normalizeAngle;
    gameContext.WEAPONS = WEAPONS;
    gameContext.SECONDARIES = SECONDARIES;
    gameContext.weaponXP = weaponXP;
    gameContext.Enemy = Enemy;
    gameContext.Particle = Particle;
    gameContext.Debris = Debris;
    gameContext.Pickup = Pickup;
    gameContext.WORLD_SIZE = WORLD_SIZE;
    gameContext.ARENA_START_SIZE = ARENA_START_SIZE;
    gameContext.ARENA_GROWTH = ARENA_GROWTH;
    gameContext.KILLS_PER_WAVE = KILLS_PER_WAVE;

    updateUI();
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-over').style.display = 'none';
    document.getElementById('pause-screen').style.display = 'none';
    document.getElementById('dev-menu').style.display = 'none';
    document.getElementById('warning-overlay').style.display = 'none';
    document.getElementById('boss-hint').style.display = 'none';

    Audio.init();
    Audio.startMusic();
    requestAnimationFrame(loop);
}

function startGame() { init(); }
function restartGame() { init(); }

function togglePause() {
    if (!isGameRunning) return;
    isPaused = !isPaused;
    document.getElementById('pause-screen').style.display = isPaused ? 'block' : 'none';
}

const setKey = (k, v) => {
    if (k === 'w' || k === 'W') keys.w = v; if (k === 'a' || k === 'A') keys.a = v;
    if (k === 's' || k === 'S') keys.s = v; if (k === 'd' || k === 'D') keys.d = v;
    if (k === ' ' || k === 'Space') keys.space = v; if (k === 'Shift') keys.shift = v;
};

window.addEventListener('keydown', e => {
    setKey(e.key, true);
    if (e.key === 'l' || e.key === 'L') toggleDevMenu();
    if (e.key === 'p' || e.key === 'P') togglePause();
    if (e.key === 'm' || e.key === 'M') Audio.toggleMute();
    if (e.key === 'Shift' && isGameRunning && player.focusUnlocked) { if (!player.focusActive && player.focus >= player.maxFocus) { player.focusActive = true; Audio.slowMoStart(); } }
});
window.addEventListener('keyup', e => setKey(e.key, false));
window.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mousedown', (e) => { if (e.button === 0) mouse.left = true; if (e.button === 2) mouse.right = true; });
window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.left = false; if (e.button === 2) mouse.right = false; });

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('resume-btn').addEventListener('click', togglePause);
document.getElementById('restart-btn').addEventListener('click', restartGame);
document.getElementById('continue-btn').addEventListener('click', () => {
    const deathScreen = document.getElementById('death-screen');
    
    if (selectedWeaponForRespawn) {
        setWeapon(selectedWeaponForRespawn);
        const upgrades = (weaponXP[selectedWeaponForRespawn] && weaponXP[selectedWeaponForRespawn].upgrades) ? weaponXP[selectedWeaponForRespawn].upgrades : [];
        const w = getWeaponStats(selectedWeaponForRespawn, upgrades, player.ammoBonusPercent || 0) || WEAPONS[selectedWeaponForRespawn];
        player.ammo = w.maxCarry;
        updateUI();
        deathScreen.style.display = 'none';
        isPaused = false;
        isGameRunning = true;
        respawn();
        selectedWeaponForRespawn = null;
    }
});
document.getElementById('dev-set-smg').addEventListener('click', devSetSmg);
document.getElementById('dev-set-shotgun').addEventListener('click', devSetShotgun);
document.getElementById('dev-set-minigun').addEventListener('click', devSetMinigun);
document.getElementById('dev-set-rocket').addEventListener('click', devSetRocket);
document.getElementById('dev-set-railgun').addEventListener('click', devSetRailgun);
document.getElementById('dev-force-levelup').addEventListener('click', devForceLevelUp);
document.getElementById('dev-boss-fight').addEventListener('click', devBossFight);
document.getElementById('dev-max-ammo').addEventListener('click', devMaxAmmo);
document.getElementById('god-mode-btn').addEventListener('click', devToggleGodMode);
document.getElementById('super-dmg-btn').addEventListener('click', devToggleSuperDamage);
document.getElementById('dev-nuke').addEventListener('click', devNuke);
document.getElementById('dev-change-track').addEventListener('click', devChangeTrack);

function update(realTime) {
    if (!isGameRunning || isPaused) return;
    if (hitStop > 0) { hitStop--; return; }
    updateAborted = false;

    gameContext.wave = wave;
    gameContext.noisePos = noisePos;
    gameContext.shakeX = shakeX;
    gameContext.shakeY = shakeY;
    gameContext.isDeathScreenShowing = isDeathScreenShowing;

    let dt = 1.0;
    if (player.focusActive) {
        const focusDrain = player.universalUpgrades && player.universalUpgrades.includes('double_focus') ? FOCUS_DRAIN * 0.5 : FOCUS_DRAIN;
        dt = SLOW_MO_FACTOR; player.focus -= focusDrain;
        if (player.focus <= 0) { player.focus = 0; player.focusActive = false; Audio.slowMoEnd(); }
    } else {
        if (player.focus < player.maxFocus) { player.focus += FOCUS_REGEN; if (player.focus > player.maxFocus) player.focus = player.maxFocus; }
    }
    
    // Process player death animation and delay
    if (player.dead) {
        processPlayerDeath(dt);
    }

    const effectiveDashCooldown = (player.universalUpgrades && player.universalUpgrades.includes('dash_cooldown')) ? DASH_COOLDOWN * 0.5 : DASH_COOLDOWN;
    document.getElementById('dash-fill').style.width = player.dashUnlocked ? (Math.min(100, (Math.min(1, (gameTime - (lastDashTime + DASH_DURATION)) / effectiveDashCooldown)) * 100) + '%') : '0%';
    document.getElementById('focus-fill').style.width = (player.focusUnlocked ? player.focus : 0) + '%';
    document.getElementById('dash-bar-group').classList.toggle('locked', !player.dashUnlocked);
    document.getElementById('focus-bar-group').classList.toggle('locked', !player.focusUnlocked);

    gameTime += 16.6 * dt;

    const camTargetX = player.x - width / 2;
    const camTargetY = player.y - height / 2;
    camera.x += (camTargetX - camera.x) * 0.04;
    camera.y += (camTargetY - camera.y) * 0.04;
    camera.x = Math.max(0, Math.min(WORLD_SIZE - width, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_SIZE - height, camera.y));

    if (arena.w < arena.targetW) {
        arena.w += 2 * dt; arena.h += 2 * dt;
        arena.x = (WORLD_SIZE - arena.w) / 2; arena.y = (WORLD_SIZE - arena.h) / 2;
    }

    const weaponUpgrades = (weaponXP[player.weapon] && weaponXP[player.weapon].upgrades) ? weaponXP[player.weapon].upgrades : [];
    const wp = getWeaponStats(player.weapon, weaponUpgrades, player.ammoBonusPercent || 0) || WEAPONS[player.weapon];

    if (mouse.left && player.weapon === 'minigun') {
        if (player.minigunWindup === 0) Audio.minigunWindup();
        player.minigunWindup += dt * 16.6;
        player.minigunSoundTimer += dt * 16.6;
        if (player.minigunSoundTimer > 100) { Audio.minigunSpin(); player.minigunSoundTimer = 0; }
    } else if (!mouse.left) {
        player.minigunWindup = 0;
    }

    player.walkingTankActive = false;
    let shouldFire = false;
    if (mouse.left) {
        if (player.weapon === 'minigun') {
            const hasSuperSpin = weaponUpgrades.includes('minigun_super_spin');
            const spinUpRequired = hasSuperSpin ? 1000 : 500;
            if (player.minigunWindup > spinUpRequired) shouldFire = true;
            if (shouldFire && weaponUpgrades.includes('minigun_walking_tank')) player.walkingTankActive = true;
        } else {
            shouldFire = true;
        }
    }

    // Only allow movement if player is not dead
    if (!player.dead) {
        let ix = 0; let iy = 0;
        if (keys.w) iy -= 1; if (keys.s) iy += 1;
        if (keys.a) ix -= 1; if (keys.d) ix += 1;
        if (ix !== 0 || iy !== 0) {
            const len = Math.hypot(ix, iy);
            ix /= len; iy /= len;
        }

        const accelMult = (player.walkingTankActive) ? 0.5 : 1;
        player.vx += ix * PLAYER_ACCEL * accelMult * dt;
        player.vy += iy * PLAYER_ACCEL * accelMult * dt;

        const frictionFactor = Math.pow(PLAYER_FRICTION, dt);
        player.vx *= frictionFactor;
        player.vy *= frictionFactor;

        player.x += player.vx * dt;
        player.y += player.vy * dt;

        if (player.x < arena.x + 10) { player.x = arena.x + 10; player.vx = 0; }
        if (player.x > arena.x + arena.w - 10) { player.x = arena.x + arena.w - 10; player.vx = 0; }
        if (player.y < arena.y + 10) { player.y = arena.y + 10; player.vy = 0; }
        if (player.y > arena.y + arena.h - 10) { player.y = arena.y + arena.h - 10; player.vy = 0; }

        const mouseWorldX = mouse.x + camera.x; const mouseWorldY = mouse.y + camera.y;
        player.angle = Math.atan2(mouseWorldY - player.y, mouseWorldX - player.x);

        let isDashing = (gameTime - lastDashTime < DASH_DURATION);
        const dashP = Math.min(1, (gameTime - (lastDashTime + DASH_DURATION)) / effectiveDashCooldown);
        if (player.dashUnlocked && keys.space && !isDashing && dashP >= 1) {
            lastDashTime = gameTime;
            isDashing = true;
            let dashDirX = ix; let dashDirY = iy;
            if (dashDirX === 0 && dashDirY === 0) {
                dashDirX = Math.cos(player.angle);
                dashDirY = Math.sin(player.angle);
            }
            player.vx += dashDirX * DASH_IMPULSE;
            player.vy += dashDirY * DASH_IMPULSE;
            for (let i = 0; i < 10; i++) particles.push(new Particle(player.x, player.y, '#ffffff', 5));
            Audio.dash();
        }
    }

    let effectiveRate = wp.rate;
    if (player.weapon === 'minigun' && weaponUpgrades.includes('minigun_super_spin')) {
        const ramp = Math.min(1, Math.max(0, (player.minigunWindup - 1000) / 5000));
        const fireRateMult = 1 + 3 * ramp;
        effectiveRate = wp.rate / fireRateMult;
    }
    if (player.weapon === 'railgun' && weaponUpgrades.includes('railgun_hot_battery')) {
        const ammoPct = wp.maxCarry > 0 ? player.ammo / wp.maxCarry : 1;
        const rateMult = 1.01 + ammoPct * 1.79;
        effectiveRate = wp.rate / rateMult;
    }

    if (shouldFire && gameTime - lastShotTime > effectiveRate && !player.dead) {
        if (player.ammo > 0) {
            const mx = player.x + Math.cos(player.angle) * 20; const my = player.y + Math.sin(player.angle) * 20;
            let spreadFactor = wp.spread;
            if (player.weapon === 'minigun') {
                const speed = Math.hypot(player.vx, player.vy);
                spreadFactor = 0.01 + (speed * 0.05);
            }
            for (let i = 0; i < wp.count; i++) {
                const spread = (Math.random() - 0.5) * spreadFactor;
                let isExplosive = !!wp.explosive;
                let bulletColor = wp.color;
                if (player.weapon === 'smg' && weaponUpgrades.includes('smg_micro_munitions')) {
                    weaponShotCount.smg = (weaponShotCount.smg || 0) + 1;
                    if (weaponShotCount.smg % 10 === 0) {
                        isExplosive = true;
                        bulletColor = '#ff0000';
                    }
                }

                const b = new Bullet(mx, my, player.angle + spread, wp.speed, bulletColor, wp.damage, isExplosive, !!wp.pierce, false, player.weapon);

                if (player.weapon === 'smg' && weaponUpgrades.includes('smg_heavy_caliber')) {
                    b.life *= 2;
                }
                if (player.weapon === 'smg' && weaponUpgrades.includes('smg_ap_jacket')) {
                    b.maxPierces = 2;
                    b.limitedPierce = true;
                }
                if (wp.knockbackMult) b.knockbackMult = wp.knockbackMult;
                if (player.weapon === 'rocket') {
                    b.explosionOptions = {};
                    if (weaponUpgrades.includes('rocket_shrapnel')) b.explosionOptions.shrapnel = true;
                    if (weaponUpgrades.includes('rocket_high_explosives')) b.explosionOptions.rangeMult = 2;
                    if (weaponUpgrades.includes('rocket_cluster_rockets')) b.explosionOptions.cluster = true;
                }
                if (player.weapon === 'railgun') {
                    const hasTungsten = weaponUpgrades.includes('railgun_tungsten_dart');
                    if (!hasTungsten) b.maxPierces = 5;
                    else {
                        b.tungstenDart = true;
                        b.baseDamage = wp.damage;
                    }
                }

                bullets.push(b);
            }
            if (!player.walkingTankActive) {
                player.vx -= Math.cos(player.angle) * wp.recoil;
                player.vy -= Math.sin(player.angle) * wp.recoil;
                shakeX = Math.cos(player.angle + Math.PI) * wp.recoil; shakeY = Math.sin(player.angle + Math.PI) * wp.recoil;
            }
            noisePos = { x: player.x, y: player.y }; lastShotTime = gameTime;
            particles.push(new Particle(player.x, player.y, '#aa8800', 3));
            if (player.weapon === 'shotgun') Audio.shotgun(); else if (player.weapon === 'rocket') Audio.rocket(); else Audio.shoot();
            if (player.ammo !== Infinity) { player.ammo--; if (player.ammo <= 0) setWeapon('pistol'); updateUI(); }
        } else if (player.weapon !== 'pistol') setWeapon('pistol');
    }

    if (mouse.right) {
        if (player.secondaryWeapon && player.secondaryAmmo > 0) {
            let onCooldown = false;
            if (gameTime - lastGrenadeTime < GRENADE_COOLDOWN) onCooldown = true;
            if (!onCooldown) {
                lastGrenadeTime = gameTime;
                if (player.secondaryWeapon === 'mine') {
                     mines.push(new Mine(player.x, player.y));
                } else if (player.secondaryWeapon === 'turret') {
                     turrets.push(new Turret(player.x, player.y, player.angle));
                } else if (player.secondaryWeapon === 'cluster') {
                     grenades.push(new Grenade(player.x, player.y, player.angle, true));
                     player.vx -= Math.cos(player.angle) * 12;
                     player.vy -= Math.sin(player.angle) * 12;
                     Audio.rocket();
                }
                player.secondaryAmmo--;
                if (player.secondaryAmmo <= 0) player.secondaryWeapon = null;
                updateUI();
            }
        } else if (player.grenadesUnlocked) {
            const cdPercent = Math.min(1, (gameTime - lastGrenadeTime) / GRENADE_COOLDOWN);
            if (cdPercent >= 1) {
                 grenades.push(new Grenade(player.x, player.y, player.angle));
                 lastGrenadeTime = gameTime;
                 player.vx -= Math.cos(player.angle) * 12;
                 player.vy -= Math.sin(player.angle) * 12;
                 noisePos = { x: player.x, y: player.y }; Audio.rocket();
            }
        }
    }

    if (player.secondaryWeapon) {
         const cdPercent = Math.min(1, (gameTime - lastGrenadeTime) / GRENADE_COOLDOWN);
         const sBar = document.getElementById('s-bar');
         if (sBar) {
            sBar.style.width = (cdPercent * 100) + '%';
            const sWidget = document.getElementById('secondary-widget');
            if (cdPercent >= 1) {
                sBar.style.backgroundColor = SECONDARIES[player.secondaryWeapon].color;
                sWidget.classList.add('active');
            } else {
                sBar.style.backgroundColor = '#555';
                sWidget.classList.remove('active');
            }
         }
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].update(dt); let b = bullets[i]; let remove = false;
        if (b.x < arena.x || b.x > arena.x + arena.w || b.y < arena.y || b.y > arena.y + arena.h) remove = true;
        if (b.life <= 0) remove = true;
        if (b.isEnemy && !remove) {
            const dist = Math.hypot(b.x - player.x, b.y - player.y);
            if (dist < 15) {
                if (!godMode && !isDeathScreenShowing) {
                    let dmg = b.damage;
                    if (player.walkingTankActive) dmg *= 0.2;
                    player.hp -= dmg; updateUI(); Audio.playerDamage(); shakeX = 5; shakeY = 5; if (player.hp <= 0) { handlePlayerDeath(); return; }
                }
                remove = true;
            }
        }
        if (remove) {
            if (b.explosive) {
                const opts = b.explosionOptions || {};
                if (opts.cluster) opts.clusterAngle = b.angle;
                createExplosion(b.x, b.y, false, false, opts);
            }
            bullets.splice(i, 1);
        }
    }

    for (let i = grenades.length - 1; i >= 0; i--) {
        let g = grenades[i]; g.update(dt); let explode = false;
        for (let e of enemies) { if (Math.hypot(g.x - e.x, g.y - e.y) < e.radius + 5) explode = true; }
        if (g.life <= 0) explode = true;
        if (explode) {
            if (g.isCluster) {
                createExplosion(g.x, g.y, true);
                for (let k = 0; k < 8; k++) {
                    const a = (Math.PI*2/8)*k;
                    grenades.push(new Grenade(g.x, g.y, a, false));
                }
            } else {
                createExplosion(g.x, g.y);
            }
            grenades.splice(i, 1);
        }
    }

    for (let i = mines.length - 1; i >= 0; i--) {
        mines[i].update(dt);
        if (mines[i].life <= 0) mines.splice(i, 1);
    }

    for (let i = turrets.length - 1; i >= 0; i--) {
        turrets[i].update(dt);
        if (turrets[i].life <= 0) turrets.splice(i, 1);
    }

    for (let i = corpses.length - 1; i >= 0; i--) {
        if (corpses[i].update) corpses[i].update(dt);
    }

    if (gameTime - lastSpawnTime > Math.max(150, SPAWN_RATE - wave * 25)) {
        if (!isDeathScreenShowing) {
            if (wave === 5 && Math.random() < 0.2) for (let k = 0; k < 3; k++) enemies.push(new Enemy('flanker'));
            else enemies.push(new Enemy());
            lastSpawnTime = gameTime;
        }
    }

    let nukeInPlay = false; for (let p of pickups) { if (p.type === 'nuke') nukeInPlay = true; }
    if (wave >= 10 && !nukeInPlay && (gameTime - lastNukeSpawnTime > 45000)) { if (Math.random() < 0.0001) spawnNukePickup(); }

    let nukeDist = 99999;
    for (let i = pickups.length - 1; i >= 0; i--) {
        pickups[i].update(dt); if (pickups[i].life <= 0) { pickups.splice(i, 1); continue; }
        if (pickups[i].type === 'nuke') { const d = Math.hypot(pickups[i].x - player.x, pickups[i].y - player.y); if (d < nukeDist) nukeDist = d; }
        if (Math.hypot(player.x - pickups[i].x, player.y - pickups[i].y) < 25 && !player.dead) {
            const p = pickups[i];
            if (p.type === 'nuke') detonateNuke(p.x, p.y);
            else if (p.type === 'medikit') { player.hp = Math.min(player.maxHp, player.hp + 25); updateUI(); Audio.pickup(); for (let k = 0; k < 10; k++) particles.push(new Particle(player.x, player.y, '#00ff00', 5)); }
            else if (SECONDARIES[p.type]) {
                setSecondary(p.type);
                for (let k = 0; k < 10; k++) particles.push(new Particle(player.x, player.y, SECONDARIES[p.type].color, 5));
            }
            else {
                if (player.weapon === p.type) addAmmo(p.type); else setWeapon(p.type);
                for (let k = 0; k < 10; k++) particles.push(new Particle(player.x, player.y, '#ffff00', 5));
            }
            pickups.splice(i, 1);
        }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
        let e = enemies[i]; if (!e) continue; if (e.dead) { enemies.splice(i, 1); continue; }
        e.update(dt);
        if (updateAborted) return;
        for (let j = bullets.length - 1; j >= 0; j--) {
            let b = bullets[j]; if (b.isEnemy) continue;
            const hitBox = e.type === 'boss' ? 80 : 40;
            if (Math.abs(e.x - b.x) > hitBox || Math.abs(e.y - b.y) > hitBox) continue;
            if (b.hitList && b.hitList.includes(e)) continue;
            const dist = Math.hypot(e.x - b.x, e.y - b.y);
            if (dist < e.radius + 10) {
                let damageCalc = superDamage ? 999999 : b.damage;
                if (b.tungstenDart && b.baseDamage !== undefined) {
                    damageCalc = b.baseDamage * Math.max(0.1, 1 - (b.hitList?.length || 0) * 0.1);
                }

                if (e.type === 'tank') {
                     const wasAggro = e.tankState === 'aggro';
                     e.tankState = 'aggro'; e.aggroTime = 900;
                     if (!wasAggro) {
                         shakeX = 10; shakeY = 10;
                         for (let k = 0; k < 15; k++) particles.push(new Particle(e.x, e.y, '#ff0000', 8));
                     }
                     let diff = Math.abs(normalizeAngle(b.angle - e.facing));
                     if (diff < Math.PI / 3) { damageCalc *= 5; Audio.crit(); for (let k = 0; k < 5; k++) particles.push(new Particle(e.x, e.y, '#ffaa00', 8)); }
                } else if (e.type === 'boss') {
                    let hitAngle = Math.atan2(b.y - e.y, b.x - e.x);
                    let diff = Math.abs(normalizeAngle(hitAngle - e.facing));
                    if (diff > 2.0) { damageCalc *= 3; Audio.weakPoint(); for (let k = 0; k < 8; k++) particles.push(new Particle(b.x, b.y, '#00ffff', 10)); }

                    if (b.weaponType === 'railgun') {
                        damageCalc = e.maxHp / 38;
                        if (superDamage) damageCalc = 999999;
                        Audio.bossZap();
                        for (let k = 0; k < 5; k++) particles.push(new Particle(b.x, b.y, '#ff00ff', 15));
                    }
                }
                e.hp -= damageCalc;
                if (b.weaponType === 'railgun' && weaponUpgrades.includes('railgun_tesla_arc')) {
                    const zapRange = 100;
                    if (e.type !== 'boss' && !e.stunned) {
                        e.stunned = true;
                        e.stunTimer = 3000;
                    }
                    for (let other of enemies) {
                        if (other === e || other.dead || other.dying || other.type === 'boss' || other.stunned) continue;
                        const zapDist = Math.hypot(other.x - e.x, other.y - e.y);
                        if (zapDist < zapRange) {
                            other.stunned = true;
                            other.stunTimer = 3000;
                            for (let k = 0; k < 5; k++) {
                                particles.push(new Particle(e.x + (other.x - e.x) * 0.5, e.y + (other.y - e.y) * 0.5, '#00aaff', 8));
                            }
                        }
                    }
                    for (let k = 0; k < 8; k++) particles.push(new Particle(e.x, e.y, '#00aaff', 10));
                }
                if (b.explosive) {
                    const opts = b.explosionOptions || {};
                    if (opts.cluster) opts.clusterAngle = b.angle;
                    createExplosion(b.x, b.y, false, false, opts);
                    bullets.splice(j, 1);
                }
                else if (b.pierce) {
                    b.hitList.push(e);
                    const particleCount = e.hp > 0 ? 7 : 3;
                    const particleColor = e.hp > 0 ? '#660000' : e.color;
                    const particleSpeed = e.hp > 0 ? 8 : 5;
                    for (let k = 0; k < particleCount; k++) particles.push(new Particle(e.x, e.y, particleColor, particleSpeed));
                    if (b.maxPierces && b.hitList.length >= b.maxPierces) {
                        bullets.splice(j, 1);
                    }
                }
                else {
                    if (e.type !== 'boss') { const kb = (e.type === 'tank' ? 2 : 8) * (b.knockbackMult || 1); e.vx += Math.cos(b.angle) * kb; e.vy += Math.sin(b.angle) * kb; }
                    if (b.weaponType === 'minigun' && weaponUpgrades.includes('minigun_splinter_bullets') && !b.isSplinter) {
                        const splinterDmg = b.damage * 0.3;
                        const wp = getWeaponStats('minigun', weaponUpgrades, player.ammoBonusPercent || 0) || WEAPONS.minigun;
                        for (let k = 0; k < 3; k++) {
                            const spreadAng = (k - 1) * (Math.PI / 3);
                            const splinter = new Bullet(e.x, e.y, b.angle + spreadAng, wp.speed, wp.color, splinterDmg, false, false, false, 'minigun');
                            splinter.isSplinter = true;
                            bullets.push(splinter);
                        }
                    }
                    bullets.splice(j, 1); for (let k = 0; k < 3; k++) particles.push(new Particle(e.x, e.y, e.color, 5));
                }
                noisePos = { x: e.x, y: e.y }; Audio.hit();
                if (e.hp <= 0 && !e.dead) {
                    if (e.type === 'boss') {
                        if (!e.dying) { e.dying = true; e.dyingTimer = 0; }
                        bullets.splice(j, 1);
                    } else {
                        e.dead = true;
                        killEnemy(e, b.angle, false, b.weaponType);
                        enemies.splice(i, 1);
                        hitStop = 2;
                    }
                    break;
                }
                if (e.dead) { enemies.splice(i, 1); break; }
            }
        }
        if (enemies[i] && !enemies[i].dead && !enemies[i].dying) {
            const pDist = Math.hypot(enemies[i].x - player.x, enemies[i].y - player.y);
            if (pDist < enemies[i].radius + 15) {
                if (!godMode && !isDeathScreenShowing) {
                    let dmg = 10;
                    if (player.walkingTankActive) dmg *= 0.2;
                    player.hp -= dmg; updateUI(); Audio.playerDamage(); shakeX = (Math.random()-0.5) * 20; shakeY = (Math.random()-0.5) * 20; if (player.hp <= 0) { handlePlayerDeath(); return; }
                }
                const angle = Math.atan2(player.y - enemies[i].y, player.x - enemies[i].x);
                let kbForce = 10;
                if (enemies[i].type === 'tank') kbForce = 17.5;
                player.vx += Math.cos(angle) * kbForce;
                player.vy += Math.sin(angle) * kbForce;
                if (enemies[i].type !== 'boss' && enemies[i].type !== 'tank') { enemies[i].dead = true; enemies.splice(i, 1); }
                for (let k = 0; k < 10; k++) particles.push(new Particle(player.x, player.y, '#ff0000', 8));
            }
        }
    }

    if (nukeInPlay) {
        nukeTimer += dt; const pingDelay = Math.max(10, nukeDist / 100 * 3);
        if (nukeTimer > pingDelay) { nukeTimer = 0; const vol = Math.max(0.1, 1.0 - (nukeDist/1500)); Audio.nukePing(vol); }
    }

    if (particles.length > MAX_PARTICLES) particles.splice(0, particles.length - MAX_PARTICLES);
    for (let i = particles.length - 1; i >= 0; i--) { particles[i].update(dt); if (particles[i].life <= 0) particles.splice(i, 1); }
    for (let i = debris.length - 1; i >= 0; i--) {
        debris[i].update(dt);
        if (debris[i].life <= 0) { chunkManager.drawDebris(debris[i].x, debris[i].y, debris[i].rotation, debris[i].color, debris[i].w, debris[i].h); debris.splice(i, 1); }
    }

    shakeX = gameContext.shakeX;
    shakeY = gameContext.shakeY;
    shakeX *= 0.8; shakeY *= 0.8;
}

function drawWeapon(ctx, type) {
    ctx.fillStyle = '#666';
    switch(type) {
        case 'pistol':
            ctx.fillStyle = '#666'; ctx.fillRect(0, -3, 20, 6);
            ctx.fillStyle = '#ffaa00'; ctx.fillRect(5, -1, 10, 2);
            break;
        case 'smg':
            ctx.fillStyle = '#555'; ctx.fillRect(0, -5, 22, 10);
            ctx.fillStyle = '#333'; ctx.fillRect(8, 5, 6, 8);
            ctx.fillStyle = '#ffffaa'; ctx.fillRect(18, -2, 4, 4);
            break;
        case 'shotgun':
            ctx.fillStyle = '#a0522d'; ctx.fillRect(-5, -6, 20, 12);
            ctx.fillStyle = '#555'; ctx.fillRect(10, -5, 20, 4);
            ctx.fillStyle = '#555'; ctx.fillRect(10, 1, 20, 4);
            ctx.fillStyle = '#222'; ctx.fillRect(8, -6, 4, 12);
            break;
        case 'minigun':
            ctx.fillStyle = '#222'; ctx.fillRect(-5, -10, 20, 20);
            ctx.fillStyle = '#444'; ctx.fillRect(15, -8, 20, 16);
            ctx.fillStyle = '#111';
            if (Math.floor(Date.now()/50)%2===0) {
                 ctx.fillRect(15, -8, 25, 4); ctx.fillRect(15, 4, 25, 4);
            } else {
                 ctx.fillRect(15, -4, 25, 8);
            }
            break;
        case 'rocket':
            ctx.fillStyle = '#3a4a3a'; ctx.fillRect(-5, -8, 40, 16);
            ctx.fillStyle = '#1a2a1a'; ctx.fillRect(30, -9, 5, 18);
            ctx.fillStyle = '#ff4444'; ctx.fillRect(5, -3, 30, 6);
            break;
        case 'railgun':
            ctx.fillStyle = '#333'; ctx.fillRect(-5, -6, 20, 12);
            ctx.fillStyle = '#999';
            ctx.fillRect(15, -8, 30, 4);
            ctx.fillRect(15, 4, 30, 4);
            ctx.fillStyle = '#0ff';
            ctx.shadowBlur = 10; ctx.shadowColor = '#0ff';
            ctx.fillRect(15, -2, 28, 4);
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#444';
            ctx.fillRect(25, -9, 4, 18);
            ctx.fillRect(35, -9, 4, 18);
            break;
    }
}

function draw() {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    const camX = camera.x + shakeX;
    const camY = camera.y + shakeY;
    ctx.translate(-camX, -camY);

    ctx.strokeStyle = '#121212';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const startX = Math.floor(camX / 50) * 50; const endX = startX + width + 50;
    const startY = Math.floor(camY / 50) * 50; const endY = startY + height + 50;
    for (let x = startX; x <= endX; x += 50) { ctx.moveTo(x, camY); ctx.lineTo(x, camY + height); }
    for (let y = startY; y <= endY; y += 50) { ctx.moveTo(camX, y); ctx.lineTo(camX + width, y); }
    ctx.stroke();

    chunkManager.render(ctx, {x: camX, y: camY});

    ctx.strokeStyle = '#331111'; ctx.lineWidth = 8; ctx.strokeRect(arena.x, arena.y, arena.w, arena.h);
    ctx.strokeStyle = '#ff3333'; ctx.lineWidth = 2; ctx.globalAlpha = 0.5 + Math.sin(Date.now() / 200) * 0.2; ctx.strokeRect(arena.x, arena.y, arena.w, arena.h); ctx.globalAlpha = 1.0;

    corpses.forEach(c => c.draw(ctx));
    mines.forEach(m => m.draw(ctx));
    pickups.forEach(p => p.draw(ctx));
    debris.forEach(d => d.draw(ctx));

    grenades.forEach(g => g.draw(ctx));
    turrets.forEach(t => t.draw(ctx));
    enemies.forEach(e => e.draw(ctx));
    bullets.forEach(b => b.draw(ctx));

    // Only draw player if not dead
    if (!player.dead) {
        ctx.save();
        ctx.translate(player.x, player.y); ctx.rotate(player.angle);
        const t = 1 - (player.hp / (player.maxHp || 100));
        const r = Math.round(68 + (255 - 68) * t);
        const g = Math.round(255 - 255 * t);
        const bCol = Math.round(68 - 68 * t);
        ctx.fillStyle = `rgb(${r},${g},${bCol})`; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI*2); ctx.fill();
        drawWeapon(ctx, player.weapon);
        ctx.restore();
    }

    particles.forEach(p => p.draw(ctx));
    ctx.restore();

    for (let p of pickups) {
        if (p.type === 'nuke') {
            const screenX = p.x - camX; const screenY = p.y - camY;
            if (screenX < 0 || screenX > width || screenY < 0 || screenY > height) {
                const cx = width/2; const cy = height/2; const angle = Math.atan2(screenY - cy, screenX - cx);
                let tx = cx + Math.cos(angle) * width; let ty = cy + Math.sin(angle) * height;
                if (tx < 30) tx = 30; if (tx > width-30) tx = width-30; if (ty < 30) ty = 30; if (ty > height-30) ty = height-30;
                ctx.save(); ctx.translate(tx, ty); ctx.rotate(angle);
                const pulse = 1 + Math.sin(Date.now() / 100) * 0.2; ctx.scale(pulse, pulse);
                ctx.shadowColor = '#ffff00'; ctx.shadowBlur = 15;
                ctx.fillStyle = '#ffff00'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-10, 10); ctx.lineTo(-10, -10); ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = '#000'; ctx.font = '12px Arial'; ctx.textAlign = 'right'; ctx.fillText('NUKE', -15, 4);
                ctx.restore();
            }
        }
    }
}

function loop(time) {
    update(time);
    draw();
    if (isGameRunning) requestAnimationFrame(loop);
}
