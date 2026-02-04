import { gameContext } from './gameContext.js';

export class Debris {
    constructor(x, y, color) {
        this.x = x; this.y = y;
        const angle = Math.random() * Math.PI * 2; const speed = Math.random() * 8 + 2;
        this.vx = Math.cos(angle) * speed; this.vy = Math.sin(angle) * speed;
        this.rotation = Math.random() * Math.PI * 2; this.rotSpeed = (Math.random() - 0.5) * 0.5;
        this.life = 1.0; this.color = color; this.size = 4 + Math.random() * 6; this.w = this.size; this.h = this.size * 0.6;
    }
    update(dt) {
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.vx *= (1 - (0.1 * dt)); this.vy *= (1 - (0.1 * dt));
        this.rotation += this.rotSpeed * dt; this.rotSpeed *= (1 - (0.05 * dt));
        if (Math.abs(this.vx) < 0.1 && Math.abs(this.vy) < 0.1) this.life -= 0.05 * dt;
    }
    draw(ctx) {
        ctx.save(); ctx.translate(this.x, this.y); ctx.rotate(this.rotation);
        ctx.fillStyle = this.color; ctx.fillRect(-this.w/2, -this.h/2, this.w, this.h);
        ctx.restore();
    }
}

export class BossFragment {
    constructor(x, y) {
        this.x = x; this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 8 + 2;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 0.4;
        this.points = [];
        const r = 20 + Math.random() * 30;
        const sides = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < sides; i++) {
            const a = (i/sides)*Math.PI*2 + (Math.random()*0.5);
            this.points.push({x: Math.cos(a)*r, y: Math.sin(a)*r});
        }
    }
    update(dt) {
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.vx *= 0.92; this.vy *= 0.92;
        this.rotation += this.rotSpeed * dt;
        this.rotSpeed *= 0.92;
    }
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.fillStyle = '#1f101f';
        ctx.strokeStyle = '#ffaa00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        for (let i = 1; i < this.points.length; i++) ctx.lineTo(this.points[i].x, this.points[i].y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
}

export class Particle {
    constructor(x, y, color, speed, friction = 0.9) {
        this.x = x; this.y = y;
        const angle = Math.random() * Math.PI * 2; const vel = Math.random() * speed;
        this.vx = Math.cos(angle) * vel; this.vy = Math.sin(angle) * vel;
        this.life = 1.0; this.decay = 0.02 + Math.random() * 0.03; this.color = color; this.friction = friction;
    }
    update(dt) {
        this.x += this.vx * dt; this.y += this.vy * dt;
        this.vx *= (1 - ((1-this.friction) * dt)); this.vy *= (1 - ((1-this.friction) * dt));
        this.life -= this.decay * dt;
    }
    draw(ctx) {
        ctx.globalAlpha = this.life; ctx.fillStyle = this.color; ctx.fillRect(this.x, this.y, 4, 4); ctx.globalAlpha = 1.0;
    }
}

export class Enemy {
    constructor(typeOverride) {
        const { wave, arena, Audio, normalizeAngle } = gameContext;
        this.type = 'zombie'; this.facing = 0; this.dead = false; this.dying = false; this.dyingTimer = 0;
        this.bossState = 'chase'; this.bossTimer = 0; this.chargeDir = {x:0, y:0}; this.chargeCooldown = 900 + Math.random() * 1500;
        this.tankState = 'stroll'; this.tankTimer = 60 + Math.random() * 120; this.aggroTime = 0;

        if (typeOverride) { this.type = typeOverride; }
        else {
            const r = Math.random();
            if (wave < 5) {
                 this.type = 'zombie';
            }
            else if (wave < 10) {
                if (r < 0.1) this.type = 'tank';
                else this.type = 'zombie';
            }
            else if (wave < 15) {
                if (r < 0.2) this.type = 'flanker';
                else if (r < 0.3) this.type = 'tank';
                else this.type = 'zombie';
            }
            else {
                if (r < 0.4) this.type = 'zombie';
                else if (r < 0.6) this.type = 'flanker';
                else if (r < 0.8) this.type = 'blind';
                else this.type = 'tank';
            }
        }

        if (this.type === 'boss') Audio.spawnBoss();
        else if (this.type === 'tank') Audio.spawnTank();
        else if (this.type === 'flanker') Audio.spawnFlanker();
        else if (this.type === 'blind') Audio.spawnBlind();

        const spawnDist = this.type === 'boss' ? 200 : 40;
        if (Math.random() < 0.5) { this.x = arena.x + Math.random() * arena.w; this.y = Math.random() < 0.5 ? arena.y - spawnDist : arena.y + arena.h + spawnDist; }
        else { this.x = Math.random() < 0.5 ? arena.x - spawnDist : arena.x + arena.w + spawnDist; this.y = arena.y + Math.random() * arena.h; }

        this.vx = 0; this.vy = 0;

        if (this.type === 'tank') {
             const tx = arena.x + arena.w/2 + (Math.random()-0.5)*100;
             const ty = arena.y + arena.h/2 + (Math.random()-0.5)*100;
             this.facing = Math.atan2(ty - this.y, tx - this.x);
             this.hp = 25 + (wave * 2); this.speed = 1.1; this.radius = 26; this.color = '#3e2723';
        } else {
            switch(this.type) {
                case 'zombie': this.hp = 2 + Math.floor(wave/5); this.speed = (0.5 + Math.random() * 0.5) * 0.8; this.radius = 12; this.color = '#448844'; break;
                case 'flanker': this.hp = (4 + wave) * 0.7; this.speed = (2.2) * 0.8 * 0.9; this.radius = 12; this.color = '#aa33ff'; this.flankDir = Math.random() < 0.5 ? 1 : -1; break;
                case 'blind': this.hp = 8 + wave; this.speed = (3.0) * 0.8; this.radius = 14; this.color = '#888888'; break;
                case 'boss': this.hp = 5000 + (wave * 200); this.speed = 0.8; this.radius = 100; this.color = '#1f101f'; break;
            }
        }
        this.maxHp = this.hp;
    }

    update(dt) {
        const { player, arena, wave, enemies, corpses, godMode, noisePos, killEnemy, createExplosion, detonateNuke, endGame, updateUI, Audio, normalizeAngle } = gameContext;
        if (!player || !arena || !enemies) return;

        if (this.dying) {
            this.dyingTimer += dt * 16.6;
            gameContext.shakeX = (Math.random() - 0.5) * 15;
            gameContext.shakeY = (Math.random() - 0.5) * 15;
            if (Math.random() < 0.3) {
                const ex = this.x + (Math.random()-0.5) * this.radius * 2;
                const ey = this.y + (Math.random()-0.5) * this.radius * 2;
                createExplosion(ex, ey);
            }
            if (this.dyingTimer > 2500) {
                this.dead = true;
                for (let i = 0; i < 6; i++) {
                    corpses.push(new BossFragment(this.x, this.y));
                }
                killEnemy(this, 0);
                detonateNuke(this.x, this.y);
            }
            return;
        }

        let dx = player.x - this.x; let dy = player.y - this.y;
        let dist = Math.sqrt(dx*dx + dy*dy); let targetAngle = Math.atan2(dy, dx);

        if (this.type === 'boss') {
            if (this.bossState === 'chase') {
                let delta = normalizeAngle(targetAngle - this.facing);
                this.facing += Math.sign(delta) * 0.008 * dt;
                this.vx += Math.cos(this.facing) * 0.05 * dt; this.vy += Math.sin(this.facing) * 0.05 * dt;
                this.bossTimer += dt;
                if (this.bossTimer > this.chargeCooldown) { this.bossState = 'charge_prep'; this.bossTimer = 0; Audio.bossCharge(); }
            }
            else if (this.bossState === 'charge_prep') {
                this.vx *= 0.8; this.vy *= 0.8;
                let delta = normalizeAngle(targetAngle - this.facing);
                this.facing += Math.sign(delta) * 0.1 * dt;
                this.bossTimer += dt;
                if (this.bossTimer > 120) {
                    this.bossState = 'charge'; this.bossTimer = 0;
                    this.chargeDir.x = Math.cos(this.facing); this.chargeDir.y = Math.sin(this.facing);
                    this.chargeCooldown = 900 + Math.random() * 1500;
                }
            }
            else if (this.bossState === 'charge') {
                const chargeSpeed = 11;
                this.x += this.chargeDir.x * chargeSpeed * dt; this.y += this.chargeDir.y * chargeSpeed * dt;
                for (let other of enemies) {
                    if (other === this) continue;
                    const odx = other.x - this.x; const ody = other.y - this.y;
                    const odist = Math.sqrt(odx*odx + ody*ody);
                    if (odist < this.radius + other.radius + 20) {
                         const angle = Math.atan2(ody, odx);
                         if (other.type === 'tank') {
                             other.hp = 0; other.dead = true; killEnemy(other, angle);
                             Audio.tankDeath(); createExplosion(other.x, other.y);
                         } else if (other.type !== 'boss') {
                             const force = 30;
                             other.vx += Math.cos(angle) * force * dt; other.vy += Math.sin(angle) * force * dt;
                             other.hp -= 5;
                             if (other.hp <= 0 && !other.dead) { other.dead = true; killEnemy(other, angle); }
                         }
                    }
                }
                if (this.x < arena.x || this.x > arena.x + arena.w || this.y < arena.y || this.y > arena.y + arena.h) {
                    this.bossState = 'chase'; this.bossTimer = 0; Audio.bossImpact(); gameContext.shakeX = 20; gameContext.shakeY = 20;
                    this.x = Math.max(arena.x, Math.min(arena.x + arena.w, this.x));
                    this.y = Math.max(arena.y, Math.min(arena.y + arena.h, this.y));
                }
                this.bossTimer += dt;
                if (this.bossTimer > 90) { this.bossState = 'chase'; this.bossTimer = 0; }
            }

            if (this.bossState !== 'charge') {
                this.vx *= 0.95; this.vy *= 0.95;
                this.x += this.vx * dt; this.y += this.vy * dt;
            }

            if (!godMode && dist < this.radius + 15) {
                player.hp -= (this.bossState === 'charge' ? 10 : 5);
                updateUI(); Audio.playerDamage();
                const angle = Math.atan2(player.y - this.y, player.x - this.x);
                const force = this.bossState === 'charge' ? 80 : 15;
                player.vx += Math.cos(angle) * force;
                player.vy += Math.sin(angle) * force;
                gameContext.shakeX = 10; gameContext.shakeY = 10;
                if (player.hp <= 0) endGame();
            }
        }
        else {
            this.vx *= (1 - (0.2 * dt)); this.vy *= (1 - (0.2 * dt));
            let moveX = 0, moveY = 0;

            if (dist > 0) {
                let ndx = dx / dist; let ndy = dy / dist;

                if (this.type === 'tank') {
                    if (this.tankState === 'aggro') {
                        let delta = normalizeAngle(targetAngle - this.facing);
                        const turnSpeed = 0.005 * dt;
                        if (Math.abs(delta) < turnSpeed) this.facing = targetAngle;
                        else this.facing += Math.sign(delta) * turnSpeed;
                        moveX = Math.cos(this.facing); moveY = Math.sin(this.facing);
                        this.aggroTime -= dt;
                        if (this.aggroTime <= 0) { this.tankState = 'idle'; this.tankTimer = 60 + Math.random() * 60; }
                    } else if (this.tankState === 'stroll') {
                        moveX = Math.cos(this.facing) * 0.4; moveY = Math.sin(this.facing) * 0.4;
                        this.tankTimer -= dt;
                        const pad = 100;
                        if (this.x < arena.x + pad || this.x > arena.x + arena.w - pad ||
                            this.y < arena.y + pad || this.y > arena.y + arena.h - pad) {
                             const cx = arena.x + arena.w/2; const cy = arena.y + arena.h/2;
                             this.facing = Math.atan2(cy - this.y, cx - this.x) + (Math.random()-0.5);
                        }
                        if (this.tankTimer <= 0) { this.tankState = 'idle'; this.tankTimer = 60 + Math.random() * 120; }
                    } else {
                        moveX = 0; moveY = 0; this.tankTimer -= dt;
                        if (this.tankTimer <= 0) {
                            this.tankState = 'stroll'; this.tankTimer = 120 + Math.random() * 120;
                            this.facing = Math.random() * Math.PI * 2;
                        }
                    }
                }
                else if (this.type === 'flanker') {
                    moveX = ndx + (-ndy * 0.8 * this.flankDir); moveY = ndy + (ndx * 0.8 * this.flankDir);
                    this.facing = Math.atan2(moveY, moveX);
                } else if (this.type === 'blind') {
                    if (noisePos) {
                        let nDx = noisePos.x - this.x; let nDy = noisePos.y - this.y;
                        let nDist = Math.sqrt(nDx*nDx + nDy*nDy);
                        if (nDist > 5) { moveX = nDx / nDist; moveY = nDy / nDist; this.facing = Math.atan2(moveY, moveX); }
                    } else { moveX = (Math.random() - 0.5) * 0.2; moveY = (Math.random() - 0.5) * 0.2; this.facing += (Math.random()-0.5)*0.1 * dt; }
                } else {
                    moveX = ndx; moveY = ndy; this.facing = targetAngle;
                }
                const moveLen = Math.sqrt(moveX*moveX + moveY*moveY);
                if (moveLen > 0 && this.type !== 'tank') { moveX /= moveLen; moveY /= moveLen; }
                if (Math.abs(this.vx) < 1 && Math.abs(this.vy) < 1) { this.x += moveX * this.speed * dt; this.y += moveY * this.speed * dt; }
            }
            this.x += this.vx * dt; this.y += this.vy * dt;
        }

        let sepX = 0; let sepY = 0; let neighborCount = 0;
        for (let other of enemies) {
            if (other === this) continue;
            const dx2 = this.x - other.x; const dy2 = this.y - other.y;
            const dist2 = Math.sqrt(dx2*dx2 + dy2*dy2);
            const minSpace = this.radius + other.radius;

            if (dist2 < minSpace && dist2 > 0) {
                const overlap = minSpace - dist2;
                const angle = Math.atan2(dy2, dx2);

                if (this.type === 'boss' && other.type === 'boss') {
                    this.x += Math.cos(angle) * overlap * 0.5;
                    this.y += Math.sin(angle) * overlap * 0.5;
                }
                else if (this.type === 'boss') {
                }
                else if (other.type === 'boss') {
                    this.x += Math.cos(angle) * overlap;
                    this.y += Math.sin(angle) * overlap;
                }
                else if (this.type === 'blind') {
                    sepX += (this.x - other.x) / dist2;
                    sepY += (this.y - other.y) / dist2;
                    neighborCount++;
                }
                else {
                    let force = 0.5 * dt;
                    this.x += Math.cos(angle) * force;
                    this.y += Math.sin(angle) * force;
                }
            }
        }

        if (this.type === 'blind' && neighborCount > 0) {
            this.vx += (sepX / neighborCount) * 1.5 * dt;
            this.vy += (sepY / neighborCount) * 1.5 * dt;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);

        if (this.dying) {
            const shake = Math.sin(Date.now() / 20) * 5;
            ctx.translate(shake, shake);
            ctx.globalAlpha = 0.7 + Math.sin(Date.now()/50) * 0.3;
            if (Math.floor(Date.now() / 100) % 2 === 0) {
                 ctx.fillStyle = '#ffffff';
                 ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI*2); ctx.fill();
                 ctx.restore();
                 return;
            }
        }

        if (this.type === 'boss') {
            ctx.rotate(this.facing);
            ctx.fillStyle = '#00ffff'; ctx.beginPath(); ctx.arc(-this.radius + 10, 0, 15, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'rgba(0, 255, 255, 0.5)'; ctx.beginPath(); ctx.arc(-this.radius + 10, 0, 25 + Math.sin(Date.now()/100)*5, 0, Math.PI*2); ctx.fill();

            if (this.bossState === 'charge_prep') {
                 ctx.shadowBlur = 30; ctx.shadowColor = '#ff0000'; ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
                 ctx.beginPath(); ctx.arc(0, 0, this.radius + 20, 0, Math.PI*2); ctx.fill();
            } else { ctx.shadowBlur = 0; }

            const pulse = Math.sin(Date.now() / 200) * 3;
            ctx.fillStyle = this.bossState === 'charge_prep' ? '#500' : '#303';
            ctx.beginPath(); ctx.arc(0, 0, this.radius + 5 + pulse, 0, Math.PI*2); ctx.fill();

            ctx.fillStyle = this.bossState === 'charge_prep' ? '#300' : '#1a051a';
            ctx.beginPath();
            for (let i = 0; i < Math.PI * 2; i += 0.2) {
                let r = this.radius + Math.sin(i * 7 + Date.now()/400)*3;
                ctx.lineTo(Math.cos(i) * r, Math.sin(i) * r);
            }
            ctx.closePath(); ctx.fill();

            ctx.shadowBlur = 0;
            const eyePositions = [
                {x: 25, y: -15, r: 9}, {x: 35, y: 8, r: 11}, {x: 15, y: 22, r: 7},
                {x: 50, y: -8, r: 6}, {x: 8, y: -30, r: 7}, {x: -15, y: 8, r: 6}, {x: 15, y: 0, r: 5}
            ];
            const aliveEyesCount = Math.ceil((this.hp / this.maxHp) * eyePositions.length);
            eyePositions.forEach((eye, index) => {
                ctx.beginPath();
                let jx = this.bossState === 'charge_prep' ? (Math.random()-0.5)*3 : 0;
                let jy = this.bossState === 'charge_prep' ? (Math.random()-0.5)*3 : 0;
                if (index < aliveEyesCount) { ctx.fillStyle = '#ffaa00'; } else { ctx.fillStyle = '#440000'; }
                ctx.arc(eye.x + jx, eye.y + jy, eye.r, 0, Math.PI*2);
                ctx.fill();
            });
            if (this.bossState === 'charge') {
                ctx.fillStyle = 'rgba(255, 0, 0, 0.2)';
                ctx.fillRect(-this.radius*1.5, -this.radius, this.radius, this.radius*2);
            }
            ctx.shadowBlur = 0;
        }
        else if (this.type === 'tank') {
            ctx.rotate(this.facing);
            ctx.fillStyle = this.color; ctx.beginPath(); ctx.ellipse(0, 0, this.radius+5, this.radius-5, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#281a17'; ctx.beginPath(); ctx.arc(10, 0, this.radius-8, -Math.PI/2, Math.PI/2); ctx.fill();
            ctx.fillStyle = this.tankState === 'aggro' ? '#ff0000' : '#ff9900';
            ctx.beginPath(); ctx.arc(-15, 0, 8, 0, Math.PI*2); ctx.fill();
        }
        else {
            ctx.rotate(this.facing); ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, Math.PI*2); ctx.fill();
            if (this.type !== 'blind') {
                ctx.fillStyle = '#ffff00'; ctx.beginPath(); ctx.arc(6, 4, 3, 0, Math.PI*2); ctx.arc(6, -4, 3, 0, Math.PI*2); ctx.fill();
            } else if (this.type === 'blind') {
                ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.arc(0,0, this.radius-4, 0, Math.PI*2); ctx.stroke();
            }
        }
        ctx.restore();
    }
}
