// 적, 드랍, 무기, 충돌 및 고정 시간 간격의 전투 갱신.
function spawnEnemy(type) {
    const base = ENEMIES[type];
    const stats = enemyStats(type);
    const enemy = {
        type, x: Math.random() * (canvas.width - base.size), y: -base.size,
        w: base.size, h: base.size, hp: stats.hp, maxHp: stats.hp,
        speed: stats.speed + Math.random() * 20 - 10, shootCooldown: (1.3 + Math.random() * 0.7) * 2, hitFlash: 0,
    };
    game.enemies.push(enemy);
    return enemy;
}

function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function burst(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 30 + Math.random() * 100;
        game.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.45, color });
    }
    if (game.particles.length > 180) game.particles.splice(0, game.particles.length - 180);
}

function addItem(type, x, y) {
    if ((type === "heart" || type === "bomb") && game.items.some(item => item.type === type && item.y <= canvas.height)) return;
    game.items.push({ type, x: Math.max(0, Math.min(canvas.width - 28, x)), y, w: 28, h: 28 });
}

function dropItems(enemy) {
    const chance = enemy.type === "boss" ? 1 / 3 : 0.1;
    if (Math.random() < chance) {
        const type = Object.keys(WEAPONS)[Math.floor(Math.random() * 3)];
        addItem(type, enemy.x + enemy.w / 2 - 28, enemy.y);
    }
    // 하트는 무기 드랍과 별도로 추첨한다.
    if (Math.random() < HEART_DROP_RATE) addItem("heart", enemy.x + enemy.w / 2, enemy.y);
    if (Math.random() < 0.03) addItem("speed", enemy.x, enemy.y - 32);
    if (Math.random() < 0.015) addItem("bomb", enemy.x + enemy.w / 2, enemy.y - 64);
}

function damageEnemy(enemy, damage) {
    if (enemy.hp <= 0) return;
    enemy.hp = Math.max(0, enemy.hp - damage);
    enemy.hitFlash = 0.08;
    if (enemy.hp > 0) return;
    game.score += ENEMIES[enemy.type].score;
    game.kills++;
    burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, enemy.type === "boss" ? "#ffbd70" : "#b6f887");
    dropItems(enemy);
    const stage = 1 + Math.floor(game.kills / 10);
    if (stage > game.stage) {
        game.stage = stage;
        updateInformation();
    }
}

function damagePlayer(escaped = false) {
    const player = game.player;
    if (game.over || (!escaped && player.invulnerable > 0)) return;
    if (!escaped && game.shield.active) {
        game.shield.active = false;
        game.shield.cooldown = 10;
        player.invulnerable = 1.2;
        burst(player.x + player.w / 2, player.y + player.h / 2, "#71dbff");
        return;
    }
    player.hp = Math.max(0, player.hp - 1);
    player.invulnerable = 1.2;
    game.flash = 0.2;
    burst(player.x + player.w / 2, player.y + player.h / 2, "#ff708e");
    if (player.hp === 0) {
        game.over = true;
        game.laserActive = false;
        clearInput();
    }
}

function collectItem(item) {
    if (item.type === "heart") {
        const player = game.player;
        player.maxHp = Math.min(MAX_HEARTS, player.maxHp + 1);
        player.hp = Math.min(player.maxHp, player.hp + 1);
    } else if (item.type === "speed") {
        game.player.speedLevel = Math.min(MAX_SPEED_LEVEL, game.player.speedLevel + 1);
    } else if (item.type === "bomb") {
        game.bombs = Math.min(MAX_BOMBS, game.bombs + 1);
    } else {
        const weapon = game.weapon;
        const previousLevel = weapon.level;
        if (weapon.type !== item.type && game.mastery[weapon.type] === 2) {
            game.thirdMasteryReady[weapon.type] = true;
        }
        weapon.level = weapon.type === item.type ? weapon.level + 1 : 1;
        weapon.type = item.type;
        // 9→10을 새로 달성할 때만 지급. 다시 받으려면 무기 교체로 1단계부터 쌓아야 한다.
        if (previousLevel < WEAPON_MILESTONE && weapon.level === WEAPON_MILESTONE && game.mastery[item.type] < 2) {
            game.mastery[item.type]++;
        }
        if (weapon.level === 20 && previousLevel === 19 && game.mastery[item.type] === 2 && game.thirdMasteryReady[item.type]) {
            game.mastery[item.type] = 3;
            if (item.type === "normal") {
                game.companion.x = Math.max(0, game.player.x - 42);
                game.companion.y = game.player.y + 18;
            }
        }
        game.fireCooldown = 0;
    }
    burst(item.x + 14, item.y + 14, (SUPPORT_ITEMS[item.type] || WEAPONS[item.type]).color);
}

function useBomb() {
    if (game.over || game.bombs === 0) return;
    game.bombs--;
    const damage = 200 + game.stage * 20;
    for (const enemy of game.enemies) {
        if (enemy.y + enemy.h > 0 && enemy.y < canvas.height && enemy.x + enemy.w > 0 && enemy.x < canvas.width) {
            damageEnemy(enemy, damage);
        }
    }
    game.enemies = game.enemies.filter(enemy => enemy.hp > 0);
    game.arrows = [];
    game.bombFlash = 0.45;
}

function isFiring() { return !game.over && (keysDown[" "] || touchPointer !== null || autoFire); }

function attackWidth(type, level) {
    return WEAPONS[type].width[Math.min(level, WEAPON_MILESTONE) - 1] * (1 + (type === "normal" ? 0 : Math.min(2, game.mastery.normal) * 0.25));
}

function attackDamage(type, level) {
    return WEAPONS[type].damage[Math.min(level, WEAPON_MILESTONE) - 1] *
        (1 + Math.max(0, level - WEAPON_MILESTONE) * EXTRA_LEVEL_DAMAGE);
}

function attackRate() {
    return 1 + (game.weapon.type === "laser" ? 0 : Math.min(2, game.mastery.laser) * 0.2);
}

function shotCount(type, level) {
    return type === "spread" ? Math.min(level, WEAPON_MILESTONE) + 2 : 1 + Math.min(2, game.mastery.spread);
}

function shotAngle(type, count, index) {
    if (type !== "spread" && count === 2) return (index === 0 ? -1 : 1) * BONUS_BRANCH_ANGLE;
    return (index - (count - 1) / 2) * (type === "spread" ? 0.13 : BONUS_BRANCH_ANGLE);
}

// 그리기와 충돌 판정에 같은 레이저 형상을 사용한다.
function laserBeams() {
    const count = shotCount("laser", game.weapon.level);
    const beams = [];
    for (let ray = 0; ray < count; ray++) {
        let x = game.player.x + game.player.w / 2;
        let y = game.player.y;
        let slope = Math.tan(shotAngle("laser", count, ray));
        while (y > 0) {
            const wall = slope > 0 ? canvas.width : 0;
            const distance = slope === 0 ? Infinity : (wall - x) / slope;
            const reflects = game.mastery.spread >= 3 && distance > 0 && distance < y;
            const endY = reflects ? y - distance : 0;
            beams.push({ x, y, slope, endY, ray, width: attackWidth("laser", game.weapon.level) });
            if (!reflects) break;
            x = wall;
            y = endY;
            slope = -slope;
        }
    }
    return beams;
}

function laserHits(beam, enemy) {
    const top = Math.max(beam.endY, enemy.y);
    const bottom = Math.min(beam.y, enemy.y + enemy.h);
    if (bottom <= top) return false;
    const x1 = beam.x + (beam.y - top) * beam.slope;
    const x2 = beam.x + (beam.y - bottom) * beam.slope;
    return Math.min(x1, x2) - beam.width / 2 < enemy.x + enemy.w &&
        Math.max(x1, x2) + beam.width / 2 > enemy.x;
}

function fireWeapon(companion = false) {
    const type = companion ? "normal" : game.weapon.type;
    const level = companion ? Math.floor(game.weapon.level / 2) : game.weapon.level;
    if (type === "laser" || level < 1) return;
    const visualLevel = Math.min(level, WEAPON_MILESTONE);
    const count = companion ? 1 : shotCount(type, level);
    for (let i = 0; i < count; i++) {
        const angle = shotAngle(type, count, i);
        const width = companion ? WEAPONS.normal.width[visualLevel - 1] : attackWidth(type, level);
        game.bullets.push({
            type, companion, reflects: !companion && game.mastery.spread >= 3 && count > 1,
            x: (companion ? game.companion.x + 16 : game.player.x + game.player.w / 2) - width / 2,
            y: (companion ? game.companion.y : game.player.y) - 18,
            w: width, h: type === "spread" ? 18 + visualLevel * 0.5 : 18 + visualLevel * 2,
            vx: Math.sin(angle) * 600, vy: -Math.cos(angle) * 600,
            damage: attackDamage(type, level),
            color: type === "spread" ? `hsl(140, 60%, ${62 + visualLevel}%)` : LEVEL_COLORS[visualLevel - 1],
            glow: type === "spread" ? 3 : 9, alive: true,
        });
    }
}

function update(dt) {
    if (game.over) return;
    const player = game.player;
    game.time += dt;
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    game.flash = Math.max(0, game.flash - dt);
    game.bombFlash = Math.max(0, game.bombFlash - dt);
    const speedMultiplier = 1 + player.speedLevel * 0.03;
    if (touchTarget !== null) {
        const distance = PLAYER_SPEED * speedMultiplier * dt;
        player.x += Math.max(-distance, Math.min(distance, touchTarget - player.x));
    } else {
        player.x += ((keysDown.ArrowRight ? 1 : 0) - (keysDown.ArrowLeft ? 1 : 0)) * PLAYER_SPEED * speedMultiplier * dt;
    }
    player.x = Math.max(0, Math.min(canvas.width - player.w, player.x));
    if (game.mastery.laser >= 3 && !game.shield.active) {
        game.shield.cooldown = Math.max(0, game.shield.cooldown - dt);
        if (game.shield.cooldown <= 1e-9) {
            game.shield.cooldown = 0;
            game.shield.active = true;
        }
    }
    if (game.mastery.normal >= 3) {
        const targetX = player.x >= 42 ? player.x - 42 : player.x + player.w + 10;
        const companion = game.companion;
        companion.x += (targetX - companion.x) * (1 - Math.exp(-8 * dt));
        companion.y = player.y + 18;
        companion.cooldown = Math.max(0, companion.cooldown - dt);
        if (isFiring() && companion.cooldown === 0 && game.weapon.level >= 2) {
            fireWeapon(true);
            companion.cooldown = FIRE_INTERVAL;
        }
    }

    game.enemyCooldown -= dt;
    if (game.enemyCooldown <= 0) {
        spawnEnemy(Math.random() < archerChance() ? "archer" : "normal");
        game.enemyCooldown += enemyInterval();
    }
    if (game.stage >= 4) {
        game.bossCooldown -= dt;
        if (game.bossCooldown <= 0) {
            spawnEnemy("boss");
            game.bossCooldown += bossInterval();
        }
    }

    game.fireCooldown = Math.max(0, game.fireCooldown - dt);
    game.laserActive = Boolean(isFiring() && game.weapon.type === "laser");
    if (isFiring() && game.weapon.type !== "laser" && game.fireCooldown <= 0) {
        fireWeapon();
        game.fireCooldown = FIRE_INTERVAL / attackRate();
    }
    for (const enemy of game.enemies) {
        enemy.y += enemy.speed * dt;
        enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    }
    // 가장 가까운 적이 먼저 맞는다. 일반/갈래 포탄은 첫 충돌에서 소멸한다.
    const targets = [...game.enemies].sort((a, b) => (b.y + b.h) - (a.y + a.h));
    for (const bullet of game.bullets) {
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        if (bullet.reflects) {
            if (bullet.x < 0) {
                bullet.x = -bullet.x;
                bullet.vx = Math.abs(bullet.vx);
            } else if (bullet.x + bullet.w > canvas.width) {
                bullet.x = 2 * (canvas.width - bullet.w) - bullet.x;
                bullet.vx = -Math.abs(bullet.vx);
            }
        }
        for (const enemy of targets) {
            if (enemy.hp > 0 && overlaps(bullet, enemy)) {
                damageEnemy(enemy, bullet.damage);
                bullet.alive = false;
                break;
            }
        }
        if (bullet.y + bullet.h < 0 || bullet.x + bullet.w < 0 || bullet.x > canvas.width) bullet.alive = false;
    }
    game.bullets = game.bullets.filter(bullet => bullet.alive);
    if (game.laserActive) {
        const damage = attackDamage("laser", game.weapon.level);
        const beams = laserBeams();
        for (const enemy of game.enemies) {
            // 서로 다른 광선은 중첩 피해. 같은 광선의 반사 연결점은 한 번만 센다.
            const hits = new Set(beams.filter(beam => laserHits(beam, enemy)).map(beam => beam.ray)).size;
            if (enemy.hp > 0 && hits > 0) damageEnemy(enemy, damage * dt * hits);
        }
    }

    // 기체 외곽보다 작은 피격 영역을 사용해 회피 여유를 둔다.
    const hitbox = { x: player.x + 12, y: player.y + 12, w: player.w - 24, h: player.h - 20 };
    for (const enemy of game.enemies) {
        if (enemy.hp <= 0) continue;
        if (enemy.y >= canvas.height) {
            enemy.hp = 0;
            damagePlayer(true);
        } else if (overlaps(enemy, hitbox)) {
            enemy.hp = 0;
            damagePlayer();
        } else if (enemy.type === "archer" && enemy.y >= 50 && enemy.y + enemy.h < player.y) {
            enemy.shootCooldown -= dt;
            if (enemy.shootCooldown <= 0) {
                game.arrows.push({ x: enemy.x + enemy.w / 2 - 4, y: enemy.y + enemy.h, w: 8, h: 26 });
                enemy.shootCooldown = arrowInterval();
            }
        }
        if (game.over) return;
    }
    game.enemies = game.enemies.filter(enemy => enemy.hp > 0);
    for (const arrow of game.arrows) {
        arrow.y += arrowSpeed() * dt;
        if (overlaps(arrow, hitbox)) {
            arrow.y = canvas.height + 1;
            damagePlayer();
            if (game.over) return;
        }
    }
    game.arrows = game.arrows.filter(arrow => arrow.y <= canvas.height);
    for (const item of game.items) {
        item.y += 110 * dt;
        if (overlaps(item, player)) {
            collectItem(item);
            item.y = canvas.height + 1;
        }
    }
    game.items = game.items.filter(item => item.y <= canvas.height);
    for (const particle of game.particles) {
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.life -= dt;
    }
    game.particles = game.particles.filter(particle => particle.life > 0);
}

