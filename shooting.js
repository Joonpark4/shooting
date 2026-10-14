// 입력, 프레임 시간, 에셋 로딩과 게임 시작.
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

function advanceFrame(timestamp) {
    if (document.hidden) {
        lastTime = null;
        accumulator = 0;
        return;
    }
    // 4fps까지 경과 시간을 보존한다. 긴 중단 뒤에는 최대 0.25초만 따라잡는다.
    if (lastTime !== null) accumulator += Math.max(0, Math.min(0.25, (timestamp - lastTime) / 1000));
    lastTime = timestamp;
    while (accumulator + 1e-10 >= STEP) {
        update(STEP);
        accumulator = Math.max(0, accumulator - STEP);
    }
}

function main(timestamp) {
    advanceFrame(timestamp);
    if (!document.hidden) render();
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
