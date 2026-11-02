import assert from 'node:assert/strict';
import { test } from 'node:test';

import { type ScrollAnimation, ScrollFollower } from '@/lib/chats/scroll-follower';

function animationClock(reduced = false) {
  let now = 0;
  let id = 0;
  const callbacks = new Map<number, FrameRequestCallback>();
  const animation: ScrollAnimation = {
    now: () => now,
    reducedMotion: () => reduced,
    request: (callback) => {
      callbacks.set(++id, callback);
      return id;
    },
    cancel: (key) => {
      callbacks.delete(key);
    },
  };
  const tick = () => {
    now += 16;
    const pending = [...callbacks.values()];
    callbacks.clear();
    pending.forEach((callback) => {
      callback(now);
    });
  };
  return { animation, tick, callbacks };
}

void test('follow scrolling has one animation, tracks content growth and settles at the latest text', () => {
  const clock = animationClock();
  const element = { scrollTop: 0, scrollHeight: 1000, clientHeight: 500 };
  const follower = new ScrollFollower(element, () => undefined, clock.animation);
  follower.update();
  follower.update();
  assert.equal(clock.callbacks.size, 1);
  clock.tick();
  assert.ok(element.scrollTop > 0 && element.scrollTop < 500);
  element.scrollHeight = 1500;
  for (let frame = 0; frame < 40; frame += 1) clock.tick();
  assert.equal(element.scrollTop, 1000);
  assert.equal(clock.callbacks.size, 0);
});

void test('reading earlier text pauses following until the user returns to the bottom', () => {
  const clock = animationClock();
  const element = { scrollTop: 450, scrollHeight: 1000, clientHeight: 500 };
  const changes: boolean[] = [];
  const follower = new ScrollFollower(element, (value) => changes.push(value), clock.animation);
  follower.update();
  follower.pause();
  follower.onScroll();
  element.scrollHeight = 1200;
  follower.update();
  clock.tick();
  assert.equal(element.scrollTop, 450);
  assert.equal(clock.callbacks.size, 0);
  element.scrollTop = 700;
  follower.onScroll();
  assert.deepEqual(changes, [false, true]);
});

void test('reduced motion scrolls directly; disposal leaves no animation or state update', () => {
  const clock = animationClock(true);
  const element = { scrollTop: 0, scrollHeight: 1000, clientHeight: 500 };
  const changes: boolean[] = [];
  const follower = new ScrollFollower(element, (value) => changes.push(value), clock.animation);
  follower.update();
  assert.equal(element.scrollTop, 500);
  assert.equal(clock.callbacks.size, 0);
  follower.dispose();
  follower.update();
  assert.deepEqual(changes, []);
});

void test('sending a new turn resumes following after reading earlier messages', () => {
  const clock = animationClock();
  const element = { scrollTop: 0, scrollHeight: 1500, clientHeight: 500 };
  const follower = new ScrollFollower(element, () => undefined, clock.animation);
  follower.pause();
  follower.resume();
  for (let frame = 0; frame < 40; frame += 1) clock.tick();
  assert.equal(element.scrollTop, 1000);
  assert.equal(clock.callbacks.size, 0);
});
