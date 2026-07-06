import { create } from 'zustand'

// Owns canvas meta (title, original_intent) + active session id + phase +
// debounce indicator state. Does NOT contain: nodes/edges (canvas-store),
// ghost pairs (ghost-store).

export type SessionPhase = 'diverging' | 'converging'

type CanvasMeta = {
  canvas_id: string
  title: string | null
  original_intent: string
}

type SessionStore = {
  canvas: CanvasMeta | null
  session_id: string | null
  current_phase: SessionPhase
  debounce_active_node_id: string | null

  setCanvas(canvas: CanvasMeta | null): void
  setSession(session_id: string | null, current_phase?: SessionPhase): void
  setPhase(phase: SessionPhase): void
  setDebounceActive(nodeId: string | null): void
  clearDebounce(): void
  reset(): void
}

export const useSessionStore = create<SessionStore>()((set) => ({
  canvas: null,
  session_id: null,
  current_phase: 'diverging',
  debounce_active_node_id: null,

  setCanvas(canvas) {
    set({ canvas })
  },

  setSession(session_id, current_phase) {
    set((s) => ({
      session_id,
      current_phase: current_phase ?? s.current_phase,
    }))
  },

  setPhase(phase) {
    set({ current_phase: phase })
  },

  setDebounceActive(nodeId) {
    set({ debounce_active_node_id: nodeId })
  },

  clearDebounce() {
    set({ debounce_active_node_id: null })
  },

  reset() {
    set({
      canvas: null,
      session_id: null,
      current_phase: 'diverging',
      debounce_active_node_id: null,
    })
  },
}))
