// 공유 상태와 스테이지 계산. 밸런스 수치는 shooting-config.js에서 관리한다.
const canvas = document.createElement("canvas");
canvas.width = 400;
canvas.height = 700;
canvas.setAttribute("aria-label", "오크 슈팅 게임. 방향키로 이동, 스페이스를 누르는 동안 공격. 모바일은 터치한 채 좌우 이동.");
const ctx = canvas.getContext("2d");
document.body.appendChild(canvas);

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
        player: { x: (canvas.width - PLAYER_CONFIG.width) / 2, y: PLAYER_CONFIG.startY, w: PLAYER_CONFIG.width, h: PLAYER_CONFIG.height,
            hp: PLAYER_CONFIG.initialHearts, maxHp: PLAYER_CONFIG.initialHearts, invulnerable: 0, speedLevel: 0 },
        bombs: 0, bombFlash: 0,
        weapon: { type: "normal", level: 1 },
        mastery: { normal: 0, spread: 0, laser: 0 },
        thirdMasteryReady: { normal: false, spread: false, laser: false },
        companion: { x: 126, y: 628, cooldown: 0 },
        shield: { active: false, cooldown: MASTERY_CONFIG.shieldCooldown },
        bullets: [], enemies: [], arrows: [], items: [], particles: [],
        fireCooldown: 0, enemyCooldown: SPAWN_CONFIG.initialEnemyDelay, bossCooldown: SPAWN_CONFIG.bossInterval[0],
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

// 설정된 초기·중간·최종 스테이지 사이를 선형으로 계산한다.
function stageValue(initial, middle, maximum, startStage = 1) {
    if (game.stage <= STAGE_CONFIG.middle) {
        const progress = Math.max(0, (game.stage - startStage) / (STAGE_CONFIG.middle - startStage));
        return initial + (middle - initial) * progress;
    }
    return middle + (maximum - middle) * Math.min(1, (game.stage - STAGE_CONFIG.middle) / (STAGE_CONFIG.maximum - STAGE_CONFIG.middle));
}

function enemyInterval() { return stageValue(...SPAWN_CONFIG.enemyInterval); }
function bossInterval() { return stageValue(...SPAWN_CONFIG.bossInterval, STAGE_CONFIG.bossStart); }
function archerChance() { return stageValue(...SPAWN_CONFIG.archerChance); }
function arrowInterval() { return stageValue(...ARCHER_CONFIG.shotInterval); }
function arrowSpeed() { return stageValue(...ARCHER_CONFIG.arrowSpeed); }

function enemyStats(type) {
    const base = ENEMIES[type];
    return {
        hp: base.hp * (1 + STAGE_CONFIG.hpGrowth) ** Math.max(0, game.stage - STAGE_CONFIG.hpStart + 1),
        speed: stageValue(base.speed, base.midSpeed, base.maxSpeed),
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

