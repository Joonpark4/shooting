// Canvas 그리기 전용. 전투 판정은 shooting-combat.js에서 처리한다.
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

