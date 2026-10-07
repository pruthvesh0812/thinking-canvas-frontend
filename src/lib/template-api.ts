import { logger } from "@/lib/logger"
import { ApiError } from "@/lib/api"
import type { TemplateExpandRequest, TemplateResponse } from "./template-types"

// Typed fetch wrapper for the templates testing module. The backend endpoint
// for this feature is still in flight ("backend changes are being done for the
// same"), so until it lands — or whenever NEXT_PUBLIC_USE_MOCK_PERSISTENCE is
// set, or no API URL is configured — we fall back to a local mock so the
// module is fully testable on its own. When the real route ships, the mock
// path drops out with no change to callers.

const API_URL = process.env.NEXT_PUBLIC_API_URL
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK_PERSISTENCE === "true" || !API_URL

// Assumed endpoint shape (align with the backend contract once published):
//   POST /api/template-expand  { query? , context? } -> TemplateResponse
const ENDPOINT = "/api/template-expand"

export async function expandTemplate(req: TemplateExpandRequest): Promise<TemplateResponse> {
  if (USE_MOCK) {
    logger.info("[template] using mock response", { mock: true, hasContext: !!req.context })
    return mockResponse(req)
  }
  logger.info("[template] requesting expansion", { endpoint: ENDPOINT, hasContext: !!req.context })
  const res = await fetch(`${API_URL}${ENDPOINT}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    logger.error("[template] request failed", { endpoint: ENDPOINT, status: res.status, body })
    throw new ApiError(ENDPOINT, res.status, body)
  }
  return res.json() as Promise<TemplateResponse>
}

// ---- Mock -----------------------------------------------------------------

function delay<T>(value: T, ms = 650): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

// Heuristic: "how/steps/process/first" leans sequence; everything else leans
// hierarchy. Keeps the two layouts exercisable from the chat box without a
// backend. An expansion flips the shape so "a hierarchy node can expand into a
// sequence and vice versa" is visible in testing.
function mockResponse(req: TemplateExpandRequest): Promise<TemplateResponse> {
  const text = (req.context?.label ?? req.query ?? "").toLowerCase()
  const wantsSequence = /\b(how|step|steps|process|first|then|flow|pipeline|order)\b/.test(text)

  if (req.context && req.context.label) {
    // Expansion: return the OPPOSITE shape of a light heuristic to show
    // cross-shape expansion.
    return wantsSequence ? delay(mockHierarchy(req.context.label)) : delay(mockSequence(req.context.label))
  }
  return wantsSequence ? delay(mockSequence(req.query ?? "your question")) : delay(mockHierarchy(req.query ?? "your question"))
}

function mockHierarchy(topic: string): TemplateResponse {
  const clipped = topic.length > 40 ? `${topic.slice(0, 37)}…` : topic
  return {
    shape: "hierarchy",
    root: { label: clipped || "Central idea", detail: `The core of “${topic}” and the threads that branch from it.` },
    children: [
      { label: "A driving reason", detail: "The main force behind this — why it holds up under scrutiny.", kind: "idea", link: "because" },
      { label: "A concrete case", detail: "One grounded instance you can point at to make the idea real.", kind: "example", link: "for example" },
      { label: "What's still open?", detail: "The question this raises that isn't yet answered — worth chasing.", kind: "question", link: "but" },
    ],
  }
}

function mockSequence(topic: string): TemplateResponse {
  const clipped = topic.length > 40 ? `${topic.slice(0, 37)}…` : topic
  return {
    shape: "sequence",
    title: clipped ? `How: ${clipped}` : "The flow",
    detail: `A left-to-right path through “${topic}”, one step at a time.`,
    steps: [
      { label: "Start here", detail: "The precondition that has to be true before anything else moves.", transition: "which enables" },
      { label: "The turn", detail: "Where the first real change happens and momentum builds.", transition: "which triggers" },
      { label: "The payoff", detail: "The outcome the earlier steps were setting up.", transition: "which leaves you with" },
      { label: "What remains", detail: "The residue — what you're left holding once the sequence completes." },
    ],
  }
}
