import { gameContext } from './gameContext.js';
import { Audio } from './audio.js';

export const PLAYER_ACCEL = 0.45;
export const PLAYER_FRICTION = 0.87;
export const DASH_COOLDOWN = 7500;
export const DASH_DURATION = 150;
export const DASH_IMPULSE = 12;
export const GRENADE_COOLDOWN = 3000;
export const SLOW_MO_FACTOR = 0.2;
export const FOCUS_DRAIN = 0.3;
export const FOCUS_REGEN = 0.08;

export const WEAPONS = {
    pistol: { name: 'PISTOL', tier: 1, rate: 400, speed: 12, damage: 2, spread: 0.02, count: 1, color: '#ffaa00', recoil: 0.5, ammo: Infinity, maxCarry: Infinity },
    smg:    { name: 'SMG',    tier: 1, rate: 110, speed: 13, damage: 1.8, spread: 0.15, count: 1, color: '#ffffaa', recoil: 0.3, ammo: 120, maxCarry: 360 },
    shotgun:{ name: 'SHOTGUN',tier: 1, rate: 1500, speed: 11, damage: 2, spread: 0.35, count: 7, color: '#ffff00', recoil: 4.0, ammo: 24, maxCarry: 72 },
    minigun:{ name: 'MINIGUN',tier: 2, rate: 55,  speed: 14, damage: 2.7, spread: 0.15, count: 1, color: '#00ffff', recoil: 0.8, ammo: 300, maxCarry: 900 },
    rocket: { name: 'ROCKET', tier: 2, rate: 1200, speed: 8,  damage: 20, spread: 0,    count: 1, color: '#ff4444', recoil: 6.0, ammo: 12, maxCarry: 36, explosive: true },
    railgun:{ name: 'RAILGUN',tier: 3, rate: 2400, speed: 30, damage: 50, spread: 0,    count: 1, color: '#ff00ff', recoil: 0, ammo: 12, maxCarry: 36, pierce: true }
};

export const SECONDARIES = {
    mine: { name: 'MINE', ammo: 5, maxAmmo: 10, color: '#ff0000' },
    turret: { name: 'SENTRY', ammo: 2, maxAmmo: 4, color: '#44ff44' },
    cluster: { name: 'CLUSTER', ammo: 8, maxAmmo: 16, color: '#ffaa00' }
};

export const WEAPON_UPGRADES = {
    smg: [
        {
            id: 'smg_heavy_caliber',
            name: 'Heavy Caliber',
            description: '+75% Damage, +100% Range, -50% Fire Rate.'
        },
        {
            id: 'smg_ap_jacket',
            name: 'AP (Armor Piercing) Jacket',
            description: 'Bullets pierce through 1 enemy.'
        },
        {
            id: 'smg_micro_munitions',
            name: 'Micro-Munitions',
            description: 'Every 10th bullet fired is a small explosive round.'
        }
    ],
    shotgun: [
        {
            id: 'shotgun_double_barrels',
            name: 'Double Barrels',
            description: 'Fires 2x the amount of pellets. Spread increased by 100%.'
        },
        {
            id: 'shotgun_jackhammer',
            name: 'Jackhammer',
            description: '+100% fire rate, +50% ammo from box, +50% max ammo.'
        },
        {
            id: 'shotgun_elephant_shot',
            name: 'Elephant shot',
            description: '+100% damage, +100% knockback, +20% recoil.'
        }
    ],
    minigun: [
        { id: 'minigun_splinter_bullets', name: 'Splinter Bullets', description: 'Bullets split into 3 on hit, each dealing 30% damage.' },
        { id: 'minigun_super_spin', name: 'Super Spin', description: '1s spin-up. +50% ammo. Fire rate ramps to 400% over 5s.' },
        { id: 'minigun_walking_tank', name: 'Walking Tank', description: 'When firing: -50% movement, no recoil, -80% received damage.' }
    ],
    rocket: [
        { id: 'rocket_shrapnel', name: 'Shrapnel', description: 'Explosions launch 10 shotgun pellets in all directions.' },
        { id: 'rocket_high_explosives', name: 'High Explosives', description: 'Double effective range. -30% fire rate.' },
        { id: 'rocket_cluster_rockets', name: 'Cluster Rockets', description: 'Explosion sends 3 minirockets forward with spread.' }
    ],
    railgun: [
        { id: 'railgun_tungsten_dart', name: 'Tungsten Dart', description: 'Infinite penetration. Damage drops 10% per hit (min 10%).' },
        { id: 'railgun_hot_battery', name: 'Hot Battery', description: '+180% fire rate at full ammo, drops to +1% at 1 ammo.' },
        { id: 'railgun_tesla_arc', name: 'Tesla-Arc', description: 'Railgun shots zap nearby enemies, stunning them for 3s. Boss immune.' }
    ]
};

export function getWeaponStats(weaponType, upgrades = [], ammoBonusPercent = 0) {
    const base = WEAPONS[weaponType];
    if (!base) return null;
    const stats = { ...base };

    // Apply upgrades (stat-affecting only). Behavior upgrades are handled in main.js.
    for (const up of upgrades) {
        if (up === 'smg_heavy_caliber') {
            stats.damage *= 1.75;
            stats.rate *= 1.5;
        }
        if (up === 'smg_ap_jacket') {
            stats.pierce = true;
        }
        if (up === 'shotgun_double_barrels') {
            stats.count *= 2;
            stats.spread *= 2;
        }
        if (up === 'shotgun_jackhammer') {
            stats.rate *= 0.5;
            stats.ammo *= 1.5;
            stats.maxCarry *= 1.5;
        }
        if (up === 'shotgun_elephant_shot') {
            stats.damage *= 2;
            stats.knockbackMult = (stats.knockbackMult || 1) * 2;
            stats.recoil *= 1.2;
        }
        if (up === 'minigun_super_spin') {
            stats.ammo *= 2.0;
            stats.maxCarry *= 2.0;
        }
        if (up === 'rocket_high_explosives') {
            stats.explosionRangeMult = (stats.explosionRangeMult || 1) * 2;
            stats.rate *= 1.3;
        }
    }

    if (ammoBonusPercent > 0 && stats.ammo !== Infinity) {
        const mult = 1 + ammoBonusPercent / 100;
        stats.ammo = Math.round(stats.ammo * mult);
        stats.maxCarry = Math.round(stats.maxCarry * mult);
    }

    return stats;
}

export function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
}

export class Bullet {
    constructor(x, y, angle, speed, color, damage, explosive = false, pierce = false, isEnemy = false, weaponType = null) {
        this.x = x; this.y = y; this.angle = angle;
        this.speed = speed;
        this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
        this.life = 60; this.color = color; this.damage = damage;
        this.explosive = explosive; this.pierce = pierce; this.isEnemy = isEnemy; this.hitList = [];
        this.weaponType = weaponType;
        this.homing = false;
    }
    update(dt) {
        if (this.homing && gameContext.enemies && gameContext.enemies.length > 0) {
            let best = null; let bestD = Infinity;
            for (const e of gameContext.enemies) {
                if (e.dead || e.dying) continue;
                const d = Math.hypot(e.x - this.x, e.y - this.y);
                if (d < bestD && d > 5) { bestD = d; best = e; }
            }
            if (best) {
                const targetAngle = Math.atan2(best.y - this.y, best.x - this.x);
                const turn = 0.08 * dt;
                this.angle = normalizeAngle(this.angle + Math.sign(normalizeAngle(targetAngle - this.angle)) * Math.min(turn, Math.abs(normalizeAngle(targetAngle - this.angle))));
                this.vx = Math.cos(this.angle) * this.speed;
                this.vy = Math.sin(this.angle) * this.speed;
            }
        }
        this.x += this.vx * dt; this.y += this.vy * dt; this.life -= 1 * dt;
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        ctx.fillStyle = this.color;
        if (this.pierce && !this.limitedPierce) {
            const hits = this.hitList?.length || 0;
            let scale = 1;
            if (this.tungstenDart && this.baseDamage) {
                scale = Math.max(0.1, 1 - hits * 0.1);
            } else {
                scale = Math.max(0.2, 1 - (hits / 5) * 0.8);
            }
            const w = 80 * scale, h = 6 * scale;
            ctx.fillStyle = '#ffffff'; ctx.fillRect(-w/2, -h/2, w, h);
            ctx.fillStyle = this.color; ctx.globalAlpha = 0.6; ctx.fillRect(-w/2 - 10, -h/2 - 3, w + 20, h + 6);
        } else if (this.explosive) {
            ctx.fillRect(-8, -3, 16, 6); ctx.fillStyle = '#ff8800'; ctx.fillRect(-8, -1, 4, 2);
        } else if (this.isEnemy) {
            ctx.fillStyle = '#ff0000'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI*2); ctx.fill();
        } else {
            ctx.fillRect(-6, -2, 12, 4);
        }
        ctx.restore();
    }
}

export class Grenade {
    constructor(x, y, angle, isCluster = false) {
        this.x = x; this.y = y;
        const spd = isCluster ? 15 : 10;
        this.vx = Math.cos(angle) * spd; this.vy = Math.sin(angle) * spd;
        this.life = 60; this.radius = isCluster ? 8 : 6;
        this.isCluster = isCluster;
        this.friction = isCluster ? 0.03 : 0.05;
    }
    update(dt) {
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.vx *= (1 - (this.friction * dt)); this.vy *= (1 - (this.friction * dt));
        this.life -= 1 * dt;
    }
    draw(ctx) {
        ctx.fillStyle = this.isCluster ? '#ffaa00' : '#4488ff';
        ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI*2); ctx.fill();
        if (Math.floor(Date.now() / 100) % 2 === 0) { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(this.x+2, this.y-2, 3, 0, Math.PI*2); ctx.fill(); }
    }
}

export class Mine {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.life = 3600;
        this.radius = 15;
        this.triggerRadius = 40;
        this.active = false;
        setTimeout(() => { this.active = true; Audio.mineSet(); }, 1000);
    }
    update(dt) {
        if (!this.active) return;
        this.life -= dt;
        const { enemies, createExplosion } = gameContext;
        if (enemies && createExplosion) {
            for (let e of enemies) {
                if (Math.hypot(e.x - this.x, e.y - this.y) < this.triggerRadius) {
                    this.life = 0;
                    createExplosion(this.x, this.y, false, true);
                    break;
                }
            }
        }
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y);
        ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI*2); ctx.fill();
        if (!this.active) ctx.fillStyle = '#ffaa00';
        else ctx.fillStyle = Math.floor(Date.now()/200)%2===0 ? '#ff0000' : '#550000';
        ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.arc(0,0, this.triggerRadius, 0, Math.PI*2);
        ctx.setLineDash([5, 5]); ctx.stroke();
        ctx.restore();
    }
}

export class Turret {
    constructor(x, y, angle) {
        this.x = x; this.y = y;
        this.vx = Math.cos(angle) * 10; this.vy = Math.sin(angle) * 10;
        this.deployed = false;
        this.life = 100000;
        this.angle = angle;
        this.fireTimer = 0;
        this.maxAmmo = 120 * 1.5;
        this.ammo = this.maxAmmo;
    }
    update(dt) {
        const { enemies, bullets, WEAPONS } = gameContext;
        if (!enemies || !bullets || !WEAPONS) return;
        if (!this.deployed) {
            this.x += this.vx * dt; this.y += this.vy * dt;
            this.vx *= 0.9; this.vy *= 0.9;
            if (Math.hypot(this.vx, this.vy) < 0.5) { this.deployed = true; Audio.mineSet(); }
        } else {
            if (this.ammo <= 0) { this.life = 0; return; }
            this.fireTimer -= dt * 16.6;
            let closest = null; let minD = 500;
            for (let e of enemies) {
                let d = Math.hypot(e.x - this.x, e.y - this.y);
                if (d < minD) { minD = d; closest = e; }
            }
            if (closest) {
                const targetAngle = Math.atan2(closest.y - this.y, closest.x - this.x);
                let diff = targetAngle - this.angle;
                while (diff > Math.PI) diff -= Math.PI * 2;
                while (diff < -Math.PI) diff += Math.PI * 2;
                const turnSpeed = 0.05 * dt;
                if (Math.abs(diff) < turnSpeed) this.angle = targetAngle;
                else this.angle += Math.sign(diff) * turnSpeed;
                if (Math.abs(diff) < 0.5 && this.fireTimer <= 0) {
                    const w = WEAPONS.smg;
                    const spread = (Math.random() - 0.5) * 0.2;
                    bullets.push(new Bullet(this.x, this.y, this.angle + spread, w.speed, '#44ff44', w.damage));
                    Audio.shoot();
                    this.ammo--;
                    this.fireTimer = w.rate;
                }
            } else {
                this.angle += 0.05 * dt;
            }
        }
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y);
        ctx.fillStyle = '#555';
        if (this.deployed) {
             ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(-10, 10); ctx.stroke();
             ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(10, 10); ctx.stroke();
             ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, -12); ctx.stroke();
        }
        ctx.rotate(this.angle);
        ctx.fillStyle = '#222'; ctx.fillRect(-6, -6, 12, 12);
        ctx.fillStyle = '#44ff44'; ctx.fillRect(2, -2, 8, 4);
        ctx.restore();
    }
}

export class Pickup {
    constructor(x, y, type) {
        this.x = x; this.y = y; this.type = type; this.life = 1380; this.bob = 0;
        const { arena } = gameContext;
        if (type === 'nuke' && arena) {
            this.spawnSide = Math.random() < 0.5 ? 'left' : 'right';
            this.y = arena.y + 100 + Math.random() * (arena.h - 200); this.baseY = this.y;
            if (this.spawnSide === 'left') { this.x = arena.x - 500; this.dir = 1; } else { this.x = arena.x + arena.w + 500; this.dir = -1; }
            this.life = 3000; this.waveOffset = Math.random() * 100;
        }
    }
    update(dt) {
        this.life -= 1 * dt; this.bob += 0.1 * dt;
        if (this.type === 'nuke') {
            this.x += 2.0 * this.dir * dt;
            this.y = this.baseY + Math.sin((this.x * 0.005) + this.waveOffset) * 100;
        }
    }
    draw(ctx) {
        let yOff = Math.sin(this.bob) * 3; let xOff = 0;
        if (this.life < 360) {
            if (Math.floor(Date.now() / (this.life < 180 ? 50 : 200)) % 2 === 0) ctx.globalAlpha = 0.5;
            if (this.life < 180) xOff = (Math.random() - 0.5) * 4;
        }
        ctx.save(); ctx.translate(this.x + xOff, this.y + yOff);
        if (this.type === 'nuke') {
            ctx.globalAlpha = 1.0; ctx.fillStyle = '#ffff00';
            ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#000'; ctx.font = '20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('☢', 0, 2);
            ctx.shadowBlur = 15; ctx.shadowColor = '#ffff00'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.shadowBlur = 0;
        } else if (this.type === 'medikit') {
            ctx.fillStyle = '#fff'; ctx.fillRect(-16, -10, 32, 20);
            ctx.fillStyle = '#00ff00'; ctx.fillRect(-4, -8, 8, 16); ctx.fillRect(-8, -4, 16, 8);
            ctx.strokeStyle = '#00ff00'; ctx.strokeRect(-16, -10, 32, 20);
        } else {
            const { SECONDARIES } = gameContext;
            if (SECONDARIES && SECONDARIES[this.type]) {
                const s = SECONDARIES[this.type];
                ctx.fillStyle = '#111';
                ctx.beginPath();
                ctx.moveTo(0, -15);
                ctx.lineTo(15, -5);
                ctx.lineTo(10, 12);
                ctx.lineTo(-10, 12);
                ctx.lineTo(-15, -5);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = s.color; ctx.font = '10px Arial'; ctx.textAlign = 'center'; ctx.fillText(s.name.substring(0,3), 0, 5);
                ctx.strokeStyle = s.color; ctx.stroke();
            } else {
                const { WEAPONS } = gameContext;
                const w = WEAPONS && WEAPONS[this.type];
                if (w) {
                    ctx.fillStyle = '#222';
                    ctx.fillRect(-16, -10, 32, 20);
                    ctx.fillStyle = w.color; ctx.font = '12px Arial'; ctx.fillText(w.name.substring(0,2), -10, 5);
                    ctx.strokeStyle = w.color; ctx.strokeRect(-16, -10, 32, 20);
                }
            }
        }
        ctx.restore(); ctx.globalAlpha = 1.0;
    }
}
