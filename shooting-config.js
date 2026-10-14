// 밸런스 설정 전용. 다른 게임 스크립트보다 먼저 로드한다.
const TEST_MODE = false; // true: 무기 아이템 하나를 5개 연속 획득한 것처럼 적용
// 레벨별 배열은 1~10레벨 순서. 레이저 피해는 초당 피해량이다.
// 일반/레이저 너비는 1레벨부터 기존 10레벨 너비의 70%까지 선형 증가한다.
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
// 영구 갈래 보너스: 미획득 / 1단계(전체 60도) / 2·3단계(전체 70도).
const BONUS_BRANCH_ANGLES = [
    [0],
    [-30, 0, 30],
    [-35, -35 / 3, 35 / 3, 35],
].map(angles => angles.map(degrees => degrees * Math.PI / 180));
const ENEMIES = {
    normal: { hp: 8, speed: 100, midSpeed: 160, maxSpeed: 190, size: 36, score: 1 },
    archer: { hp: 12, speed: 65, midSpeed: 115, maxSpeed: 160, size: 38, score: 2 },
    boss: { hp: 64, speed: 60, midSpeed: 108, maxSpeed: 140, size: 60, score: 3 },
};
const HEART_DROP_RATE = 0.005;
const MAX_HEARTS = 5;
const FIRE_INTERVAL = 0.18;
const PLAYER_SPEED = 360;
const STEP = 1 / 120;

// 단위: 속도 px/초, 시간 초, 확률 0~1, 각도 라디안.
// 배열 순서: [초기, middle 스테이지, maximum 스테이지].
const STAGE_CONFIG = {
    middle: 40, maximum: 100, bossStart: 4, killsPerStage: 10,
    hpStart: 10, hpGrowth: 0.012, // 10부터 매 스테이지 체력 +1.3% 복리
};
const SPAWN_CONFIG = {
    enemyInterval: [0.9, 0.34, 0.25],
    bossInterval: [5, 2.8, 2], // 초기값은 보스 등장 스테이지 기준
    archerChance: [0.215, 0.4, 0.4],
    initialEnemyDelay: 0.8,
};
const ENEMY_SPEED_VARIATION = 10; // 각 적의 스테이지 기본 속도에 ±10
const ARCHER_CONFIG = {
    shotInterval: [3.72, 1.8, 1.2], arrowSpeed: [252, 370, 500],
    firstShotMin: 2.6, firstShotMax: 4, fireMinY: 50,
};
const PLAYER_CONFIG = {
    width: 61, height: 61, startY: 610, initialHearts: 2,
    speedPerItem: 0.03, invulnerability: 1.2,
};
const DROP_RATES = { weapon: 0.15, bossWeapon: 1 / 3, speed: 0.03, bomb: 0.015 };
const ITEM_FALL_SPEED = 110;
const PROJECTILE_SPEED = 600;
const SPREAD_CONFIG = { initialCount: 3, angle: 0.13 };
const MASTERY_CONFIG = {
    thirdLevel: 20, widthPerRank: 0.25, ratePerRank: 0.2,
    shieldCooldown: 10, companionLevelRatio: 0.5,
};
const BOMB_CONFIG = { damage: 200, damagePerStage: 20 };
