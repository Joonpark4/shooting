let canvas;
let ctx;
// 캔버스 만들기
canvas = document.createElement("canvas");
// 2D 환경을 구성하기
ctx = canvas.getContext("2d");
// 캔버스 크기 (픽셀값)
canvas.width = 400;
canvas.height = 700;
// 캔버스를 바디에 붙이기
document.body.appendChild(canvas);

let backgroundImg, tankImg, bulletImg, enemyImg, gameoverImg, bossImg;
let gameover = false // true면 게임 끝
let score = 0; // 점수

let createEnemySpeedFirst = 800; // 적군의 생산 초기 속도
let createEnemySpeed = 800; // 적군의 현재 생산 속도
let createEnemySpeedUp = 50; // 레벨업시 적군 생산 속도 증가량
let enemyInterval = null; // 적군 생산속도 업데이트시 필요

let enemySpeedFirst = 2.5;  // 적군의 전진 초기 속도
let enemySpeed = 2.5; // 적군의 현재 전진 속도
let enemySpeedUp = 0.2; // 레벨업시 적군 전진 속도 증가량
let enemyHp = 1; // 적군의 체력

let createBossSpeedFirst = 5000; // 보스의 생산 초기 속도
let createBossSpeed = 5000; // 보스의 현재 생산 속도
let createBossSpeedUp = 200; // 레벨업시 보스 생산 속도 증가량
let bossInterval = null; // 보스 생산속도 업데이트시 필요

let bossSpeedFirst = 1.5;  // 보스의 전진 초기 속도
let bossSpeed = 1.5; // 보스의 현재 전진 속도
let bossSpeedUp = 0.15; // 레벨업시 보스 전진 속도 증가량
let bossHp = 3; // 보스의 체력

let tankSpeed = 6; // 탱크의 이동 속도
let level = 0; // 레벨
let lev = 0; // 레벨업할때 필요, 10킬 마다 1업씩

// 탱크의 좌표
let tankX = canvas.width / 2 - 32;
let tankY = canvas.height - 90;
let dot = true;
let touchPointer = null;
let lastTouchShot = 0;
let touchUsed = false;

// 총알을 생성하고, 초기값을 준다
let bulletList = []; // 총알을 저장하는 리스트
function Bullet() {
    this.x = 0;
    this.y = 0;
    this.init = function () {
        // x좌표는 탱크와 같지만, 이미지 크기로 인해 17픽셀 조정
        this.x = tankX + 17;
        // y좌표는 탱크와 같게
        this.y = tankY;
        this.alive = true // true면 살아있는 총알, false면 죽은 총알
        // 불렛리스트(배열)에 값을 집어넣기
        bulletList.push(this);
    } // 총알의 좌표를 -10만큼 감소 (발사)
    this.update = function () {
        this.y -= 8;
    }
    this.checkHit = function () {
        for (var i = 0; i < enemyList.length; i++) {
            if (this.y <= enemyList[i].y && this.x >= enemyList[i].x - 17 && this.x <= enemyList[i].x + 28) {
                this.alive = false; // 죽은 총알
                if (enemyList[i].hp == 1) { // hp 값이 0이면?
                    enemyList.splice(i, 1); // 적군 죽이기
                    score++;
                    lev++;
                    if (lev >= 10) {
                        level++;
                        lev = 0;
                        cal_level();
                    }
                } else {
                    enemyList[i].hp -= 1;
                }
            }
        }
        for (var i = 0; i < bossList.length; i++) {
            if (this.y <= bossList[i].y && this.x >= bossList[i].x - 20 && this.x <= bossList[i].x + 30) {
                this.alive = false; // 죽은 총알
                if (bossList[i].hp == 1) { // hp 값이 0이면?
                    bossList.splice(i, 1); // 적군 죽이기
                    score = score + 3;
                    lev++;
                    if (lev >= 10) {
                        level++;
                        lev = 0;
                        cal_level();
                    }
                } else {
                    bossList[i].hp -= 1;
                }
            }
        }
        if (this.y <= 10) {
            this.alive = false; // 죽은 총알
        }
    }
}

// 레벨업 할때 계산할 것들
function cal_level() {
    enemySpeed = parseFloat(enemySpeedFirst) + parseFloat(level * enemySpeedUp); // 적군의 전진 속도는 레벨에 비례해 증가
    if (createEnemySpeed > 100) { // 적군의 생산속도는 100 이하로 떨어지지 않음
        if (level <= 7) // 레벨이 7이하일때는 적군의 생산속도가 빨라짐
            createEnemySpeed = parseFloat(createEnemySpeedFirst) - parseFloat(level * createEnemySpeedUp); // 적군의 생산 속도는 레벨에 비례해 증가
        if (level > 7) { // 레벨이 8이상일때는 오히려 적군의 생산속도가 느려짐
            if (createEnemySpeed < 1200) // 그래도 1000 이상은 좀...
                createEnemySpeed = parseFloat(createEnemySpeed) + parseFloat((level * createEnemySpeedUp) / 8); // 적군의 생산 속도는 레벨에 비례해 증가
        }
    }
    bossSpeed = parseFloat(bossSpeedFirst) + parseFloat(level * bossSpeedUp); // 보스의 전진 속도는 레벨에 비례해 증가
    if (createBossSpeed > 800) // 보스의 생산 속도는 800 이하로 떨어지지 않음
        createBossSpeed = parseFloat(createBossSpeedFirst) - parseFloat(level * createBossSpeedUp); // 보스의 생산 속도는 레벨에 비례해 증가
    console.log(`적군의 진군 속도 : ${enemySpeed} = ${enemySpeedFirst} + ${level} * ${enemySpeedUp}`);
    console.log(`적군의 생산 속도 : ${createEnemySpeed} = ${createEnemySpeedFirst} + ${level} * ${createEnemySpeedUp}`);
    createEnemy(); // 함수를 다시 호출해서 적군 생산 속도를 업데이트
    createBoss(); // 함수를 다시 호출해서 보스 생산 속도를 업데이트

    // 아래는 HTML 텍스트박스들 최신화
    let enemyspeed_box = document.querySelector("#EnemySpeedBox");
    enemyspeed_box.value = enemySpeed;
    let enemycreationspeed_box = document.querySelector("#EnemyCreationSpeedBox");
    enemycreationspeed_box.value = createEnemySpeed;
    let bossspeed_box = document.querySelector("#BossSpeedBox");
    bossspeed_box.value = bossSpeed;
    let bosscreationspeed_box = document.querySelector("#BossCreationSpeedBox");
    bosscreationspeed_box.value = createBossSpeed;
}

function generateRandomValue(min, max) {
    // 최소값과 최대값 사이의 랜덤 값을 뽑는 공식, 구글링 ㄱㄱ
    let randomNum = Math.floor(Math.random() * (max - min + 1)) + min;
    return randomNum;
}

// 적군의 정보
let enemyList = []; // 적군을 저장하는 리스트
function enemy() {
    this.x = 0;
    this.y = 0;
    this.hp = enemyHp;
    this.init = function () {
        this.y = 0;
        this.x = generateRandomValue(0, canvas.width - 32);
        this.hp = enemyHp;
        enemyList.push(this);
    }
    this.update = function () {
        this.y += enemySpeed // 적군의 속도

        if (this.y >= canvas.height - 32) {
            gameover = true;
        }
    }
}

// 보스의 정보
let bossList = []; // 보스를 저장하는 리스트
function boss() {
    this.x = 0;
    this.y = 0;
    this.hp = bossHp;
    this.init = function () {
        this.y = 0;
        this.x = generateRandomValue(0, canvas.width - 45);
        this.hp = bossHp;
        bossList.push(this);
    }
    this.update = function () {
        this.y += bossSpeed // 보스의 속도

        if (this.y >= canvas.height - 45) {
            gameover = true;
        }
    }
}

function loadImage() {
    backgroundImg = new Image();
    backgroundImg.src = "background.jpg"

    tankImg = new Image();
    tankImg.src = "tank.png"

    bulletImg = new Image();
    bulletImg.src = "bullet.png"

    enemyImg = new Image();
    enemyImg.src = "orc.png"

    gameoverImg = new Image();
    gameoverImg.src = "gameover.png"

    bossImg = new Image();
    bossImg.src = "boss.png"
}

let keysDown = {}
function setupKeyboardListener() {
    document.addEventListener("keydown", function (event) {
        keysDown[event.key] = true
    });
    document.addEventListener("keyup", function (event) {
        delete keysDown[event.key];
        if (dot) {
            if (event.key == " ") {
                createBullet();
            }
        }
    });
}

function createBullet() {
    let b = new Bullet();
    b.init();
}

// 화면에 표시된 캔버스 크기를 게임 좌표로 환산한다.
function moveTouchTank(event) {
    const bounds = canvas.getBoundingClientRect();
    tankX = Math.max(0, Math.min(canvas.width - 64,
        (event.clientX - bounds.left) * canvas.width / bounds.width - 32));
}

canvas.addEventListener("pointerdown", function (event) {
    if (event.pointerType === "mouse" || touchPointer !== null) return;
    if (gameover) {
        window.location.reload();
        return;
    }
    touchPointer = event.pointerId;
    touchUsed = true;
    canvas.setPointerCapture(event.pointerId);
    moveTouchTank(event);
    createBullet();
    lastTouchShot = performance.now();
});

canvas.addEventListener("pointermove", function (event) {
    if (event.pointerId === touchPointer && !gameover) moveTouchTank(event);
});

function stopTouch(event) {
    if (event.pointerId === touchPointer) touchPointer = null;
}
canvas.addEventListener("pointerup", stopTouch);
canvas.addEventListener("pointercancel", stopTouch);
canvas.addEventListener("lostpointercapture", stopTouch);
window.addEventListener("blur", function () {
    touchPointer = null;
    keysDown = {};
});

// 적군의 생성
// function createEnemy(){
//     const interval = setInterval(function(){
//         let e = new enemy();
//         e.init();
//     },createEnemySpeed)
// }

// 적군의 생성, 다만 레벨에 따라 업데이트 됨
function createEnemy() {
    clearInterval(enemyInterval);
    enemyInterval = setInterval(function () {
        let e = new enemy();
        e.init();
    }, createEnemySpeed);
    console.log(`Enemy interval started with duration: ${createEnemySpeed}`);
}

// 보스의 생성, 다만 레벨에 따라 업데이트 됨
function createBoss() {
    if (level > 2) {
        clearInterval(bossInterval);
        bossInterval = setInterval(function () {
            let e = new boss();
            e.init();
        }, createBossSpeed);
        console.log(`Enemy interval started with duration: ${createBossSpeed}`);
    }
}


function update() {
    if (touchPointer !== null && performance.now() - lastTouchShot >= 150) {
        createBullet();
        lastTouchShot = performance.now();
    }
    if ("ArrowRight" in keysDown) {
        if (tankX <= 400 - 64)
            tankX += tankSpeed; // 탱크 속도
        // x좌표가 전체너비-탱크너비보다 작을때만 오른쪽 키가 눌릴때 tankSpeed만큼 x좌표 증가
    }
    if ("ArrowLeft" in keysDown) {
        if (tankX >= 0)
            tankX -= tankSpeed; // 탱크 속도
        // x좌표가 0보다 클때만 왼쪽 키가 눌릴때 tankSpeed만큼 x좌표 감소
    }

    // 총알의 y좌표 업데이트 함수 호출
    for (var i = 0; i < bulletList.length; i++) {
        if (bulletList[i].alive) {
            bulletList[i].update();
            bulletList[i].checkHit();
        }
    }

    // 적군의 y좌표 업데이트 함수 호출
    for (var i = 0; i < enemyList.length; i++) {
        enemyList[i].update();
    }

    // 보스의 y좌표 업데이트 함수 호출
    for (var i = 0; i < bossList.length; i++) {
        bossList[i].update();
    }
    if (dot == false) {
        createBullet();
    }
}

function render() {
    ctx.drawImage(backgroundImg, 0, 0, canvas.width, canvas.height);
    ctx.drawImage(tankImg, tankX, tankY);
    ctx.fillStyle = "white";
    ctx.font = "25px Arial"
    ctx.fillText(`Score:${score}`, 20, 30);
    ctx.fillText(`Level:${level + 1}`, 300, 30); // 레벨은 내부 연산에서 0부터 시작하지만 보여줄땐 1부터 시작하도록 보여준다
    if (!touchUsed && window.matchMedia("(max-width: 768px), (pointer: coarse)").matches) {
        ctx.font = "16px Arial";
        ctx.fillText("터치한 채 좌우로 이동 · 누르는 동안 발사", 55, 680);
    }
    for (var i = 0; i < bulletList.length; i++) {
        if (bulletList[i].alive) {
            ctx.drawImage(bulletImg, bulletList[i].x, bulletList[i].y);
        }
    }
    for (var i = 0; i < enemyList.length; i++) {
        ctx.drawImage(enemyImg, enemyList[i].x, enemyList[i].y);
    }
    for (var i = 0; i < bossList.length; i++) {
        ctx.drawImage(bossImg, bossList[i].x, bossList[i].y);
    }
}

function main() {
    if (!gameover) {
        // 게임오버가 아닐경우 아래 함수를 호출
        update();
        render();
        // 렌더는 프레임처럼 계속 반복해서 보여준다
        // console.log("animation calls main function");
        requestAnimationFrame(main);

    } else {
        ctx.drawImage(gameoverImg, 10, 140, 380, 380);
        if (window.matchMedia("(max-width: 768px), (pointer: coarse)").matches) {
            ctx.fillStyle = "white";
            ctx.font = "20px Arial";
            ctx.fillText("터치하여 다시 시작", 115, 550);
        }
    }
}

loadImage();
setupKeyboardListener();
main();
createEnemy();
createBoss();

// 초기 HTML 텍스트박스에 값 넣기
let enemyspeed_box = document.querySelector("#EnemySpeedBox");
enemyspeed_box.value = enemySpeed;
let enemycreationspeed_box = document.querySelector("#EnemyCreationSpeedBox");
enemycreationspeed_box.value = createEnemySpeed;
let bossspeed_box = document.querySelector("#BossSpeedBox");
bossspeed_box.value = bossSpeed;
let bosscreationspeed_box = document.querySelector("#BossCreationSpeedBox");
bosscreationspeed_box.value = createBossSpeed;
document.querySelector("#dot").addEventListener("click", function () {
    (dot == true) ? dot = false : dot = true;
});

// 총알 만들기
// 1. 스페이스바 누르면 총알 발사
// 2. 총알이 발사 = 총알이 y--, z = 스페이스바를 누른 순간의 탱크 x좌표
// 3. 발사된 총알들은 총알 배열에 저장을 한다
// 4. 모든 총알들은 x,y 좌표값이 있어야 한다
// 5. 총알 배열을 가지고 render 그려준다


// 적군
// 1. 적군의 위치는 랜덤하다
// 2. 적군은 밑으로 내려온다
// 3. 적군은 1초마다 하나씩 적군이 나온다
// 4. 적군이 바닥에 닿으면 게임 오버를 출력한다
// 5. 적군과 총알이 만나면 적군과 총알이 사라지고 점수를 획득한다

// 적군과 총알이 만난다란?
// 총알.y <= 적군.y and
// 총알.x >= 적군.x and 총알.x <= 적군.x + 적군의 넓이
