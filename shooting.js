const canvas = document.createElement("canvas");
canvas.width = 400;
canvas.height = 700;
canvas.setAttribute("aria-label", "오크 슈팅 게임. 방향키로 이동, 스페이스를 누르는 동안 공격. 모바일은 터치한 채 좌우 이동.");
const ctx = canvas.getContext("2d");
document.body.appendChild(canvas);

// 전투 수치는 여기에서 조정한다. 레이저 피해는 초당 피해량이다.
const WEAPONS = {
    normal: { name: "일반 포탄", icon: "C", color: "#ffd76b", damage: [16, 30, 50, 80, 110, 145, 185, 230, 280, 340], width: [7, 11, 15, 21, 28, 36, 45, 55, 66, 78] },
    // 전탄을 맞혀도 같은 단계의 일반 포탄보다 약하게: 갈래는 범위 공격에 집중한다.
    spread: { name: "갈래 포탄", icon: "S", color: "#8df49e", damage: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22], width: [4, 4.3, 4.6, 4.9, 5.2, 5.5, 5.8, 6.1, 6.4, 6.7] },
    laser: { name: "레이저 포", icon: "L", color: "#71dbff", damage: [42, 70, 105, 145, 190, 240, 295, 355, 420, 490], width: [6, 10, 15, 22, 30, 39, 49, 60, 72, 86] },
};
const LEVEL_COLORS = ["#ffe080", "#69e9ff", "#c89aff", "#ff708e", "#ffad66", "#b0ef72", "#50edc9", "#769bff", "#ef8dff", "#ffc04d"];
const SUPPORT_ITEMS = {
    heart: { icon: "♥", color: "#ff708e" },
    speed: { icon: "»", color: "#a4f878" },
    bomb: { icon: "B", color: "#ffb36b" },
};
const WEAPON_MILESTONE = 10; // 외형과 달성 보너스 기준. 실제 무기 레벨에는 상한이 없다.
const EXTRA_LEVEL_DAMAGE = 0.05;
const MAX_SPEED_LEVEL = 16;
const MAX_BOMBS = 5;
const DOUBLE_PRESS_MS = 300;
const BONUS_BRANCH_ANGLE = 0.22;
const ENEMIES = {
    normal: { hp: 8, speed: 100, maxSpeed: 210, size: 36, score: 1 },
    archer: { hp: 12, speed: 65, maxSpeed: 200, size: 38, score: 2 },
    boss: { hp: 64, speed: 60, maxSpeed: 180, size: 60, score: 3 },
};
const HEART_DROP_RATE = 0.005;
const MAX_HEARTS = 5;
const FIRE_INTERVAL = 0.18;
const STEP = 1 / 120;
const images = {};
const BACKGROUND_BLEND = 140;
let backgroundTile = null;
let game;
let keysDown = {};
let touchPointer = null;
let touchTarget = null;
let autoFire = false;
let lastTime = null;
let accumulator = 0;
let lastTap = null;
let touchGesture = null;

function resetGame() {
    game = {
        over: false, score: 0, kills: 0, stage: 1, time: 0,
        player: { x: 169.5, y: 610, w: 61, h: 61, hp: 2, maxHp: 2, invulnerable: 0, speedLevel: 0 },
        bombs: 0, bombFlash: 0,
        weapon: { type: "normal", level: 1 },
        mastery: { normal: 0, spread: 0, laser: 0 },
        thirdMasteryReady: { normal: false, spread: false, laser: false },
        companion: { x: 126, y: 628, cooldown: 0 },
        shield: { active: false, cooldown: 10 },
        bullets: [], enemies: [], arrows: [], items: [], particles: [],
        fireCooldown: 0, enemyCooldown: 0.8, bossCooldown: 5,
        laserActive: false, flash: 0,
    };
    clearInput();
    autoFire = false;
    lastTime = null;
    accumulator = 0;
    updateInformation();
}

function clearInput() {
    keysDown = {};
    touchPointer = null;
    touchTarget = null;
    lastTap = null;
    touchGesture = null;
    if (game) game.laserActive = false;
}

// 30스테이지에 기존 제한값, 100스테이지에 새 제한값 도달 후 유지한다.
function stageValue(initial, at30, at100, startStage = 1) {
    if (game.stage <= 30) {
        const progress = Math.max(0, (game.stage - startStage) / (30 - startStage));
        return initial + (at30 - initial) * progress;
    }
    return at30 + (at100 - at30) * Math.min(1, (game.stage - 30) / 70);
}

function enemyInterval() { return stageValue(0.9, 0.34, 0.17); }
function bossInterval() { return stageValue(5, 2.8, 2, 4); }
function archerChance() { return stageValue(0.215, 0.4, 0.4); }
function arrowInterval() { return stageValue(3.72, 1.8, 1.2); }
function arrowSpeed() { return stageValue(252, 370, 500); }

function enemyStats(type) {
    const base = ENEMIES[type];
    return {
        // 1~9스테이지는 고정, 10부터 직전 스테이지 체력의 1.5%씩 복리 증가.
        hp: base.hp * 1.015 ** Math.max(0, game.stage - 9),
        speed: stageValue(base.speed, base.speed * 1.8, base.maxSpeed),
    };
}

function updateInformation() {
    const values = {
        EnemySpeedBox: Math.round(enemyStats("normal").speed),
        EnemyCreationSpeedBox: Math.round(enemyInterval() * 1000),
        BossSpeedBox: Math.round(enemyStats("boss").speed),
        BossCreationSpeedBox: Math.round(bossInterval() * 1000),
    };
    for (const [id, value] of Object.entries(values)) {
        const element = document.getElementById(id);
        if (element) element.value = value;
    }
}

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

function drawBeam(beam, color) {
    const topX = beam.x + beam.y * beam.slope;
    const width = beam.width;
    const length = beam.y - beam.endY;
    ctx.save();
    // 광선 기울기에 맞춰 색의 단면과 흐름도 함께 변형한다. 판정 너비는 그대로다.
    ctx.transform(1, 0, -beam.slope, 1, topX, 0);
    const glow = ctx.createLinearGradient(-width * 0.7, 0, width * 0.7, 0);
    glow.addColorStop(0, "transparent");
    glow.addColorStop(0.3, color);
    glow.addColorStop(0.7, color);
    glow.addColorStop(1, "transparent");
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = glow;
    ctx.fillRect(-width * 0.7, beam.endY, width * 1.4, length);
    const body = ctx.createLinearGradient(-width / 2, 0, width / 2, 0);
    body.addColorStop(0, "transparent");
    body.addColorStop(0.18, color);
    body.addColorStop(0.5, color);
    body.addColorStop(0.82, color);
    body.addColorStop(1, "transparent");
    ctx.globalAlpha = 0.65 + Math.sin(game.time * 18) * 0.06;
    ctx.fillStyle = body;
    ctx.fillRect(-width / 2, beam.endY, width, length);
    ctx.globalAlpha = 0.85;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = "#fff2ce";
    ctx.lineWidth = Math.min(3, width * 0.12);
    ctx.beginPath();
    ctx.moveTo(0, beam.y);
    ctx.lineTo(0, beam.endY);
    ctx.stroke();
    // 짧은 에너지 파동이 포구에서 위로 흐른다.
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.22;
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
        const y = beam.y - (game.time * 440 + i * length / 6) % length;
        ctx.beginPath();
        ctx.moveTo(-width * 0.3, y + 9);
        ctx.quadraticCurveTo(0, y - 7, width * 0.3, y + 9);
        ctx.stroke();
    }
    ctx.restore();
}

function drawBullet(bullet) {
    ctx.save();
    ctx.translate(bullet.x + bullet.w / 2, bullet.y + bullet.h / 2);
    ctx.rotate(Math.atan2(bullet.vx, -bullet.vy));
    const w = bullet.w;
    const h = bullet.h;
    if (bullet.type === "normal") {
        const tailLength = h * (1.5 + 0.15 * Math.sin(game.time * 25 + bullet.y));
        const tail = ctx.createLinearGradient(0, h * 0.15, 0, h / 2 + tailLength);
        tail.addColorStop(0, bullet.color);
        tail.addColorStop(0.35, bullet.color + "99");
        tail.addColorStop(1, "transparent");
        ctx.fillStyle = tail;
        ctx.beginPath();
        ctx.moveTo(-w * 0.35, h * 0.15);
        ctx.quadraticCurveTo(-w * 0.25, h, 0, h / 2 + tailLength);
        ctx.quadraticCurveTo(w * 0.25, h, w * 0.35, h * 0.15);
        ctx.fill();
        const body = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
        body.addColorStop(0, bullet.color);
        body.addColorStop(0.3, "#fff0c5");
        body.addColorStop(0.48, bullet.color);
        body.addColorStop(1, "#6b392d");
        ctx.fillStyle = body;
        ctx.shadowColor = bullet.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, -h / 2);
        ctx.bezierCurveTo(w * 0.65, -h * 0.35, w * 0.55, h * 0.5, 0, h * 0.5);
        ctx.bezierCurveTo(-w * 0.55, h * 0.5, -w * 0.65, -h * 0.35, 0, -h / 2);
        ctx.fill();
    } else {
        ctx.fillStyle = bullet.color;
        ctx.shadowColor = bullet.color;
        ctx.shadowBlur = bullet.glow;
        ctx.beginPath();
        ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
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
        const distance = 420 * speedMultiplier * dt;
        player.x += Math.max(-distance, Math.min(distance, touchTarget - player.x));
    } else {
        player.x += ((keysDown.ArrowRight ? 1 : 0) - (keysDown.ArrowLeft ? 1 : 0)) * 360 * speedMultiplier * dt;
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

function drawSprite(name, x, y, w, h, fallback) {
    const img = images[name];
    if (img && img.complete && img.naturalWidth > 0) ctx.drawImage(img, x, y, w, h);
    else {
        ctx.fillStyle = fallback;
        ctx.fillRect(x, y, w, h);
    }
}

// 원본은 보존하고, 위쪽 가장자리만 투명하게 만든 스크롤용 사본을 한 번 준비한다.
function prepareBackground() {
    const image = images.background;
    if (!image.complete || !image.naturalWidth) return;
    backgroundTile = document.createElement("canvas");
    backgroundTile.width = canvas.width;
    backgroundTile.height = canvas.height;
    const tileCtx = backgroundTile.getContext("2d");
    tileCtx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const fade = tileCtx.createLinearGradient(0, 0, 0, BACKGROUND_BLEND);
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(1, "rgba(0,0,0,1)");
    tileCtx.globalCompositeOperation = "destination-in";
    tileCtx.fillStyle = fade;
    tileCtx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawBackground() {
    if (!backgroundTile) return;
    const period = canvas.height - BACKGROUND_BLEND;
    const offset = (game.time * 28) % period;
    // 겹치는 부분 아래에는 항상 불투명한 이전 타일이 있게 위에서부터 그린다.
    // 화면 위쪽의 블렌딩까지 덮기 위해 두 주기 앞에서 시작한다.
    for (let y = offset - period * 2; y < canvas.height; y += period) {
        ctx.drawImage(backgroundTile, 0, y);
    }
}

function render() {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#101820";
    ctx.fillRect(0, 0, 400, 700);
    drawBackground();
    ctx.fillStyle = "rgba(5, 12, 20, .25)";
    ctx.fillRect(0, 0, 400, 700);
    for (const enemy of game.enemies) {
        if (enemy.hp <= 0) continue;
        if (enemy.type === "archer") {
            drawSprite("archer", enemy.x, enemy.y, enemy.w, enemy.h, "#a3cd62");
            drawSprite("bow", enemy.x + 24, enemy.y + 9, 24, 24, "#cfa371");
            if (enemy.shootCooldown < 0.3) {
                ctx.fillStyle = "#ffb85f";
                ctx.fillRect(enemy.x + enemy.w / 2 - 2, enemy.y + enemy.h + 3, 4, 10);
            }
        } else drawSprite(enemy.type === "boss" ? "boss" : "orc", enemy.x, enemy.y, enemy.w, enemy.h, "#9eb565");
        if (enemy.hitFlash > 0) {
            ctx.fillStyle = "rgba(255,255,255,.24)";
            ctx.fillRect(enemy.x, enemy.y, enemy.w, enemy.h);
        }
        if (enemy.hp < enemy.maxHp || enemy.type === "boss") {
            ctx.fillStyle = "#16202a";
            ctx.fillRect(enemy.x, enemy.y - 7, enemy.w, 4);
            ctx.fillStyle = enemy.type === "boss" ? "#ff9a69" : "#9bea85";
            ctx.fillRect(enemy.x, enemy.y - 7, enemy.w * enemy.hp / enemy.maxHp, 4);
        }
    }
    ctx.save();
    for (const bullet of game.bullets) {
        drawBullet(bullet);
    }
    if (game.laserActive && isFiring()) {
        for (const beam of laserBeams()) {
            drawBeam(beam, LEVEL_COLORS[Math.min(game.weapon.level, WEAPON_MILESTONE) - 1]);
        }
    }
    ctx.restore();
    for (const arrow of game.arrows) {
        ctx.strokeStyle = "#fff0bd";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(arrow.x + 4, arrow.y);
        ctx.lineTo(arrow.x + 4, arrow.y + 24);
        ctx.stroke();
        ctx.fillStyle = "#ff8058";
        ctx.beginPath();
        ctx.moveTo(arrow.x - 2, arrow.y + 17);
        ctx.lineTo(arrow.x + 10, arrow.y + 17);
        ctx.lineTo(arrow.x + 4, arrow.y + 27);
        ctx.fill();
    }
    for (const item of game.items) {
        const { color, icon } = SUPPORT_ITEMS[item.type] || WEAPONS[item.type];
        ctx.fillStyle = "#101e2b";
        ctx.fillRect(item.x, item.y, 28, 28);
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(item.x, item.y, 28, 28);
        ctx.fillStyle = color;
        ctx.font = "bold 20px Arial";
        ctx.textAlign = "center";
        ctx.fillText(icon, item.x + 14, item.y + 21);
    }
    ctx.textAlign = "left";
    const player = game.player;
    ctx.globalAlpha = player.invulnerable > 0 && Math.floor(game.time * 14) % 2 ? 0.35 : 1;
    drawSprite("tank", player.x, player.y, player.w, player.h, "#cfe9ee");
    ctx.globalAlpha = 1;
    if (game.mastery.normal >= 3) {
        drawSprite("tank", game.companion.x, game.companion.y, 32, 32, "#cfe9ee");
    }
    if (game.shield.active) {
        ctx.save();
        ctx.strokeStyle = "#8deaff";
        ctx.fillStyle = "rgba(100, 215, 255, .12)";
        ctx.shadowColor = "#71dbff";
        ctx.shadowBlur = 12;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(player.x + player.w / 2, player.y + player.h / 2, 41.5, 41.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    for (const particle of game.particles) {
        ctx.globalAlpha = Math.max(0, particle.life / 0.45);
        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x, particle.y, 4, 4);
    }
    ctx.globalAlpha = 1;
    // 바 없이 배경 위에 표시하고, 글자 그림자로 가독성만 확보한다.
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, .9)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = "#f5f2df";
    ctx.font = "bold 18px Arial";
    ctx.fillText(`SCORE ${game.score}`, 14, 25);
    drawMasteryIcons();
    ctx.fillStyle = "#f5f2df";
    ctx.font = "bold 18px Arial";
    ctx.textAlign = "right";
    ctx.fillText(`STAGE ${game.stage}`, 386, 25);
    ctx.textAlign = "left";
    ctx.font = "23px Arial";
    for (let i = 0; i < player.hp; i++) {
        ctx.fillStyle = "#ff708e";
        ctx.fillText("♥", 14 + i * 23, 688);
    }
    ctx.font = "bold 20px Arial";
    ctx.fillStyle = "#ffb36b";
    ctx.textAlign = "right";
    ctx.fillText(`B × ${game.bombs}`, 386, 688);
    ctx.textAlign = "center";
    ctx.fillStyle = WEAPONS[game.weapon.type].color;
    ctx.fillText(`${WEAPONS[game.weapon.type].icon} × ${game.weapon.level}`, 200, 688);
    ctx.restore();
    ctx.textAlign = "center";
    if (game.flash > 0 && !game.over) {
        ctx.fillStyle = `rgba(255, 55, 80, ${game.flash})`;
        ctx.fillRect(0, 0, 400, 700);
    }
    if (game.bombFlash > 0) {
        ctx.fillStyle = `rgba(255, 225, 170, ${game.bombFlash})`;
        ctx.fillRect(0, 0, 400, 700);
    }
    if (game.over) {
        ctx.fillStyle = "rgba(3, 8, 16, .82)";
        ctx.fillRect(0, 0, 400, 700);
        ctx.fillStyle = "#fff0dc";
        ctx.font = "bold 36px Arial";
        ctx.fillText("GAME OVER", 200, 290);
        ctx.font = "20px Arial";
        ctx.fillText(`SCORE ${game.score}  ·  STAGE ${game.stage}`, 200, 330);
        ctx.font = "16px Arial";
        ctx.fillText("터치 또는 Enter로 다시 시작", 200, 385);
    }
    ctx.textAlign = "left";
}

function drawMasteryIcons() {
    ctx.save();
    ctx.lineWidth = 2;
    let x = 14;
    for (const [type, rank] of Object.entries(game.mastery)) {
        if (!rank) continue;
        ctx.strokeStyle = WEAPONS[type].color;
        ctx.fillStyle = WEAPONS[type].color;
        ctx.beginPath();
        if (type === "normal") {
            ctx.rect(x, 38, 5, 17);
            ctx.rect(x + 10, 38, 5, 17);
        } else if (type === "spread") {
            for (const dx of [0, 8, 16]) {
                ctx.moveTo(x + 8, 55);
                ctx.lineTo(x + dx, 38);
            }
        } else {
            ctx.moveTo(x + 12, 37);
            ctx.lineTo(x + 3, 47);
            ctx.lineTo(x + 12, 47);
            ctx.lineTo(x + 3, 57);
        }
        ctx.stroke();
        ctx.font = "bold 12px Arial";
        ctx.textAlign = "left";
        ctx.fillText("I".repeat(rank), x + 20, 53);
        x += 46;
    }
    ctx.restore();
}

function moveTouchTank(event) {
    const bounds = canvas.getBoundingClientRect();
    touchTarget = Math.max(0, Math.min(canvas.width - game.player.w,
        (event.clientX - bounds.left) * canvas.width / bounds.width - game.player.w / 2));
}
canvas.addEventListener("pointerdown", function (event) {
    if (game.over) { resetGame(); return; }
    if (event.pointerType === "mouse" || touchPointer !== null) return;
    event.preventDefault();
    touchPointer = event.pointerId;
    touchGesture = { time: event.timeStamp, x: event.clientX, y: event.clientY };
    if (lastTap && event.timeStamp - lastTap.time <= DOUBLE_PRESS_MS &&
        Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) <= 48) {
        useBomb();
        touchGesture = null;
    }
    lastTap = null;
    canvas.setPointerCapture(event.pointerId);
    moveTouchTank(event);
});
canvas.addEventListener("pointermove", function (event) {
    if (event.pointerId === touchPointer && !game.over) {
        if (touchGesture && Math.hypot(event.clientX - touchGesture.x, event.clientY - touchGesture.y) > 18) touchGesture = null;
        moveTouchTank(event);
    }
});
function stopTouch(event) {
    if (event.pointerId === touchPointer) {
        touchPointer = null;
        touchTarget = null;
        touchGesture = null;
        lastTap = null;
        game.laserActive = false;
    }
}
canvas.addEventListener("pointerup", function (event) {
    if (event.pointerId !== touchPointer) return;
    const tap = touchGesture && event.timeStamp - touchGesture.time <= 220 &&
        Math.hypot(event.clientX - touchGesture.x, event.clientY - touchGesture.y) <= 18
        ? { time: event.timeStamp, x: event.clientX, y: event.clientY } : null;
    stopTouch(event);
    lastTap = tap;
});
canvas.addEventListener("pointercancel", stopTouch);
canvas.addEventListener("lostpointercapture", stopTouch);
document.addEventListener("keydown", function (event) {
    if (["ArrowLeft", "ArrowRight", " ", "Enter"].includes(event.key)) event.preventDefault();
    if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        if (!event.repeat && !keysDown.f) useBomb();
        keysDown.f = true;
        return;
    }
    if (game.over && event.key === "Enter") resetGame();
    else keysDown[event.key] = true;
});
document.addEventListener("keyup", function (event) { delete keysDown[event.key.toLowerCase() === "f" ? "f" : event.key]; });
window.addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", function () {
    clearInput();
    lastTime = null;
    accumulator = 0;
});
document.getElementById("dot").addEventListener("click", function () { autoFire = !autoFire; });

function main(timestamp) {
    if (!document.hidden) {
        if (lastTime !== null) accumulator += Math.min(0.1, (timestamp - lastTime) / 1000);
        lastTime = timestamp;
        while (accumulator >= STEP) {
            update(STEP);
            accumulator -= STEP;
        }
        render();
    } else lastTime = null;
    requestAnimationFrame(main);
}

resetGame();
// 이미지 로딩을 기다린 후 시작하며, 실패한 이미지는 기본 도형으로 대체한다.
Promise.all(Object.entries({
    background: "assets/background.jpg", tank: "assets/tank.png", orc: "assets/orc.png", boss: "assets/boss.png",
    archer: "assets/archer-orc.png", bow: "assets/bow.png",
}).map(([name, src]) => new Promise(resolve => {
    const image = new Image();
    images[name] = image;
    image.onload = resolve;
    image.onerror = resolve;
    image.src = src;
}))).then(() => {
    prepareBackground();
    requestAnimationFrame(main);
});
