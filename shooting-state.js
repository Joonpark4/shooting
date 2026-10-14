// 설정, 공유 상태, 스테이지별 난이도. index.html의 스크립트 순서를 유지한다.
const canvas = document.createElement("canvas");
canvas.width = 400;
canvas.height = 700;
canvas.setAttribute("aria-label", "오크 슈팅 게임. 방향키로 이동, 스페이스를 누르는 동안 공격. 모바일은 터치한 채 좌우 이동.");
const ctx = canvas.getContext("2d");
document.body.appendChild(canvas);

// 전투 수치는 여기에서 조정한다. 레이저 피해는 초당 피해량이다.
const WEAPONS = {
    normal: { name: "일반 포탄", icon: "C", color: "#ffd76b", damage: [16, 30, 50, 80, 110, 145, 185, 230, 280, 340], width: Array.from({ length: 10 }, (_, i) => 7 + (78 * 0.7 - 7) * i / 9) },
    // 전탄을 맞혀도 같은 단계의 일반 포탄보다 약하게: 갈래는 범위 공격에 집중한다.
    spread: { name: "갈래 포탄", icon: "S", color: "#8df49e", damage: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22], width: [4, 4.3, 4.6, 4.9, 5.2, 5.5, 5.8, 6.1, 6.4, 6.7] },
    laser: { name: "레이저 포", icon: "L", color: "#71dbff", damage: [42, 70, 105, 145, 190, 240, 295, 355, 420, 490], width: Array.from({ length: 10 }, (_, i) => 6 + (86 * 0.7 - 6) * i / 9) },
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
    normal: { hp: 8, speed: 100, maxSpeed: 200, size: 36, score: 1 },
    archer: { hp: 12, speed: 65, maxSpeed: 170, size: 38, score: 2 },
    boss: { hp: 64, speed: 60, maxSpeed: 150, size: 60, score: 3 },
};
const HEART_DROP_RATE = 0.005;
const MAX_HEARTS = 5;
const FIRE_INTERVAL = 0.18;
const PLAYER_SPEED = 360;
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

// 기존 30스테이지 난이도에 40에서 도달하고, 100까지 선형으로 강화한다.
function stageValue(initial, at40, at100, startStage = 1) {
    if (game.stage <= 40) {
        const progress = Math.max(0, (game.stage - startStage) / (40 - startStage));
        return initial + (at40 - initial) * progress;
    }
    return at40 + (at100 - at40) * Math.min(1, (game.stage - 40) / 60);
}

function enemyInterval() { return stageValue(0.9, 0.34, 0.25); }
function bossInterval() { return stageValue(5, 2.8, 2, 4); }
function archerChance() { return stageValue(0.215, 0.4, 0.4); }
function arrowInterval() { return stageValue(3.72, 1.8, 1.2); }
function arrowSpeed() { return stageValue(252, 370, 500); }

function enemyStats(type) {
    const base = ENEMIES[type];
    return {
        // 1~9스테이지는 고정, 10부터 직전 스테이지 체력의 1.3%씩 복리 증가.
        hp: base.hp * 1.013 ** Math.max(0, game.stage - 9),
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

