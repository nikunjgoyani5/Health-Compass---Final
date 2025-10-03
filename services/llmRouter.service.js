export const chooseModel = ({ taskKind, complexity="low", latencySensitive=false }) => {
    // Simple routing rules
    if (["validation","qa","repetitive"].includes(taskKind)) {
      return { provider: "openai", model: "gpt-4o-mini", purpose: "fast" };
    }
    if (complexity === "high" || taskKind === "orchestration") {
      return { provider: "openai", model: "gpt-5", purpose: "complex" };
    }
    return { provider: "openai", model: "gpt-4o", purpose: "balanced" };
  };
  