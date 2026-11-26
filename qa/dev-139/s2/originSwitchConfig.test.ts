import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOriginSwitchConfig } from '../../../server/originSwitchConfig.js';
const source = 'https://old.example.invalid', target = 'https://new.example.invalid', quick = 'https://quick.example.invalid';
const origins = { main: [source, target], quick: [quick] };
const route = { entry: 'main', sourceOrigin: source, targetOrigin: target, sourceSessionEntry: 'main', targetSessionEntry: 'main' };
const parse = (routes: unknown = [route]) => parseOriginSwitchConfig(JSON.stringify({ campaign: 'move-1', routes }), origins);
test('origin guide remains disabled when unset', () => assert.equal(parseOriginSwitchConfig(undefined, origins), null));
test('explicit approved route is immutable and canonical', () => {
  const config = parse()!; assert.equal(config.routes[0]?.targetOrigin, target);
  assert.ok(Object.isFrozen(config) && Object.isFrozen(config.routes) && Object.isFrozen(config.routes[0]));
});
test('main-origin Quick retains actual main Session separately from guide entry', () => {
  assert.equal(parse([{ ...route, entry: 'quick', targetOrigin: quick, targetSessionEntry: 'quick' }])!.routes[0]?.sourceSessionEntry, 'main');
});
test('unapproved, noncanonical and same origins never activate the guide', () => {
  for (const targetOrigin of [source, 'https://other.example.invalid', `${target}/`, `${target}?`, `${target}#`, 'http://new.example.invalid']) {
    assert.throws(() => parse([{ ...route, targetOrigin }]));
  }
});
test('incorrect entry/callback identity and duplicate source choices fail closed', () => {
  assert.throws(() => parse([{ ...route, targetSessionEntry: 'quick' }]));
  assert.throws(() => parse([route, route]));
  assert.throws(() => parse([{ ...route, redirectUri: target }]));
});
test('malformed or empty campaign does not turn source exceptions into success', () => {
  for (const raw of ['', '{}', '[]', 'null', JSON.stringify({ campaign: '', routes: [route] }), JSON.stringify({ campaign: 'ok', routes: [] })]) {
    assert.throws(() => parseOriginSwitchConfig(raw, origins));
  }
});
