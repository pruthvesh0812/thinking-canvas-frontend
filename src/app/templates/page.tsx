import { TemplateCanvas } from "@/components/templates/TemplateCanvas"

// Standalone test surface for the Canvas Templates feature — deliberately kept
// off the main canvas routes (CLAUDE.md task note: "keep this as a separate
// module … just for testing"). Reachable at /templates.
export default function TemplatesPage() {
  return <TemplateCanvas />
}
