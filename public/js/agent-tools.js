// WebMCP: tools a browser agent can call, so a grown-up's assistant can set up and start a game for a child.
// Driving and squirting stay with the child. The tools call the same functions as the menu's buttons.
// Spec: W3C WebML CG WebMCP draft. Older Chrome previews put it on navigator; without either, nothing happens.

/**
 * @typedef {{ readOnlyHint?: boolean, consequentialHint?: boolean, untrustedContentHint?: boolean }} ToolAnnotations
 * @typedef {{
 *   name: string, title?: string, description: string, inputSchema: object,
 *   execute: (input: any, client: { signal?: AbortSignal }) => Promise<unknown>,
 *   annotations?: ToolAnnotations,
 * }} ModelContextTool
 * @typedef {{ registerTool: (tool: ModelContextTool, options?: { signal?: AbortSignal }) => void }} ModelContext
 *
 * What main.js lends the tools.
 * @typedef {{
 *   state: () => object,
 *   setUp: (choices: { mode?: string, parts?: number, robots?: number, robotSpeed?: string, minutes?: number, colour?: string }) => object,
 *   start: () => object,
 *   toMenu: () => object,
 * }} GameApi
 */

/**
 * Registers the tools; aborting the returned controller unregisters them.
 * @param {GameApi} api
 * @param {{ colours: string[], robots: number[], minutes: number[] }} choices the menu's allowed values
 */
export function registerAgentTools(api, choices) {
  const controller = new AbortController()
  /** @type {ModelContext | undefined} */
  const mc = /** @type {any} */ (document).modelContext ?? /** @type {any} */ (navigator).modelContext
  if (!mc?.registerTool) return controller
  const { signal } = controller

  /** @param {ModelContextTool} tool */
  const register = (tool) => {
    try {
      mc.registerTool(tool, { signal })
    } catch (e) {
      console.warn('WebMCP: could not register', tool.name, e)
    }
  }

  register({
    name: 'get_game_state',
    title: 'Game state',
    description:
      'What Splat Tanks is showing: the screen (loading, menu, battle, ending, end), whether this device is the host ' +
      '(only the host sets up and starts games), the players in the room, the menu choices, and during a round each ' +
      "tank's share of the floor and, painting together, how much of each part is painted.",
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    execute: async () => api.state(),
  })

  register({
    name: 'set_up_game',
    title: 'Set up the game',
    description:
      "Changes the menu's choices, as tapping its buttons does. Anyone may pick their own colour; the other " +
      "choices are the host's. Works only on the menu. 'together' (the default) paints the floor cut into halves, " +
      "thirds or quarters with no clock and teaches fractions; 'match' is a timed round where each tank paints its own colour.",
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['together', 'match'], description: 'Paint together, or a timed splat match.' },
        parts: { type: 'integer', enum: [2, 3, 4], description: 'Painting together: halves, thirds or quarters.' },
        robots: { type: 'integer', enum: choices.robots, description: 'How many robot friends join.' },
        robotSpeed: { type: 'string', enum: ['slow', 'medium', 'fast'] },
        minutes: { type: 'integer', enum: choices.minutes, description: 'Splat match: how long the round lasts.' },
        colour: { type: 'string', enum: choices.colours, description: "This player's tank colour." },
      },
    },
    execute: async (input) => api.setUp(input ?? {}),
  })

  register({
    name: 'start_game',
    title: 'Start the game',
    description:
      'Starts a round with the menu\'s choices for everyone in the room, as the host\'s PLAY! button does (or "Play ' +
      'again" on the results). Host only.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => api.start(),
  })

  register({
    name: 'back_to_menu',
    title: 'Back to the menu',
    description:
      "Ends the round for everyone in the room and goes back to the menu, as the host's 🏠 does. The painting so far " +
      'is lost, so ask first if a child is playing. Host only.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { consequentialHint: true },
    execute: async () => api.toMenu(),
  })

  return controller
}
