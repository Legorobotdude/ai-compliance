import { SectionCard } from "@/components/ui/section-card";

type PromptRecipe = {
  name: string;
  excerpt: string;
  steps: string[];
  reference: string;
};

const recipes: PromptRecipe[] = [
  {
    name: "Prompt 1 · Document Parsing",
    excerpt:
      "Think-aloud extraction of part_number/substances with ppm normalization, validation loop, and ambiguity reporting.",
    steps: [
      "Detect tables + free text, cite doc type",
      "List missing units/values before JSON output",
      "Emit schema-compliant JSON (certificate_v1) only after validation passes"
    ],
    reference: "Architecture.md §4, Prompt 1"
  },
  {
    name: "Prompt 2 · Supplier Email",
    excerpt:
      "Localized outreach referencing BOM gaps, average response times, and regulatory deadlines—all under 180 words.",
    steps: [
      "Summarize missing/over-limit parts grouped by assembly",
      "Compute due date = avg response days + 2",
      "Draft tone-aware email citing upload link + expectation reminders"
    ],
    reference: "Architecture.md §4, Prompt 2"
  },
  {
    name: "Prompt 3 · Risk Summary",
    excerpt:
      "Traffic-light exec brief with top supplier gaps + reasoning trail pulled from merged compliance data.",
    steps: [
      "List calculations first (threshold breaches, supplier lag, assemblies affected)",
      "Summarize risk drivers (over-limit, missing/expired, upcoming regs)",
      "Close with traffic-light status + rationale"
    ],
    reference: "Architecture.md §4, Prompt 3"
  }
];

export function CoraPromptRecipes() {
  return (
    <SectionCard title="Prompt Recipes" description="Direct pull from Architecture.md §4 so prompt engineers can trace expectations.">
      <div className="space-y-4">
        {recipes.map((recipe) => (
          <article key={recipe.name} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <header className="flex items-center justify-between text-xs uppercase tracking-wide text-slate-400">
              <span>{recipe.name}</span>
              <span>{recipe.reference}</span>
            </header>
            <p className="mt-2 text-sm text-slate-200">{recipe.excerpt}</p>
            <ol className="mt-3 list-decimal space-y-1 pl-4 text-sm text-slate-400">
              {recipe.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </SectionCard>
  );
}
