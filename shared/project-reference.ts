import type { Project, Message } from './types';

const words = (value: string) => value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
function oneEdit(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0,
    j = 0,
    edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + Number(i < a.length || j < b.length) <= 1;
}

/** Resolve only one named, registered project. Never guess between multiple matches. */
export function projectReferences(projects: Project[], text: string): Project[] {
  const input = words(text);
  const matches = projects.map((project) => {
    const name = words(project.name);
    if (!name.length) return { project, exact: false, near: false };
    let exact = false,
      near = false;
    for (let start = 0; start <= input.length - name.length; start++) {
      const candidate = input.slice(start, start + name.length);
      const phrase = candidate.join(' '),
        target = name.join(' ');
      if (phrase === target) exact = true;
      // A single typo in a distinctive multi-part name, such as map-makers/map-markers.
      else if (
        name.length > 1 &&
        target.length >= 8 &&
        candidate[0] === name[0] &&
        oneEdit(phrase, target)
      )
        near = true;
    }
    return { project, exact, near };
  });
  const named = matches.filter((m) => m.exact || m.near);
  return named.map((match) => match.project);
}

export function referencedProject(projects: Project[], text: string): Project | undefined {
  const matches = projectReferences(projects, text);
  return matches.length === 1 ? matches[0] : undefined;
}

export function conversationProject(
  projects: Project[],
  messages: Message[],
  text: string,
): Project | undefined {
  const named = projectReferences(projects, text);
  if (named.length) return named.length === 1 ? named[0] : undefined;
  const followup =
    /\b(this|that|it|its|those|these|them|again|continue|simpler|last|previous)\b/i.test(text) ||
    /^(why|how|explain|yes|no|show evidence)[.!?\s]*$/i.test(text.trim());
  if (!followup) return undefined;
  const previous = [...messages].reverse().find((message) => message.author === 'user');
  return projects.find((project) => project.id === previous?.projectId);
}
