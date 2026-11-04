import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CARD_SCENE_IDS, cardScene } from '../lib/card-scenes.mjs';
import { sceneForCard } from '../lib/mobile-context.mjs';

const day = '2026-11-04T13:30:00+08:00';
const night = '2026-11-04T23:30:00+08:00';

test('explicit lifestyle subjects remain relevant at every hour, including night', () => {
  const expected = { flowers: 'flowers', tea: 'tea', stretch: 'meadow', qigong: 'meadow', daydream: 'sky', plants: 'leaves' };
  for (const [tag, scene] of Object.entries(expected)) {
    const card = { id: `lifestyle-${tag}`, title: '夜间小休息', tags: [tag, 'emotion'] };
    for (let hour = 0; hour < 24; hour++) {
      const time = `2026-11-04T${String(hour).padStart(2, '0')}:30:00+08:00`;
      assert.equal(sceneForCard(card, time), scene, `${tag} at ${hour}:30`);
    }
  }
});

test('specific Chinese titles match visual subjects without requiring model tags', () => {
  for (const [title, scene] of [['看一朵鲜花', 'flowers'], ['留意手边的茶香', 'tea'], ['两手托天理三焦', 'meadow'], ['坐一会儿发呆', 'sky'], ['看看盆栽叶片', 'leaves']]) {
    assert.equal(cardScene({ id: title, title }, night), scene);
  }
  assert.notEqual(cardScene({ id: 'eyes', title: '眼花时放下屏幕' }, day), 'flowers');
});

test('journaling, drawing and emotion choose only related natural scenery', () => {
  for (const tag of ['journal', 'drawing', 'emotion']) {
    const pool = tag === 'emotion' ? ['water', 'sky'] : ['bamboo', 'water'];
    const scenes = new Set();
    for (let id = 0; id < 32; id++) {
      const card = { id: `${tag}-${id}`, tags: [tag] };
      const scene = cardScene(card, day);
      assert.ok(pool.includes(scene));
      assert.equal(cardScene(card, night), scene);
      assert.equal(cardScene({ ...card }, day), scene, 'rerenders do not randomly change images');
      scenes.add(scene);
    }
    assert.equal(scenes.size, 2, 'different cards can use both related scenes');
  }
});

test('an optional scene cycle changes only the related pool and keeps explicit subjects', () => {
  const card = { id: 'journal-one', tags: ['journal'] };
  assert.notEqual(cardScene(card, day, 0), cardScene(card, day, 1));
  assert.equal(cardScene(card, day, 0), cardScene(card, day, 2));
  assert.equal(cardScene(card, day, NaN), cardScene(card, day, 0));
  assert.equal(cardScene({ id: 'tea-one', tags: ['tea'] }, night, 99), 'tea');
});

test('clock-only night scenery is a fallback, and malformed data is harmless', () => {
  assert.equal(cardScene({ id: 'generic', title: '片刻歇息' }, night), 'night');
  assert.equal(cardScene({ id: 'sleep', title: '睡前收束' }, day), 'night');
  for (const value of [undefined, null, {}, { tags: 'tea' }, { tags: [null, {}, 3] }]) {
    assert.ok(CARD_SCENE_IDS.includes(cardScene(value, 'invalid time')));
  }
});

test('every returned scene has a local WebP asset; no remote URL is selectable', () => {
  assert.equal(CARD_SCENE_IDS.length, 8);
  for (const id of CARD_SCENE_IDS) {
    const file = new URL(`../public/scenes/${id}.webp`, import.meta.url);
    assert.ok(existsSync(file), `missing ${id}`);
    const bytes = readFileSync(file);
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF');
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP');
    assert.ok(bytes.length < 200000, `oversize mobile scene ${id}`);
  }
  assert.ok(CARD_SCENE_IDS.includes(cardScene({ id: 'https://example.com/picture.jpg', title: '<img src=x>' }, day)));
});
