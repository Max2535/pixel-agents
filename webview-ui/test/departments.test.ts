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
  assert.equal(seen.size, 8, 'the eight departments of the AI team');
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
