const MODULE_ID = "sogrom-dnd5e-actiontracker";
const FLAG_KEY = "economy";

/**
 * Action economy categories tracked by this module, mapped to dnd5e activity
 * activation types (CONFIG.DND5E.activityActivationTypes) and a Font Awesome icon.
 */
const ECONOMY_TYPES = {
  action: { icon: "fa-solid fa-hand-fist", label: "SOGROM.ACTIONTRACKER.Action" },
  bonus: { icon: "fa-solid fa-bolt", label: "SOGROM.ACTIONTRACKER.BonusAction" },
  reaction: { icon: "fa-solid fa-arrow-rotate-left", label: "SOGROM.ACTIONTRACKER.Reaction" }
};

const DEFAULT_ECONOMY = { action: false, bonus: false, reaction: false };

const SETTINGS = {
  showOnPlayer: "showOnPlayer",
  showOnNPC: "showOnNPC"
};

/* -------------------------------------------- */
/*  Flag Helpers                                 */
/* -------------------------------------------- */

/**
 * Get the current action economy state for an actor.
 * @param {Actor5e} actor
 * @returns {{action: boolean, bonus: boolean, reaction: boolean}}
 */
function getEconomy(actor) {
  return foundry.utils.mergeObject(DEFAULT_ECONOMY, actor.getFlag(MODULE_ID, FLAG_KEY) ?? {}, { inplace: false });
}

/**
 * Set whether a single economy type has been used.
 * @param {Actor5e} actor
 * @param {string} type
 * @param {boolean} used
 */
async function setEconomyValue(actor, type, used) {
  const economy = getEconomy(actor);
  if (economy[type] === used) return;
  economy[type] = used;
  await actor.setFlag(MODULE_ID, FLAG_KEY, economy);
}

/**
 * Reset all economy types to unused for an actor.
 * @param {Actor5e} actor
 */
async function resetEconomy(actor) {
  const economy = getEconomy(actor);
  if (!economy.action && !economy.bonus && !economy.reaction) return;
  await actor.setFlag(MODULE_ID, FLAG_KEY, foundry.utils.deepClone(DEFAULT_ECONOMY));
}

/* -------------------------------------------- */
/*  Sheet Rendering                              */
/* -------------------------------------------- */

/**
 * Inject the action economy tracker buttons into an actor sheet header.
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 */
function onRenderActorSheet(app, element) {
  const actor = app.actor;
  if (!actor || !["character", "npc"].includes(actor.type)) return;

  const settingKey = actor.type === "character" ? SETTINGS.showOnPlayer : SETTINGS.showOnNPC;
  if (!game.settings.get(MODULE_ID, settingKey)) return;

  const container = element.querySelector(".sheet-header-buttons");
  if (!container) return;

  const economy = getEconomy(actor);
  const referenceNode = container.firstElementChild;

  for (const [type, config] of Object.entries(ECONOMY_TYPES)) {
    const used = !!economy[type];
    const typeLabel = game.i18n.localize(config.label);
    const stateLabel = game.i18n.localize(used ? "SOGROM.ACTIONTRACKER.Used" : "SOGROM.ACTIONTRACKER.Available");
    const tooltip = game.i18n.format("SOGROM.ACTIONTRACKER.Tooltip", { type: typeLabel, state: stateLabel });

    const indicator = document.createElement("div");
    indicator.classList.add("gold-button", "sogrom-economy-tracker");
    if (used) indicator.classList.add("sogrom-depleted");
    indicator.dataset.economyType = type;
    indicator.dataset.tooltip = tooltip;
    indicator.setAttribute("aria-label", tooltip);
    indicator.setAttribute("role", "img");

    const icon = document.createElement("i");
    icon.className = config.icon;
    icon.setAttribute("inert", "");
    indicator.appendChild(icon);

    container.insertBefore(indicator, referenceNode);
  }
}

/* -------------------------------------------- */
/*  Combat Hooks                                 */
/* -------------------------------------------- */

/**
 * Reset the action economy of the actor whose turn is starting.
 */
function onCombatTurnChange(combat, _previous, current) {
  if (!game.user.isActiveGM) return;
  const actor = combat.combatants.get(current.combatantId)?.actor;
  if (actor) resetEconomy(actor);
}

/**
 * Reset all combatants' action economy once a combat encounter ends.
 */
function onDeleteCombat(combat) {
  if (!game.user.isActiveGM) return;
  for (const combatant of combat.combatants) {
    if (combatant.actor) resetEconomy(combatant.actor);
  }
}

/**
 * Mark the relevant economy type as used when an actor activates a matching activity in combat.
 */
function onPostUseActivity(activity, _usageConfig, results) {
  if (!results || !game.combat?.started) return;
  const type = activity?.activation?.type;
  if (!ECONOMY_TYPES[type]) return;
  const actor = activity.actor;
  if (!actor) return;
  setEconomyValue(actor, type, true);
}

/* -------------------------------------------- */
/*  Initialization                               */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTINGS.showOnPlayer, {
    name: "SOGROM.ACTIONTRACKER.Settings.ShowOnPlayer.Name",
    hint: "SOGROM.ACTIONTRACKER.Settings.ShowOnPlayer.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, SETTINGS.showOnNPC, {
    name: "SOGROM.ACTIONTRACKER.Settings.ShowOnNPC.Name",
    hint: "SOGROM.ACTIONTRACKER.Settings.ShowOnNPC.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });
});

Hooks.on("renderCharacterActorSheet", onRenderActorSheet);
Hooks.on("renderNPCActorSheet", onRenderActorSheet);
Hooks.on("combatTurnChange", onCombatTurnChange);
Hooks.on("deleteCombat", onDeleteCombat);
Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
