import { create } from "zustand"
import { logger } from "@/lib/logger"
import type { InterventionOffer } from "@/types"

// Intervention-spectrum offers (waiting → offer → withdraw) — the
// presentation gate between the backend's judge deciding to help and the
// content-agent generation the old ghost pair flow already handles
// (GHOST-STREAMING.md / ghost-store.ts remains the acceptance gate,
// unchanged). This store owns only that in-between state: never a
// materialized ghost, never anything persisted.
//
// Keyed by trigger_node_id, same shape as ghost-store's one-pending-per-node
// map — an offer anchors to a real node the same way a ghost pair does, so
// "one pending offer per node" falls out of the key instead of being checked
// imperatively. `offer.seq` (not the key) is what makes a late/duplicate SSE
// message a no-op: a `waiting`/`offer` naming a seq at or behind what's
// already stored for that node is stale and dropped.
export type InterventionPhase = "waiting" | "shown"

export interface InterventionOfferState {
  offer: InterventionOffer
  /** Set by `waiting` (backend-tuned, e.g. 10s default / 5s high-readiness —
   * never hard-coded here). Left at whatever `waiting` last set once `offer`
   * arrives — the presentation gate has already resolved by then, but the
   * countdown UI still reads it to render its final frame before swapping. */
  timerMs: number | null
  phase: InterventionPhase
}

interface InterventionStore {
  offers: Record<string, InterventionOfferState>

  /** `waiting` SSE message — starts the processing-timer/glow UI. */
  setWaiting(offer: InterventionOffer, timerMs: number): void
  /** `offer` SSE message — the show signal (directness/headline), published
   * before the ghost stream's `spawn`. */
  setOffer(offer: InterventionOffer): void
  /** `withdraw` SSE message — the backend aborted or expired this offer
   * (re-judge found it no longer mature, or the 10m window lapsed). */
  withdraw(offerId: string): void
  /** Clears every pending offer — same "leaving for a fresh canvas" use case
   * as ghost-store's reset(). */
  reset(): void
}

function isStale(existing: InterventionOfferState | undefined, incoming: InterventionOffer): boolean {
  return existing !== undefined && incoming.seq <= existing.offer.seq
}

function findByOfferId(
  offers: Record<string, InterventionOfferState>,
  offerId: string,
): string | undefined {
  for (const [triggerNodeId, state] of Object.entries(offers)) {
    if (state.offer.id === offerId) return triggerNodeId
  }
  return undefined
}

export const useInterventionStore = create<InterventionStore>()((set) => ({
  offers: {},

  setWaiting: (offer, timerMs) =>
    set((s) => {
      const existing = s.offers[offer.trigger_node_id]
      if (isStale(existing, offer)) {
        logger.warn("[intervention-store] stale waiting message dropped", { offerId: offer.id, seq: offer.seq })
        return s
      }
      logger.info("[intervention-store] waiting", { offerId: offer.id, triggerNodeId: offer.trigger_node_id, timerMs })
      return {
        offers: { ...s.offers, [offer.trigger_node_id]: { offer, timerMs, phase: "waiting" } },
      }
    }),

  setOffer: (offer) =>
    set((s) => {
      const existing = s.offers[offer.trigger_node_id]
      if (isStale(existing, offer)) {
        logger.warn("[intervention-store] stale offer message dropped", { offerId: offer.id, seq: offer.seq })
        return s
      }
      logger.info("[intervention-store] offer shown", { offerId: offer.id, triggerNodeId: offer.trigger_node_id })
      return {
        offers: {
          ...s.offers,
          [offer.trigger_node_id]: { offer, timerMs: existing?.timerMs ?? null, phase: "shown" },
        },
      }
    }),

  withdraw: (offerId) =>
    set((s) => {
      const triggerNodeId = findByOfferId(s.offers, offerId)
      if (!triggerNodeId) return s
      logger.info("[intervention-store] withdraw", { offerId, triggerNodeId })
      const offers = { ...s.offers }
      delete offers[triggerNodeId]
      return { offers }
    }),

  reset: () => set({ offers: {} }),
}))
