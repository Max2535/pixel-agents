/**
 * Unit tests for department Sub-agents: a Subtask spawned with a department's
 * `subagent_type` takes that department's look instead of its parent's.
 *
 * Domain-model tests (like greeter/teammateSeating): what the character gets
 * (palette, hueShift, agentType) is not observable through the UI as data.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { DEPARTMENT_LOOKS } from '../src/constants.js';
import { departmentLook, normalizeDepartment } from '../src/office/departments.js';
import { OfficeState } from '../src/office/engine/officeState.js';
import type { OfficeLayout } from '../src/office/types.js';
import { TileType } from '../src/office/types.js';

function floorLayout(cols = 9, rows = 7): OfficeLayout {
  return {
    version: 1,
    cols,
    rows,
    tiles: new Array<TileType>(cols * rows).fill(TileType.FLOOR_1),
    furniture: [],
  };
}

test('every department gets a distinct palette + hueShift combination', () => {
  const seen = new Set<string>();
  for (const [name, look] of Object.entries(DEPARTMENT_LOOKS)) {
    const key = `${look.palette}:${look.hueShift}`;
    assert.ok(!seen.has(key), `${name} collides with another department (${key})`);
    seen.add(key);
  }
  assert.equal(seen.size, 10, 'the ten departments of the AI team');
});

test('the keys are the subagent_type names the AI team actually uses', () => {
  // One per .claude/agents/*.md in restaurant-system-management. `support` alone
  // never matched: the department is `marketing-support`.
  const team = [
    'engineering',
    'qa',
    'security',
    'devops-sre',
    'product',
    'marketing-support',
    'finance',
    'legal',
    'it-support',
    'sa',
  ];
  assert.deepEqual(Object.keys(DEPARTMENT_LOOKS).sort(), [...team].sort());
  for (const name of team) assert.ok(departmentLook(name), `${name} has a look`);
  assert.equal(departmentLook('support'), undefined);
});

test('departmentLook is case/whitespace-insensitive and ignores unknown types', () => {
  assert.deepEqual(departmentLook(' QA '), DEPARTMENT_LOOKS.qa);
  assert.equal(departmentLook('Explore'), undefined);
  assert.equal(departmentLook('general-purpose'), undefined);
  assert.equal(departmentLook(undefined), undefined);
  assert.equal(departmentLook(''), undefined);
  // Prototype keys are not departments.
  assert.equal(departmentLook('constructor'), undefined);
  assert.equal(departmentLook('toString'), undefined);
  assert.equal(normalizeDepartment('  Security '), 'security');
  assert.equal(normalizeDepartment('   '), undefined);
});

test('a department sub-agent takes the department look, not the parent palette', () => {
  const os = new OfficeState(floorLayout());
  os.addAgent(1, 3, 90);
  const qaId = os.addSubagent(1, 'tool-qa', 'qa');
  const qa = os.characters.get(qaId)!;
  assert.equal(qa.palette, DEPARTMENT_LOOKS.qa.palette);
  assert.equal(qa.hueShift, DEPARTMENT_LOOKS.qa.hueShift);
  assert.equal(qa.agentType, 'qa');
  assert.equal(qa.isSubagent, true);
  assert.equal(qa.seatId, null, 'sub-agents still never take a seat');
});

test('a sub-agent without a department inherits the parent look', () => {
  const os = new OfficeState(floorLayout());
  os.addAgent(1, 3, 90);
  const parent = os.characters.get(1)!;

  const plain = os.characters.get(os.addSubagent(1, 'tool-a'))!;
  assert.equal(plain.palette, parent.palette);
  assert.equal(plain.hueShift, parent.hueShift);
  assert.equal(plain.agentType, undefined);

  const explore = os.characters.get(os.addSubagent(1, 'tool-b', 'Explore'))!;
  assert.equal(explore.palette, parent.palette);
  assert.equal(explore.hueShift, parent.hueShift);
  assert.equal(explore.agentType, 'explore', 'the type is kept for the label even if unstyled');
});

test('addSubagent stays idempotent per (parent, tool): the first type wins', () => {
  const os = new OfficeState(floorLayout());
  os.addAgent(1);
  const first = os.addSubagent(1, 'tool-1', 'security');
  const again = os.addSubagent(1, 'tool-1', 'legal');
  assert.equal(first, again);
  assert.equal(os.characters.get(first)!.agentType, 'security');
});

/** A 12x6 floor split into three Areas: engineering (cols 0-3), qa (4-7), no area (8-11). */
function areaLayout(): OfficeLayout {
  const cols = 12;
  const rows = 6;
  const layout = floorLayout(cols, rows);
  layout.areas = [
    { label: 'engineering', color: 'blue' },
    { label: 'QA', color: 'orange' },
  ];
  layout.areaTiles = Array.from({ length: cols * rows }, (_, i) => {
    const col = i % cols;
    if (col < 4) return 'engineering';
    if (col < 8) return 'QA';
    return null;
  });
  return layout;
}

test('a department sub-agent spawns inside the Area named after its department', () => {
  const os = new OfficeState(areaLayout());
  os.addAgent(1, 3, 90);
  // the parent stands somewhere else entirely
  const parent = os.characters.get(1)!;
  parent.tileCol = 10;
  parent.tileRow = 2;

  const qa = os.characters.get(os.addSubagent(1, 'tool-qa', 'qa'))!;
  assert.ok(qa.tileCol >= 4 && qa.tileCol < 8, `qa spawned at col ${qa.tileCol}`);
  assert.equal(qa.homeArea, 'QA', 'matches the Area label case-insensitively');

  const eng = os.characters.get(os.addSubagent(1, 'tool-eng', 'engineering'))!;
  assert.ok(eng.tileCol < 4, `engineering spawned at col ${eng.tileCol}`);
});

test('a department sub-agent keeps wandering inside its Area', () => {
  const os = new OfficeState(areaLayout());
  os.addAgent(1, 3, 90);
  const qa = os.characters.get(os.addSubagent(1, 'tool-qa', 'qa'))!;
  qa.matrixEffect = null;
  for (let i = 0; i < 4000; i++) {
    os.update(0.1);
    assert.ok(qa.tileCol >= 4 && qa.tileCol < 8, `left its Area at step ${i}: col ${qa.tileCol}`);
  }
});

test('without a matching Area the sub-agent behaves as before', () => {
  const os = new OfficeState(areaLayout());
  os.addAgent(1, 3, 90);
  const legal = os.characters.get(os.addSubagent(1, 'tool-l', 'legal'))!;
  assert.equal(legal.homeArea, undefined);
  const plain = os.characters.get(os.addSubagent(1, 'tool-p'))!;
  assert.equal(plain.homeArea, undefined);
  // and a layout with no Areas at all
  const bare = new OfficeState(floorLayout());
  bare.addAgent(1, 3, 90);
  assert.equal(bare.characters.get(bare.addSubagent(1, 'tool-q', 'qa'))!.homeArea, undefined);
});

test('every department with an Area has one resident, in its Area, from the start', () => {
  const os = new OfficeState(areaLayout());
  const residents = [...os.characters.values()].filter((c) => c.isSubagent);
  assert.deepEqual(residents.map((c) => c.agentType).sort(), ['engineering', 'qa']);
  const qa = residents.find((c) => c.agentType === 'qa')!;
  assert.ok(qa.tileCol >= 4 && qa.tileCol < 8);
  assert.equal(qa.seatId, null);
  // no Areas, no residents
  assert.equal(new OfficeState(floorLayout()).characters.size, 0);
});

test('a Subtask borrows its department resident instead of spawning another', () => {
  const os = new OfficeState(areaLayout());
  os.addAgent(1, 3, 90);
  const before = os.characters.size;
  const qaId = os.addSubagent(1, 'tool-qa', 'qa');
  assert.equal(os.characters.size, before, 'no new character');
  assert.equal(os.getSubagentId(1, 'tool-qa'), qaId);

  // a second concurrent QA Subtask cannot share it: it gets an ordinary sub-agent
  const second = os.addSubagent(1, 'tool-qa2', 'qa');
  assert.notEqual(second, qaId);
  assert.equal(os.characters.size, before + 1);
});

test('finishing the Subtask returns the resident to idle and it can be borrowed again', () => {
  const os = new OfficeState(areaLayout());
  os.addAgent(1, 3, 90);
  const qaId = os.addSubagent(1, 'tool-qa', 'qa');
  os.setAgentActive(qaId, true);
  os.removeSubagent(1, 'tool-qa');
  const qa = os.characters.get(qaId)!;
  assert.ok(qa, 'the resident stays');
  assert.equal(qa.matrixEffect, null, 'no despawn effect');
  assert.equal(qa.isActive, false);
  assert.equal(os.getSubagentId(1, 'tool-qa'), null);
  assert.equal(os.addSubagent(1, 'tool-qa-again', 'qa'), qaId);

  os.removeAllSubagents(1);
  assert.ok(os.characters.has(qaId), 'removing a parent releases, never removes, the resident');
  assert.equal(os.characters.get(qaId)!.isActive, false);
});

test('residents are not persisted and survive a layout rebuild inside their Area', () => {
  const os = new OfficeState(areaLayout());
  assert.deepEqual(os.getPersistableSeats(), {});
  os.rebuildFromLayout(areaLayout());
  const qa = [...os.characters.values()].find((c) => c.agentType === 'qa')!;
  assert.equal(qa.seatId, null);
  assert.ok(qa.tileCol >= 4 && qa.tileCol < 8);
});
