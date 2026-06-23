/**
 * Agent-team "recipes". A companion agent can either do all the work itself
 * or delegate to a team of sub-agents described by one of these recipes.
 */

export interface RecipeRole {
  role: string;
  description: string;
}

export interface Recipe {
  id: string;
  name: string;
  description: string;
  roles: RecipeRole[];
}

export const RECIPES: Recipe[] = [
  {
    id: "solo",
    name: "Solo",
    description:
      "The companion does everything itself. Best for small tickets and quick fixes.",
    roles: [{ role: "generalist", description: "Plans, implements, tests and ships the ticket end to end." }],
  },
  {
    id: "fullstack",
    name: "Full-stack team",
    description: "A balanced team for feature work that spans UI and server.",
    roles: [
      { role: "designer", description: "Owns UX, layout and visual polish; produces markup/styles." },
      { role: "frontend", description: "Implements client-side behaviour and wires up the UI." },
      { role: "backend", description: "Implements APIs, data models and business logic." },
      { role: "reviewer", description: "Reviews the diff for correctness and etiquette before merge." },
    ],
  },
  {
    id: "backend",
    name: "Backend team",
    description: "For API, data and infrastructure heavy tickets.",
    roles: [
      { role: "backend", description: "Implements APIs, data models and business logic." },
      { role: "tester", description: "Writes and runs tests; verifies acceptance criteria." },
      { role: "reviewer", description: "Reviews the diff for correctness and etiquette before merge." },
    ],
  },
  {
    id: "research",
    name: "Research + spike",
    description: "Investigate an unknown before committing to an approach.",
    roles: [
      { role: "researcher", description: "Explores options, reads docs/code, summarises tradeoffs." },
      { role: "prototyper", description: "Builds a throwaway spike to validate the chosen approach." },
    ],
  },
];

export function findRecipe(id: string): Recipe | undefined {
  return RECIPES.find((r) => r.id === id);
}
