import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { roleGuidance } from '../shared/agents.js';
import { DatabaseSync } from 'node:sqlite';
import type { Profile } from '../shared/types.js';
import { atomicJson, digest, readJson } from './local.js';
export interface SharedProfile {
  revision: string;
  instructions: string;
  profile: Profile;
}
export function writeSharedProfile(directory: string, profile: Profile): SharedProfile {
  const instructions = [
    roleGuidance.ceo,
    `User name: ${profile.name || '(not supplied)'}`,
    `Experience: ${profile.experience}`,
    profile.style,
    `Progress updates: ${profile.updates}`,
    `Approved examples: ${profile.examples}`,
  ].join('\n');
  const value = { revision: digest(instructions), instructions, profile };
  atomicJson(join(directory, 'shared-profile.json'), value);
  return value;
}
export function nativeProfile(directory: string): SharedProfile {
  const saved = readJson<SharedProfile>(join(directory, 'shared-profile.json'));
  if (saved) return saved;
  // An older Company service may not have generated the shared projection yet.
  // Read only the approved profile; never initialize an execution engine here.
  try {
    const database = new DatabaseSync(join(directory, 'company.sqlite'), { readOnly: true });
    let row: any;
    try {
      row = database.prepare("SELECT data FROM records WHERE kind='profile' AND id='main'").get();
    } finally {
      database.close();
    }
    if (row) {
      const profile = JSON.parse(row.data) as Profile;
      const instructions = [
        roleGuidance.ceo,
        `User name: ${profile.name}`,
        `Experience: ${profile.experience}`,
        profile.style,
        `Progress updates: ${profile.updates}`,
        `Approved examples: ${profile.examples}`,
      ].join('\n');
      return { revision: digest(instructions), instructions, profile };
    }
  } catch {}
  return {
    revision: digest(roleGuidance.ceo),
    instructions: roleGuidance.ceo,
    profile: { name: '', experience: '', style: '', examples: '', updates: '', onboarded: false },
  };
}
export function nativeCEOInstructions(directory: string) {
  return (
    nativeProfile(directory).instructions +
    '\nIn native Codex, delegate implementation to nxsoos_developer, review to nxsoos_reviewer, research to nxsoos_researcher, and design to nxsoos_designer. Use native subagent tools and respect native permissions, models, and concurrency. The browser visualizer observes this work and does not schedule it.'
  );
}
