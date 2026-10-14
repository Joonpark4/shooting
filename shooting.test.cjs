// Run with: node shooting.test.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const listeners = {};
const elements = {};
let now = 0;
let reloaded = false;
const canvas = {
    getContext: () => ({ drawImage() {}, fillText() {} }),
    getBoundingClientRect: () => ({ left: 30, width: 200 }),
    addEventListener: (name, handler) => { listeners[name] = handler; },
    setPointerCapture() {},
};
const context = vm.createContext({
    document: {
        createElement: () => canvas,
        body: { appendChild() {} },
        addEventListener: (name, handler) => { listeners[name] = handler; },
        querySelector: (selector) => elements[selector] ||= { addEventListener() {} },
    },
    window: {
        matchMedia: () => ({ matches: true }),
        addEventListener: (name, handler) => { listeners[name] = handler; },
        location: { reload: () => { reloaded = true; } },
    },
    Image: class {},
    performance: { now: () => now },
    requestAnimationFrame() {}, setInterval() {}, clearInterval() {},
    console: { log() {} },
});
vm.runInContext(fs.readFileSync(`${__dirname}/shooting.js`, 'utf8'), context);
const run = (source) => vm.runInContext(source, context);
const pointer = (pointerId, clientX) => ({ pointerId, clientX, pointerType: 'touch' });

listeners.pointerdown(pointer(1, 130));
assert.equal(run('tankX'), 168, 'scaled canvas coordinates center the tank');
assert.equal(run('bulletList.length'), 1, 'touch fires immediately');
listeners.pointerdown(pointer(2, 230));
assert.equal(run('tankX'), 168, 'second finger does not take over');
listeners.pointermove(pointer(1, -50));
assert.equal(run('tankX'), 0);
listeners.pointermove(pointer(1, 300));
assert.equal(run('tankX'), 336);
now = 149;
run('update()');
assert.equal(run('bulletList.length'), 1);
now = 150;
run('update()');
assert.equal(run('bulletList.length'), 2, 'holding fires after 150 ms');
listeners.pointerup(pointer(2, 130));
assert.equal(run('touchPointer'), 1);
listeners.pointerup(pointer(1, 130));
now = 300;
run('update()');
assert.equal(run('bulletList.length'), 2, 'release stops firing');
for (const stop of ['pointercancel', 'lostpointercapture', 'blur']) {
    listeners.pointerdown(pointer(1, 130));
    listeners[stop](pointer(1, 130));
    assert.equal(run('touchPointer'), null, `${stop} stops touch input`);
}
const bullets = run('bulletList.length');
listeners.keyup({ key: ' ' });
assert.equal(run('bulletList.length'), bullets + 1, 'desktop space still fires');
run('gameover = true');
listeners.pointerdown(pointer(1, 130));
assert.equal(reloaded, true, 'touch restarts after game over');
console.log('Mobile input and desktop keyboard checks passed.');
