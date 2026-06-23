/**
 * Generates a fun, deterministic-ish companion name + avatar.
 * A nod to the Muppets, since Henson is named for Jim Henson.
 */

const FIRST = [
  "Kermit", "Gonzo", "Fozzie", "Rowlf", "Scooter", "Rizzo", "Pepe", "Beaker",
  "Statler", "Waldorf", "Animal", "Bunsen", "Sweetums", "Camilla", "Robin",
  "Clifford", "Lips", "Zoot", "Floyd", "Janice", "Sam", "Link", "Bean",
];

const EPITHET = [
  "the Compiler", "the Debugger", "the Refactorer", "the Architect",
  "the Reviewer", "the Shipper", "the Tinkerer", "the Maintainer",
  "the Pragmatic", "the Bold", "the Tidy", "the Relentless", "the Curious",
  "the Methodical", "the Swift", "the Steady",
];

const AVATARS = [
  "🐸", "🐻", "🐭", "🐔", "🦅", "🐶", "🐷", "🐰", "🦖", "🤖",
  "🎭", "🎬", "🧪", "🥁", "🎺", "🎩", "✨", "🚀",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export interface GeneratedCompanion {
  name: string;
  avatar: string;
}

export function generateCompanion(): GeneratedCompanion {
  return {
    name: `${pick(FIRST)} ${pick(EPITHET)}`,
    avatar: pick(AVATARS),
  };
}
