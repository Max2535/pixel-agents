import { DEPARTMENT_LOOKS } from '../constants.js';

export interface DepartmentLook {
  palette: number;
  hueShift: number;
}

/** Normalise a spawn's `subagent_type` into the key used by DEPARTMENT_LOOKS. */
export function normalizeDepartment(agentType: string | undefined): string | undefined {
  const key = agentType?.trim().toLowerCase();
  return key ? key : undefined;
}

/**
 * Look for a department's Sub-agent, or undefined when the type is not a known
 * department (the sub then inherits its parent's look, as before).
 */
export function departmentLook(agentType: string | undefined): DepartmentLook | undefined {
  const key = normalizeDepartment(agentType);
  return key && Object.hasOwn(DEPARTMENT_LOOKS, key) ? DEPARTMENT_LOOKS[key] : undefined;
}
