// Logic checks only; no browser, screenshots or screen validation.
// Run: node shooting.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const listeners = {};
const elements = {};
const assetPaths = [];
const canvas = {
    setAttribute() {}, getContext: () => ({}),
    getBoundingClientRect: () => ({ left: 30, width: 200 }),
    addEventListener: (name, handler) => { listeners[name] = handler; },
    setPointerCapture() {},
};
const context = vm.createContext({
    document: {
        hidden: false, createElement: () => canvas, body: { appendChild() {} },
        addEventListener: (name, handler) => { listeners[name] = handler; },
        getElementById: id => elements[id] ||= { addEventListener() {} },
    },
    window: {
        matchMedia: () => ({ matches: true }),
        addEventListener: (name, handler) => { listeners[name] = handler; },
    },
    Image: class { set src(value) { assetPaths.push(value); } },
    requestAnimationFrame() {},
});
const run = source => vm.runInContext(source, context);
// 실제 페이지와 동일한 파일 및 순서로 로드한다.
const page = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
for (const [, src] of page.matchAll(/<script src="([^"]+)"><\/script>/g)) {
    run(fs.readFileSync(path.join(__dirname, src), 'utf8'));
}
run('const originalRandom = Math.random');
let passed = 0;
function test(name, check) {
    run('Math.random = originalRandom; resetGame(); game.enemyCooldown = 1e6; game.bossCooldown = 1e6;');
    check();
    passed++;
    console.log(`PASS ${name}`);
}
function advance(seconds) {
    for (let n = 0; n < Math.round(seconds * 120); n++) run('update(STEP)');
}
const pointer = (pointerId, clientX) => ({ pointerId, clientX, pointerType: 'touch', clientY: 300, timeStamp: 0, preventDefault() {} });
const key = value => ({ key: value, timeStamp: 0, preventDefault() {} });
const pickup = type => run(`collectItem({ type: '${type}', x: 100, y: 300 })`);

test('all local image assets exist and new sprites are valid PNGs', () => {
    for (const src of assetPaths) assert.ok(fs.statSync(path.join(__dirname, src)).size > 0, src);
    for (const src of ['assets/archer-orc.png', 'assets/bow.png']) {
        const bytes = fs.readFileSync(path.join(__dirname, src));
        assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
        assert.equal(bytes.readUInt32BE(16), 16);
        assert.equal(bytes.readUInt32BE(20), 16);
    }
});
test('scrolling background overlap covers every row before and after wrapping', () => {
    // 좌표와 알파 합성 계산만 검사한다. 실제 화면이나 이미지는 렌더링하지 않는다.
    run(`globalThis.backgroundDraws = [];
        ctx.drawImage = (image, x, y) => backgroundDraws.push(y);
        backgroundTile = {};`);
    const height = run('canvas.height');
    const blend = run('BACKGROUND_BLEND');
    const period = height - blend;
    for (const distance of [0, 0.01, period / 2, period - 0.01, period, period + 0.01]) {
        run(`backgroundDraws = []; game.time = ${distance} / 28; drawBackground()`);
        const positions = Array.from(run('backgroundDraws'));
        for (let row = 0; row < height; row++) {
            let opacity = 0;
            for (const top of positions) {
                const localY = row - top;
                if (localY < 0 || localY >= height) continue;
                const alpha = Math.min(1, localY / blend);
                opacity = alpha + opacity * (1 - alpha);
            }
            assert.ok(Math.abs(opacity - 1) < 1e-10, `uncovered row ${row} at scroll ${distance}`);
        }
    }
    run('backgroundTile = null; delete ctx.drawImage');
});
test('same weapon upgrades beyond ten; switching always starts at one', () => {
    for (const type of ['spread', 'laser', 'normal']) {
        pickup(type);
        assert.equal(run('game.weapon.level'), 1);
        for (let i = 0; i < 12; i++) pickup(type);
        assert.equal(run('game.weapon.level'), 13);
    }
    pickup('laser');
    assert.equal(run('game.weapon.level'), 1, 'returning to a former weapon does not restore its level');
});
test('spread fires a symmetric 3-through-12 fan, with increasing width and damage', () => {
    pickup('spread');
    let previousWidth = 0;
    let previousDamage = 0;
    for (const count of [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
        run('game.bullets = []; fireWeapon()');
        assert.equal(run('game.bullets.length'), count);
        assert.ok(run('game.bullets[0].vx') < 0);
        assert.equal(run('game.bullets[0].vx + game.bullets.at(-1).vx'), 0);
        if (count % 2) assert.equal(run(`game.bullets[${(count - 1) / 2}].vx`), 0);
        assert.ok(run('game.bullets[0].w') > previousWidth);
        assert.ok(run('game.bullets[0].damage') > previousDamage);
        previousWidth = run('game.bullets[0].w');
        previousDamage = run('game.bullets[0].damage');
        pickup('spread');
    }
});
test('all weapon levels change color and grow, shell DPS exceeds laser DPS', () => {
    assert.equal(run('new Set(LEVEL_COLORS).size'), 10);
    for (let i = 0; i < 10; i++) {
        assert.ok(run(`WEAPONS.normal.damage[${i}] / FIRE_INTERVAL > WEAPONS.laser.damage[${i}]`));
        if (i > 0) for (const type of ['normal', 'spread', 'laser']) {
            assert.ok(run(`WEAPONS.${type}.width[${i}] > WEAPONS.${type}.width[${i - 1}]`));
            assert.ok(run(`WEAPONS.${type}.damage[${i}] > WEAPONS.${type}.damage[${i - 1}]`));
        }
    }
});
test('shell hits just the first enemy, even with excess damage', () => {
    run(`game.weapon.level = 4;
        for (let i = 0; i < 2; i++) Object.assign(spawnEnemy('normal'), { x: 182, y: 580, speed: 0 });
        fireWeapon(); update(STEP);`);
    assert.equal(run('game.enemies.length'), 1);
    assert.equal(run('game.enemies[0].hp'), 8);
    assert.equal(run('game.bullets.length'), 0);
    assert.equal(run('game.kills'), 1);
});
test('galrae shells do not penetrate either', () => {
    pickup('spread');
    run(`for (let i = 0; i < 2; i++) Object.assign(spawnEnemy('normal'), { x: 182, y: 580, speed: 0 });
        fireWeapon(); game.bullets = [game.bullets[1]]; update(STEP);`);
    assert.equal(run('game.enemies[0].hp'), 4);
    assert.equal(run('game.enemies[1].hp'), 8);
});
test('even a full spread volley deals less single-target damage than a normal shell at every level', () => {
    for (let level = 1; level <= 10; level++) {
        const damage = {};
        for (const type of ['normal', 'spread']) {
            run(`resetGame(); game.enemyCooldown = 1e6; game.weapon = {type:'${type}', level:${level}};
                Object.assign(spawnEnemy('boss'), {x:0, y:570, w:400, h:36, hp:10000, maxHp:10000, speed:0});
                fireWeapon(); update(STEP);`);
            assert.equal(run('game.bullets.length'), 0, 'every projectile hit the same wide target');
            damage[type] = 10000 - run('game.enemies[0].hp');
        }
        assert.ok(damage.spread < damage.normal, `level ${level}: spread ${damage.spread}, shell ${damage.normal}`);
    }
});
test('spread effects grow subtly while retaining a green hue and weaker glow', () => {
    let previousWidth = 0;
    let previousHeight = 0;
    for (let level = 1; level <= 10; level++) {
        run(`game.weapon = {type:'spread', level:${level}}; game.bullets = []; fireWeapon()`);
        const bullet = run('game.bullets[0]');
        assert.ok(bullet.color.startsWith('hsl(140, 60%,'));
        assert.equal(bullet.glow, 3);
        if (level > 1) {
            assert.ok(bullet.w - previousWidth <= 0.31);
            assert.ok(bullet.h - previousHeight <= 0.5);
        }
        previousWidth = bullet.w;
        previousHeight = bullet.h;
    }
});
test('laser damages every aligned target continuously but misses targets beside it', () => {
    pickup('laser');
    run(`for (const y of [100, 300]) Object.assign(spawnEnemy('boss'), { x: 180, y, speed: 0 });
        Object.assign(spawnEnemy('boss'), { x: 260, y: 200, speed: 0 }); keysDown[' '] = true;`);
    advance(1);
    assert.ok(Math.abs(run('game.enemies[0].hp') - 22) < 1e-8);
    assert.ok(Math.abs(run('game.enemies[1].hp') - 22) < 1e-8);
    assert.equal(run('game.enemies[2].hp'), 64);
    assert.equal(run('game.bullets.length'), 0);
    listeners.keyup(key(' '));
    advance(0.5);
    assert.ok(Math.abs(run('game.enemies[0].hp') - 22) < 1e-8);
    assert.equal(run('game.laserActive'), false);
});
test('laser damage depends on elapsed time, not the update count', () => {
    const hp = [];
    for (const steps of [60, 120, 144]) {
        run(`resetGame(); game.enemyCooldown = 1e6; game.weapon.type = 'laser'; keysDown[' '] = true;
            Object.assign(spawnEnemy('boss'), { x: 180, y: 100, speed: 0 });`);
        for (let i = 0; i < steps; i++) run(`update(${1 / steps})`);
        hp.push(run('game.enemies[0].hp'));
    }
    assert.ok(hp.every(value => Math.abs(value - 22) < 1e-8));
});
test('dead enemies award kills and drops once; every ten kills advances stage', () => {
    run(`Math.random = () => 0.5; game.kills = 9;
        globalThis.target = spawnEnemy('boss'); damageEnemy(target, 200); damageEnemy(target, 200);`);
    assert.equal(run('game.score'), 3);
    assert.equal(run('game.kills'), 10);
    assert.equal(run('game.stage'), 2);
});
test('each enemy type gains HP from stage ten; existing enemies keep their spawn HP', () => {
    run('globalThis.oldEnemy = spawnEnemy("normal")');
    for (const type of ['normal', 'archer', 'boss']) {
        run('game.stage = 1');
        const first = run(`spawnEnemy('${type}').hp`);
        run('game.stage = 10');
        assert.ok(run(`spawnEnemy('${type}').hp`) > first);
    }
    assert.equal(run('oldEnemy.hp'), 8);
});
test('starting shells still one-shot grunts through stage fifty after a weapon switch', () => {
    for (const stage of [1, 9, 10, 20, 50]) {
        run(`resetGame(); game.stage = ${stage}; game.enemyCooldown = 1e6;
            Object.assign(spawnEnemy('normal'), { x:182, y:580, speed:0 }); fireWeapon(); update(STEP);`);
        assert.equal(run('game.enemies.length'), 0, `stage ${stage}`);
    }
});
test('HP stays flat through stage nine then compounds by 1.3% per stage', () => {
    for (const [type, base] of [['normal', 8], ['archer', 12], ['boss', 64]]) {
        let previous = 0;
        for (let stage = 1; stage <= 100; stage++) {
            run(`game.stage = ${stage}`);
            const hp = run(`enemyStats('${type}').hp`);
            if (stage < 10) assert.equal(hp, base);
            else assert.ok(Math.abs(hp / previous - 1.013) < 1e-10);
            previous = hp;
        }
    }
});
test('weapon drop thresholds are 10% for normal/archer and 1/3 for bosses', () => {
    for (const [type, threshold] of [['normal', 0.1], ['archer', 0.1], ['boss', 1 / 3]]) {
        for (const [roll, expected] of [[threshold - 1e-8, 1], [threshold, 0]]) {
            run(`game.items = []; globalThis.rolls = [${roll}, 0.5, 0.5];
                Math.random = () => rolls.shift() ?? 0.5;
                dropItems({type:'${type}', x:100, y:100, w:40});`);
            assert.equal(run('game.items.filter(item => item.type !== "heart").length'), expected, type);
        }
    }
});
test('all three weapons can drop and hearts use a separate 0.5% roll', () => {
    for (const [roll, type] of [[0, 'normal'], [0.4, 'spread'], [0.9, 'laser']]) {
        run(`game.items = []; globalThis.rolls = [0, ${roll}, 0.5];
            Math.random = () => rolls.shift(); dropItems({type:'normal', x:100, y:100, w:40});`);
        assert.equal(run('game.items[0].type'), type);
    }
    for (const [roll, expected] of [[0.004999, 1], [0.005, 0]]) {
        run(`game.items = []; globalThis.rolls = [0.5, ${roll}];
            Math.random = () => rolls.shift(); dropItems({type:'normal', x:100, y:100, w:40});`);
        assert.equal(run('game.items.length'), expected);
        if (expected) assert.equal(run('game.items[0].type'), 'heart');
    }
});
test('hearts start at two, grow both current/max HP by one and stop at five', () => {
    assert.equal(run('game.player.hp'), 2);
    assert.equal(run('game.player.maxHp'), 2);
    run('damagePlayer()');
    pickup('heart');
    assert.equal(run('game.player.hp'), 2);
    assert.equal(run('game.player.maxHp'), 3);
    for (let i = 0; i < 10; i++) pickup('heart');
    assert.equal(run('game.player.hp'), 5);
    assert.equal(run('game.player.maxHp'), 5);
    run('game.player.hp = 3');
    pickup('heart');
    assert.equal(run('game.player.hp'), 4, 'at capacity hearts still heal');
});
test('arrow hits cost one heart; invulnerability prevents immediate second damage', () => {
    run(`game.arrows = [{ x: 196, y: 620, w: 8, h: 26 }, { x: 200, y: 620, w: 8, h: 26 }]; update(STEP);`);
    assert.equal(run('game.player.hp'), 1);
    assert.equal(run('game.over'), false);
    assert.equal(run('game.arrows.length'), 0);
    advance(1.3);
    run(`game.arrows.push({ x: 196, y: 620, w: 8, h: 26 }); update(STEP);`);
    assert.equal(run('game.player.hp'), 0);
    assert.equal(run('game.over'), true);
});
test('archer fires straight down; player bullets cannot destroy arrows', () => {
    run(`Object.assign(spawnEnemy('archer'), {x:100, y:150, speed:0, shootCooldown:0}); update(STEP);`);
    assert.equal(run('game.arrows.length'), 1);
    const x = run('game.arrows[0].x');
    const y = run('game.arrows[0].y');
    run(`game.bullets.push({ x:${x}, y:${y}, w:10, h:20, vx:0, vy:0, damage:100, alive:true });`);
    advance(0.5);
    assert.equal(run('game.arrows[0].x'), x);
    assert.ok(run('game.arrows[0].y') > y);
});
test('each escaped enemy costs a heart, awards nothing, and bypasses hit immunity', () => {
    run(`Object.assign(spawnEnemy('normal'), { x:0, y:701 }); update(STEP);`);
    assert.equal(run('game.player.hp'), 1);
    assert.equal(run('game.over'), false);
    assert.equal(run('game.score'), 0);
    assert.equal(run('game.items.length'), 0);
    run(`Object.assign(spawnEnemy('normal'), { x:0, y:701 }); update(STEP);`);
    assert.equal(run('game.over'), true);
});
test('falling items are collected by contact and missed items are removed', () => {
    run(`addItem('laser', 190, 610); addItem('spread', 0, 701); update(STEP);`);
    assert.equal(run('game.weapon.type'), 'laser');
    assert.equal(run('game.items.length'), 0);
});
test('scaled touch input clamps movement, supports one finger and stops firing on release', () => {
    listeners.pointerdown(pointer(1, 130));
    assert.equal(run('touchTarget'), 169.5);
    advance(1 / 120);
    assert.equal(run('game.bullets.length'), 1);
    listeners.pointerdown(pointer(2, 230));
    assert.equal(run('touchTarget'), 169.5);
    listeners.pointermove(pointer(1, -50));
    advance(0.5);
    assert.equal(run('game.player.x'), 0);
    listeners.pointermove(pointer(1, 300));
    advance(1);
    assert.equal(run('game.player.x'), 339);
    listeners.pointerup(pointer(2, 130));
    assert.equal(run('touchPointer'), 1);
    listeners.pointerup(pointer(1, 130));
    assert.equal(run('touchPointer'), null);
    run('game.bullets = []');
    advance(0.5);
    assert.equal(run('game.bullets.length'), 0);
});
test('cancel, capture loss, blur and hidden tab release the laser and movement', () => {
    pickup('laser');
    for (const stop of ['pointercancel', 'lostpointercapture', 'blur', 'visibilitychange']) {
        listeners.pointerdown(pointer(1, 130));
        run('update(STEP)');
        assert.equal(run('game.laserActive'), true);
        listeners[stop](pointer(1, 130));
        assert.equal(run('touchPointer'), null);
        assert.equal(run('touchTarget'), null);
        assert.equal(run('game.laserActive'), false);
    }
});
test('keyboard supports hold-to-fire and movement without going outside canvas', () => {
    listeners.keydown(key(' '));
    listeners.keydown(key('ArrowRight'));
    advance(0.5);
    assert.equal(run('game.player.x'), 339);
    assert.ok(run('game.bullets.length') >= 2);
    listeners.keyup(key(' '));
    listeners.keyup(key('ArrowRight'));
    listeners.keydown(key('ArrowLeft'));
    advance(1);
    assert.equal(run('game.player.x'), 0);
});
test('offscreen projectiles and expired particles are removed', () => {
    run(`game.bullets.push({x:-40, y:-40, w:5, h:5, vx:0, vy:0, alive:true});
        game.arrows.push({x:0, y:701, w:8, h:26}); burst(100,100,'white');`);
    advance(0.6);
    assert.equal(run('game.bullets.length + game.arrows.length + game.particles.length'), 0);
});
test('bosses start at stage four, game over freezes combat, restart resets everything', () => {
    run('game.bossCooldown = 0');
    advance(0.1);
    assert.equal(run('game.enemies.length'), 0);
    run('game.stage = 4');
    advance(1 / 120);
    assert.equal(run('game.enemies[0].type'), 'boss');
    run('game.over = true; game.weapon = {type:"laser", level:4}; game.score = 100');
    const time = run('game.time');
    advance(1);
    assert.equal(run('game.time'), time);
    listeners.keydown(key('Enter'));
    assert.equal(run('game.over'), false);
    assert.equal(run('game.score'), 0);
    assert.equal(run('game.stage'), 1);
    assert.equal(run('game.weapon.type'), 'normal');
    assert.equal(run('game.weapon.level'), 1);
    assert.equal(run('game.player.hp'), 2);
    assert.equal(run('game.enemies.length + game.arrows.length + game.items.length'), 0);
    run('game.over = true');
    listeners.pointerdown(pointer(1, 130));
    assert.equal(run('game.over'), false);
});
test('speed items stack up to sixteen and accelerate both keyboard and touch', () => {
    const distances = [];
    for (const touch of [false, true]) {
        for (const upgraded of [false, true]) {
            run('resetGame(); game.enemyCooldown = 1e6; game.player.x = 0');
            if (upgraded) for (let i = 0; i < 20; i++) pickup('speed');
            assert.equal(run('game.player.speedLevel'), upgraded ? 16 : 0);
            run(touch ? 'touchTarget = 336' : 'keysDown.ArrowRight = true');
            advance(0.1);
            distances.push(run('game.player.x'));
        }
    }
    assert.ok(Math.abs(distances[1] / distances[0] - 1.48) < 1e-10);
    assert.ok(Math.abs(distances[3] / distances[2] - 1.48) < 1e-10);
    assert.equal(distances[0], distances[2], 'touch and keyboard have the same base speed');
    assert.equal(distances[1], distances[3], 'touch and keyboard have the same upgraded speed');
    assert.equal(run('game.weapon.level'), 1);
});
test('speed and bomb drop independently without reducing weapon drop chances', () => {
    for (const [speed, bomb, expected] of [[0.02999, 0.5, 'speed'], [0.5, 0.01499, 'bomb'], [0.03, 0.015, '']]) {
        run(`game.items = []; globalThis.rolls = [0.5, 0.5, ${speed}, ${bomb}];
            Math.random = () => rolls.shift(); dropItems({type:'normal', x:100, y:100, w:40});`);
        assert.equal(run('game.items.map(item => item.type).join()'), expected);
    }
});
test('bomb inventory caps at five, damages visible enemies once and clears arrows', () => {
    run('useBomb()');
    assert.equal(run('game.bombs'), 0);
    for (let i = 0; i < 8; i++) pickup('bomb');
    assert.equal(run('game.bombs'), 5);
    run(`Math.random = () => 0.5;
        Object.assign(spawnEnemy('normal'), {x:0, y:100});
        Object.assign(spawnEnemy('archer'), {x:300, y:400});
        globalThis.tough = Object.assign(spawnEnemy('boss'), {x:50, y:200, hp:1000});
        globalThis.offscreen = Object.assign(spawnEnemy('normal'), {x:0, y:-100});
        game.arrows.push({x:10, y:500, w:8, h:26}); useBomb();`);
    assert.equal(run('game.bombs'), 4);
    assert.equal(run('game.kills'), 2);
    assert.equal(run('tough.hp'), 780);
    assert.equal(run('offscreen.hp'), 8);
    assert.equal(run('game.arrows.length'), 0);
    assert.equal(run('game.player.hp'), 2);
    run('game.over = true; useBomb()');
    assert.equal(run('game.bombs'), 4);
});
test('F fires one bomb per press; repeats are ignored and double space only shoots', () => {
    run('game.bombs = 5');
    listeners.keydown({...key(' '), timeStamp:100});
    listeners.keydown({...key(' '), timeStamp:150, repeat:true});
    assert.equal(run('game.bombs'), 5);
    listeners.keyup(key(' '));
    listeners.keydown({...key(' '), timeStamp:250});
    assert.equal(run('game.bombs'), 5);
    assert.equal(run('isFiring()'), true);
    listeners.keydown(key('f'));
    assert.equal(run('game.bombs'), 4);
    assert.equal(run('isFiring()'), true, 'F does not interrupt held fire');
    listeners.keydown({...key('f'), repeat:true});
    listeners.keydown(key('F'));
    assert.equal(run('game.bombs'), 4);
    listeners.keyup(key('F'));
    listeners.keydown(key('F'));
    assert.equal(run('game.bombs'), 3, 'uppercase F works');
    listeners.keyup(key('f'));
    run('game.over = true');
    listeners.keydown(key('f'));
    assert.equal(run('game.bombs'), 3, 'game over prevents use');
    listeners.keyup(key('f'));
    run('game.over = false; game.bombs = 0');
    listeners.keydown(key('f'));
    assert.equal(run('game.bombs'), 0);
});
test('double tap uses one bomb without breaking held fire; multitouch does not trigger', () => {
    run('game.bombs = 5');
    listeners.pointerdown({...pointer(1, 130), timeStamp:100});
    listeners.pointerdown({...pointer(2, 130), timeStamp:120});
    assert.equal(run('game.bombs'), 5);
    listeners.pointerup({...pointer(1, 130), timeStamp:150});
    listeners.lostpointercapture(pointer(1, 130));
    listeners.pointerdown({...pointer(1, 132), timeStamp:250});
    assert.equal(run('game.bombs'), 4);
    assert.equal(run('isFiring()'), true);
    listeners.pointerup({...pointer(1, 132), timeStamp:280});
    listeners.pointerdown({...pointer(1, 132), timeStamp:300});
    assert.equal(run('game.bombs'), 4, 'third tap does not reuse the first pair');
});
test('dragging, long holds, distant taps and cancellation cannot arm double tap', () => {
    for (const mode of ['drag', 'hold', 'distant', 'cancel']) {
        run('resetGame(); game.bombs = 5');
        listeners.pointerdown({...pointer(1, 130), timeStamp:100});
        if (mode === 'drag') listeners.pointermove({...pointer(1, 200), timeStamp:120});
        if (mode === 'cancel') listeners.pointercancel(pointer(1,130));
        else listeners.pointerup({...pointer(1,130), timeStamp: mode === 'hold' ? 500 : 150});
        listeners.pointerdown({...pointer(1,mode === 'distant' ? 250 : 130), timeStamp:mode === 'hold' ? 550 : 250});
        assert.equal(run('game.bombs'), 5, mode);
    }
});
test('restart clears new inventory, speed upgrades and partially entered bomb gestures', () => {
    pickup('speed'); pickup('bomb');
    listeners.keydown({...key(' '), timeStamp:100});
    run('game.over = true');
    listeners.keydown(key('Enter'));
    assert.equal(run('game.player.speedLevel'), 0);
    assert.equal(run('game.bombs'), 0);
    assert.equal(run('Object.keys(keysDown).length'), 0);
    assert.equal(run('lastTap'), null);
});
test('first two mastery ranks require fresh climbs to ten and persist across switches', () => {
    for (const type of ['normal', 'spread', 'laser']) {
        run('resetGame()');
        const other = type === 'normal' ? 'laser' : 'normal';
        if (type !== 'normal') pickup(type);
        for (let i = 0; i < 8; i++) pickup(type);
        assert.equal(run('game.weapon.level'), 9);
        assert.equal(run(`game.mastery.${type}`), 0);
        pickup(type);
        assert.equal(run(`game.mastery.${type}`), 1);
        for (let i = 0; i < 20; i++) pickup(type);
        for (const support of ['heart', 'speed', 'bomb']) pickup(support);
        pickup(type);
        assert.equal(run(`game.mastery.${type}`), 1, 'post-ten levels and support items cannot grant rank two');
        pickup(other);
        assert.equal(run(`game.mastery.${type}`), 1);
        pickup(type);
        assert.equal(run('game.weapon.level'), 1);
        for (let i = 0; i < 8; i++) pickup(type);
        assert.equal(run(`game.mastery.${type}`), 1, 'partial second climb does not count');
        pickup(type);
        assert.equal(run(`game.mastery.${type}`), 2);
        pickup(other); pickup(type);
        for (let i = 0; i < 12; i++) pickup(type);
        assert.equal(run(`game.mastery.${type}`), 2);
    }
});
test('thickness mastery affects spread and laser but never normal shells', () => {
    for (let rank = 0; rank <= 2; rank++) {
        run(`game.mastery.normal = ${rank}`);
        for (const type of ['normal', 'spread', 'laser']) {
            const expected = run(`WEAPONS.${type}.width[0]`) * (type === 'normal' ? 1 : 1 + 0.25 * rank);
            assert.equal(run(`attackWidth('${type}', 1)`), expected);
            if (type !== 'laser') {
                run(`game.weapon = {type:'${type}', level:1}; game.bullets = []; fireWeapon()`);
                assert.equal(run('game.bullets[0].w'), expected);
            } else {
                run('game.weapon = {type:"laser", level:1}');
                assert.equal(run('laserBeams()[0].width'), expected);
            }
        }
    }
});
test('split mastery gives one, two, three branches; rank one removes only the center shot', () => {
    for (let rank = 0; rank <= 2; rank++) {
        run(`game.mastery.spread = ${rank}`);
        for (const level of [1, 10]) {
            run(`game.weapon = {type:'normal', level:${level}}; game.bullets = []; fireWeapon()`);
            assert.equal(run('game.bullets.length'), 1 + rank);
            assert.equal(run('game.bullets[0].vx + game.bullets.at(-1).vx'), 0);
            assert.ok(Math.abs(run('Math.atan2(game.bullets.at(-1).vx, -game.bullets.at(-1).vy)') - (rank ? 0.22 : 0)) < 1e-10);
            if (rank === 1) assert.equal(run('game.bullets.some(bullet => bullet.vx === 0)'), false);
            run(`game.weapon.type = 'laser'`);
            assert.equal(run('laserBeams().length'), 1 + rank);
            assert.ok(Math.abs(run('Math.atan(laserBeams().at(-1).slope)') - (rank ? 0.22 : 0)) < 1e-10);
            run(`game.weapon.type = 'spread'; game.bullets = []; fireWeapon()`);
            assert.equal(run('game.bullets.length'), level + 2);
            assert.ok(Math.abs(run('Math.atan2(game.bullets.at(-1).vx, -game.bullets.at(-1).vy)') - (level + 1) / 2 * 0.13) < 1e-10);
        }
    }
});
test('branched laser hits side targets while gaps and below-tank targets remain safe', () => {
    run(`game.mastery.spread = 1; game.weapon.type = 'laser'; keysDown[' '] = true;
        for (const x of [70, 182, 294, 350]) Object.assign(spawnEnemy('boss'), {x, y:95, w:36, speed:0});
        update(STEP);`);
    for (const i of [0, 2]) assert.ok(run(`game.enemies[${i}].hp`) < 64);
    assert.equal(run('game.enemies[1].hp'), 64, 'rank one has no central beam');
    assert.equal(run('game.enemies[3].hp'), 64);
    assert.equal(run('laserBeams().some(beam => laserHits(beam, {x:180, y:680, w:40, h:10}))'), false);
    assert.equal(run('laserBeams().some(beam => laserHits(beam, {x:155, y:95, w:10, h:10}))'), false);
});
test('overlapping laser branches stack damage even before reflection mastery', () => {
    for (const rank of [1, 2]) {
        run(`resetGame(); game.enemyCooldown = 1e6;
            game.mastery = {normal:2, spread:${rank}, laser:2}; game.weapon.type = 'laser'; keysDown[' '] = true;
            Object.assign(spawnEnemy('boss'), {x:0, y:300, w:400, speed:0, hp:1000, maxHp:1000});`);
        advance(1);
        assert.ok(Math.abs(run('game.enemies[0].hp') - (1000 - 42 * (rank + 1))) < 1e-8);
        assert.equal(run('attackRate()'), 1);
    }
});
test('speed mastery increases actual normal/spread firing rate, preserving per-shot damage', () => {
    for (const type of ['normal', 'spread']) {
        const counts = [];
        for (let rank = 0; rank <= 2; rank++) {
            run(`resetGame(); game.enemyCooldown = 1e6; game.mastery.laser = ${rank};
                game.weapon.type = '${type}'; keysDown[' '] = true;`);
            advance(0.9);
            counts.push(run('game.bullets.length'));
            assert.equal(run('game.bullets[0].damage'), run(`WEAPONS.${type}.damage[0]`));
        }
        assert.ok(counts[1] > counts[0]);
        assert.ok(counts[2] > counts[1]);
    }
});
test('all mastery bonuses coexist but are cleared by a new game', () => {
    for (const type of ['normal', 'spread', 'laser', 'normal', 'spread', 'laser']) {
        pickup(type);
        for (let i = 0; i < 9; i++) pickup(type);
    }
    assert.equal(run('Object.values(game.mastery).join()'), '2,2,2');
    run('game.over = true');
    listeners.keydown(key('Enter'));
    assert.equal(run('Object.values(game.mastery).join()'), '0,0,0');
});
test('post-ten levels increase damage while projectile appearance and branching stay fixed', () => {
    for (const type of ['normal', 'spread']) {
        run(`resetGame(); game.weapon = {type:'${type}', level:10}; fireWeapon()`);
        const base = run('game.bullets[0]');
        const count = run('game.bullets.length');
        for (const level of [11, 20, 100]) {
            run(`game.weapon.level = ${level}; game.bullets = []; fireWeapon()`);
            const upgraded = run('game.bullets[0]');
            assert.equal(run('game.bullets.length'), count);
            for (const property of ['w', 'h', 'vx', 'vy', 'color', 'glow']) assert.equal(upgraded[property], base[property]);
            assert.ok(Math.abs(upgraded.damage / base.damage - (1 + (level - 10) * 0.05)) < 1e-10);
        }
    }
});
test('post-ten laser retains its beam geometry but deals increased continuous damage', () => {
    run(`game.weapon = {type:'laser', level:10}; globalThis.baseBeams = JSON.stringify(laserBeams());
        game.weapon.level = 20; keysDown[' '] = true;
        Object.assign(spawnEnemy('boss'), {x:180, y:100, speed:0, hp:10000, maxHp:10000});`);
    assert.equal(run('JSON.stringify(laserBeams())'), run('baseBeams'));
    advance(1);
    assert.ok(Math.abs(run('game.enemies[0].hp') - (10000 - 490 * 1.5)) < 1e-8);
});
test('third mastery requires switching after rank two then a fresh climb to twenty', () => {
    for (const type of ['normal', 'spread', 'laser']) {
        run(`resetGame(); game.weapon = {type:'${type}', level:9}`);
        pickup(type);
        const other = type === 'normal' ? 'spread' : 'normal';
        pickup(other); pickup(type);
        for (let i = 1; i < 10; i++) pickup(type);
        assert.equal(run(`game.mastery.${type}`), 2);
        for (let i = 10; i < 25; i++) pickup(type);
        assert.equal(run(`game.mastery.${type}`), 2);
        pickup(other); pickup(type);
        for (let i = 1; i < 19; i++) pickup(type);
        assert.equal(run(`game.mastery.${type}`), 2);
        pickup(type);
        assert.equal(run(`game.mastery.${type}`), 3);
        pickup(other); pickup(type);
        for (let i = 1; i < 25; i++) pickup(type);
        assert.equal(run(`game.mastery.${type}`), 3);
    }
});

test('companion uses half the equipped level and receives no mastery bonuses', () => {
    run('game.mastery = {normal:3, spread:3, laser:3}');
    for (const type of ['normal', 'spread', 'laser']) {
        for (const level of [1, 2, 9, 20, 43]) {
            run(`game.weapon = {type:'${type}', level:${level}}; game.bullets = []; fireWeapon(true)`);
            assert.equal(run('game.bullets.length'), level === 1 ? 0 : 1);
            if (level === 1) continue;
            const bullet = run('game.bullets[0]');
            assert.equal(bullet.damage, run(`attackDamage('normal', ${Math.floor(level / 2)})`));
            assert.equal(bullet.w, run(`WEAPONS.normal.width[${Math.min(10, Math.floor(level / 2)) - 1}]`));
            assert.equal(bullet.vx, 0);
            assert.equal(bullet.reflects, false);
        }
    }
});

test('companion follows and fires with base cadence even while laser is equipped', () => {
    run(`game.mastery = {normal:3, spread:3, laser:3}; game.weapon = {type:'laser', level:20};
        keysDown[' '] = true; keysDown.ArrowRight = true; update(STEP)`);
    assert.ok(run('game.companion.x') > 126);
    assert.equal(run('game.bullets.filter(b => b.companion).length'), 1);
    assert.equal(run('game.companion.cooldown'), run('FIRE_INTERVAL'));
    advance(0.1);
    assert.equal(run('game.bullets.filter(b => b.companion).length'), 1);
    advance(0.1);
    assert.equal(run('game.bullets.filter(b => b.companion).length'), 2);
});

test('third ranks retain the second-rank width rate and branch limits', () => {
    run('game.mastery = {normal:3, spread:3, laser:3}');
    assert.equal(run("attackWidth('spread', 1)"), 6);
    assert.equal(run("attackWidth('normal', 1)"), 7);
    assert.equal(run('attackRate()'), 1.4);
    assert.equal(run("shotCount('normal', 20)"), 3);
    run("game.weapon.type = 'laser'");
    assert.equal(run('attackRate()'), 1);
});

test('split projectiles reflect inward at both side walls without changing damage', () => {
    for (const type of ['normal', 'spread']) {
        for (const side of ['left', 'right']) {
            run(`game.mastery.spread = 3; game.weapon = {type:'${type}', level:10}; game.bullets = []; fireWeapon();
                game.bullets = [game.bullets[${side === 'left' ? '0' : 'game.bullets.length - 1'}]];
                game.bullets[0].x = ${side === 'left' ? '0' : '400 - game.bullets[0].w'};`);
            const before = run('({...game.bullets[0]})');
            run('update(STEP)');
            const after = run('game.bullets[0]');
            assert.equal(after.vx, -before.vx);
            assert.equal(after.vy, before.vy);
            assert.equal(after.damage, before.damage);
            assert.ok(after.x >= 0 && after.x + after.w <= 400);
        }
    }
});

test('reflected laser reaches inward targets and counts each ray only once at its joint', () => {
    run(`game.mastery.spread = 3; game.weapon.type = 'laser'; game.player.x = 0;
        globalThis.segments = laserBeams().filter(b => b.ray === 0);`);
    assert.equal(run('segments.length'), 2);
    assert.equal(run('segments[0].endY'), run('segments[1].y'));
    assert.equal(run('segments[1].x'), 0);
    assert.equal(run('segments[0].slope'), -run('segments[1].slope'));
    assert.equal(run('laserHits(segments[1], {x:76, y:100, w:10, h:10})'), true);
    run(`keysDown[' '] = true; Object.assign(spawnEnemy('boss'),
        {x:0, y:segments[1].y - 5, w:5, h:10, speed:0, hp:1000}); update(STEP)`);
    assert.ok(Math.abs(run('game.enemies[0].hp') - (1000 - 42 / 120)) < 1e-8);
});

test('shield charges in ten seconds, absorbs a hit and recharges without stacking', () => {
    run("game.mastery.laser = 3; game.weapon.type = 'laser'");
    advance(9.9);
    assert.equal(run('game.shield.active'), false);
    advance(0.1);
    assert.equal(run('game.shield.active'), true);
    advance(12);
    run('damagePlayer()');
    assert.equal(run('game.player.hp'), 2);
    assert.equal(run('game.shield.active'), false);
    run('damagePlayer()');
    assert.equal(run('game.player.hp'), 2);
    advance(9.9);
    assert.equal(run('game.shield.active'), false);
    advance(0.1);
    assert.equal(run('game.shield.active'), true);
    run('damagePlayer(true)');
    assert.equal(run('game.player.hp'), 1);
    assert.equal(run('game.shield.active'), true);
});

test('enemy contact destroys enemy and consumes either one heart or the shield', () => {
    for (const shield of [false, true]) {
        run(`resetGame(); game.enemyCooldown = 1e6; game.shield.active = ${shield};
            Object.assign(spawnEnemy('normal'), {x:180, y:630, speed:0}); update(STEP)`);
        assert.equal(run('game.enemies.length'), 0);
        assert.equal(run('game.player.hp'), shield ? 2 : 1);
        assert.equal(run('game.shield.active'), false);
    }
});

test('shield consumes an incoming arrow without losing a heart', () => {
    run(`game.mastery.laser = 3; game.shield.active = true;
        game.arrows.push({x:196, y:620, w:8, h:26}); update(STEP)`);
    assert.equal(run('game.arrows.length'), 0);
    assert.equal(run('game.player.hp'), 2);
    assert.equal(run('game.shield.active'), false);
    assert.equal(run('game.shield.cooldown'), 10);
});

test('new game clears third-rank abilities and unlock eligibility', () => {
    run(`game.mastery = {normal:3, spread:3, laser:3}; game.shield.active = true;
        game.thirdMasteryReady.normal = true; resetGame()`);
    assert.equal(run('Object.values(game.mastery).join()'), '0,0,0');
    assert.equal(run('Object.values(game.thirdMasteryReady).some(Boolean)'), false);
    assert.equal(run('game.shield.active'), false);
    assert.equal(run('game.shield.cooldown'), 10);
    assert.equal(run('game.companion.cooldown'), 0);
});
test('difficulty changes linearly until stage one hundred then stays capped', () => {
    const cases = [
        ["enemyStats('normal').speed", 100, 200],
        ["enemyStats('archer').speed", 65, 170],
        ["enemyStats('boss').speed", 60, 150],
        ['enemyInterval()', 0.9, 0.25],
        ['bossInterval()', 5, 2, 4],
        ['archerChance()', 0.215, 0.4],
        ['arrowInterval()', 3.72, 1.2],
        ['arrowSpeed()', 252, 500],
    ];
    for (const [expression, initial, at100, start = 1] of cases) {
        let previous = initial;
        for (let stage = 1; stage <= 101; stage++) {
            run(`game.stage = ${stage}`);
            const actual = run(expression);
            assert.ok((actual - previous) * Math.sign(at100 - initial) >= -1e-10, expression);
            previous = actual;
            if (stage <= start) assert.equal(actual, initial);
            else if (stage <= 100) assert.ok(Math.abs(actual - run(`game.stage--; ${expression}`) - (at100 - initial) / (100 - start)) < 1e-10, `${expression} at ${stage}`);
            else assert.ok(Math.abs(actual - at100) < 1e-10);
        }
        run('game.stage = 500');
        assert.ok(Math.abs(run(expression) - at100) < 1e-10);
    }
});

test('late-stage spawn timers and arrow movement use the new difficulty limits', () => {
    run(`game.stage = 100; Math.random = () => 0.39;
        game.enemyCooldown = 0; game.bossCooldown = 0; update(STEP)`);
    assert.equal(run('game.enemies.map(e => e.type).join()'), 'archer,boss');
    assert.equal(run('game.enemies[0].speed'), 167.8);
    assert.equal(run('game.enemies[1].speed'), 147.8);
    assert.ok(Math.abs(run('game.enemyCooldown + STEP') - 0.25) < 1e-10);
    assert.ok(Math.abs(run('game.bossCooldown + STEP') - 2) < 1e-10);
    run(`Object.assign(game.enemies[0], {y:100, speed:0, shootCooldown:0}); update(STEP)`);
    assert.ok(Math.abs(run('game.enemies[0].shootCooldown') - 1.2) < 1e-10);
    assert.ok(Math.abs(run('game.arrows[0].y') - (138 + 500 / 120)) < 1e-10);
});
test('enemy speed varies by up to ten around its stage base and stays fixed after spawning', () => {
    for (const stage of [1, 30, 100, 200]) {
        for (const type of ['normal', 'archer', 'boss']) {
            for (const roll of [0, 0.5, 0.999999]) {
                run(`game.stage = ${stage}; Math.random = () => ${roll}; game.enemies = []; spawnEnemy('${type}')`);
                const speed = run('game.enemies[0].speed');
                assert.ok(Math.abs(speed - run(`enemyStats('${type}').speed`) - (roll * 20 - 10)) < 1e-10);
                run('game.stage++; update(STEP)');
                assert.equal(run('game.enemies[0].speed'), speed);
            }
        }
    }
});

test('heart and bomb each allow one active drop and can drop again after removal', () => {
    for (const type of ['heart', 'bomb']) {
        run(`game.items = []; addItem('${type}', 0, -50); addItem('${type}', 100, 100)`);
        assert.equal(run('game.items.length'), 1);
        run(`game.items[0].y = 701; update(STEP); addItem('${type}', 0, 100)`);
        assert.equal(run('game.items.length'), 1);
        run(`game.items[0].x = game.player.x; game.items[0].y = game.player.y; update(STEP)`);
        assert.equal(run('game.items.length'), 0);
        run(`addItem('${type}', 0, 100)`);
        assert.equal(run('game.items.length'), 1);
    }
    run(`game.items = []; Math.random = () => 0;
        for (let i = 0; i < 3; i++) dropItems({type:'normal', x:100, y:100, w:36})`);
    assert.equal(run("game.items.filter(i => i.type === 'heart').length"), 1);
    assert.equal(run("game.items.filter(i => i.type === 'bomb').length"), 1);
    assert.equal(run("game.items.filter(i => i.type === 'normal').length"), 3);
    assert.equal(run("game.items.filter(i => i.type === 'speed').length"), 3);
});

test('smaller tank avoids items beyond its new edge and fires from its center', () => {
    assert.equal(run('game.player.w'), 61);
    assert.equal(run('game.player.h'), 61);
    run(`addItem('normal', game.player.x + 62, game.player.y); update(STEP)`);
    assert.equal(run('game.weapon.level'), 1);
    run('game.items[0].x = game.player.x + 60; update(STEP)');
    assert.equal(run('game.weapon.level'), 2);
    run('game.bullets = []; fireWeapon()');
    assert.equal(run('game.bullets[0].x + game.bullets[0].w / 2'), run('game.player.x + game.player.w / 2'));
});
test('normal and laser widths grow linearly to seventy percent of their old maximum', () => {
    for (const [type, first, last] of [['normal', 7, 54.6], ['laser', 6, 60.2]]) {
        run('game.mastery.normal = 0');
        const widths = Array.from(run(`WEAPONS.${type}.width`));
        assert.equal(widths[0], first);
        assert.ok(Math.abs(widths[9] - last) < 1e-10);
        for (let i = 1; i < 10; i++) assert.ok(Math.abs(widths[i] - widths[i - 1] - (last - first) / 9) < 1e-10);
        assert.ok(Math.abs(run(`attackWidth('${type}', 20)`) - last) < 1e-10);
    }
});
test('frame rates from four to 144 fps advance the same simulation time and enemy distance', () => {
    for (const fps of [4, 5, 10, 30, 60, 120, 144]) {
        run(`resetGame(); game.enemyCooldown = 1e6; game.bossCooldown = 1e6;
            Math.random = () => 0.5; Object.assign(spawnEnemy('normal'), {x:0, y:0}); advanceFrame(0)`);
        for (let frame = 1; frame <= fps; frame++) run(`advanceFrame(${frame * 1000 / fps})`);
        assert.ok(Math.abs(run('game.time') - 1) < 1e-8, `${fps}fps elapsed time`);
        assert.ok(Math.abs(run('game.enemies[0].y') - 100) < 1e-8, `${fps}fps distance`);
    }
});

test('hidden tab and long stalls do not cause unlimited catch-up', () => {
    run('advanceFrame(0); advanceFrame(10000)');
    assert.ok(Math.abs(run('game.time') - 0.25) < 1e-8);
    run('document.hidden = true; advanceFrame(20000); document.hidden = false; advanceFrame(30000)');
    assert.ok(Math.abs(run('game.time') - 0.25) < 1e-8);
});
console.log(`\n${passed} logic checks passed (no screen validation).`);

