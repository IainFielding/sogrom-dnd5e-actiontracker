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
  enabled: "enabled",
  playerPosition: "playerPosition",
  npcPosition: "npcPosition"
};

const TRACKER_POSITIONS = {
  header: "header",
  portrait: "portrait"
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
 * Build the indicator element for a single action economy type.
 * @param {{action: boolean, bonus: boolean, reaction: boolean}} economy
 * @param {string} type
 * @param {{icon: string, label: string}} config
 * @returns {HTMLElement}
 */
function createIndicator(economy, type, config) {
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

  return indicator;
}

/**
 * Insert the tracker indicators into the sheet header, to the left of the rest buttons.
 * @param {HTMLElement} element
 * @param {Actor5e} actor
 * @param {HTMLElement[]} indicators
 */
function injectHeaderTrackers(element, actor, indicators) {
  const container = element.querySelector(".sheet-header-buttons");
  if (!container) return;

  const referenceNode = container.firstElementChild;
  for (const indicator of indicators) container.insertBefore(indicator, referenceNode);

  // The character sheet's button row is absolutely positioned with no spare room,
  // so shift it left to make space for the extra indicators.
  if (actor.type === "character") container.classList.add("sogrom-has-tracker");
}

/**
 * Insert the tracker indicators below the HP/temp HP meter on the NPC sheet.
 * @param {HTMLElement} element
 * @param {HTMLElement[]} indicators
 */
function injectPortraitRow(element, indicators) {
  const anchor = element.querySelector(".meter.sectioned.split");
  if (!anchor) return;

  const wrapper = document.createElement("div");
  wrapper.classList.add("sogrom-economy-tracker-row");
  for (const indicator of indicators) wrapper.appendChild(indicator);

  anchor.insertAdjacentElement("afterend", wrapper);
}

/**
 * Insert the tracker indicators as a collapsible tray centered above the portrait,
 * which expands upward over the sheet header, styled similarly to the death saves tray.
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 * @param {HTMLElement[]} indicators
 */
function injectPortraitTray(app, element, indicators) {
  const header = element.querySelector(".sheet-header");
  if (!header) return;

  const open = !!app._sogromTrackerTrayOpen;

  const tray = document.createElement("div");
  tray.classList.add("sogrom-tracker-tray");
  if (open) tray.classList.add("sogrom-open");

  const tab = document.createElement("button");
  tab.type = "button";
  tab.classList.add("sogrom-tracker-tab", "card-tab", "horizontal", "unbutton", "always-interactive");
  const trayLabel = game.i18n.localize("SOGROM.ACTIONTRACKER.Tray");
  tab.dataset.tooltip = trayLabel;
  tab.setAttribute("aria-label", trayLabel);
  tab.setAttribute("aria-expanded", String(open));

  const tabIcon = document.createElement("i");
  tabIcon.className = "fa-solid fa-burst";
  tabIcon.setAttribute("inert", "");
  tab.appendChild(tabIcon);

  const panel = document.createElement("div");
  panel.classList.add("sogrom-tracker-panel");
  for (const indicator of indicators) panel.appendChild(indicator);

  tab.addEventListener("click", () => {
    const isOpen = tray.classList.toggle("sogrom-open");
    tab.setAttribute("aria-expanded", String(isOpen));
    app._sogromTrackerTrayOpen = isOpen;
  });

  tray.append(tab, panel);
  header.appendChild(tray);

  // The tray is anchored to the header (so the panel can expand over it), but the
  // portrait it's attached to scrolls with .main-content. Hide the tray once the
  // sidebar has scrolled away from the top so it doesn't appear detached.
  const mainContent = element.querySelector(".main-content");
  if (mainContent) {
    if (mainContent._sogromScrollHandler) mainContent.removeEventListener("scroll", mainContent._sogromScrollHandler);
    const handler = () => tray.classList.toggle("sogrom-scrolled", mainContent.scrollTop > 0);
    mainContent.addEventListener("scroll", handler, { passive: true });
    mainContent._sogromScrollHandler = handler;
    handler();
  }
}

/**
 * Insert the tracker indicators near the actor's portrait.
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 * @param {Actor5e} actor
 * @param {HTMLElement[]} indicators
 */
function injectPortraitTrackers(app, element, actor, indicators) {
  if (actor.type === "npc") injectPortraitRow(element, indicators);
  else injectPortraitTray(app, element, indicators);
}

/**
 * Remove any tracker elements injected by a previous render, so re-renders (e.g. when
 * a sheet is popped out into its own window) don't leave behind duplicates.
 * @param {HTMLElement} element
 */
function removeExistingTrackers(element) {
  for (const selector of [".sogrom-economy-tracker", ".sogrom-economy-tracker-row", ".sogrom-tracker-tray"]) {
    for (const node of element.querySelectorAll(selector)) node.remove();
  }
  element.querySelector(".sheet-header-buttons.sogrom-has-tracker")?.classList.remove("sogrom-has-tracker");
}

/**
 * Inject the action economy tracker indicators into an actor sheet.
 * @param {ApplicationV2} app
 * @param {HTMLElement} element
 */
function onRenderActorSheet(app, element) {
  const actor = app.actor;
  if (!actor || !["character", "npc"].includes(actor.type)) return;
  if (!game.settings.get(MODULE_ID, SETTINGS.enabled)) return;

  removeExistingTrackers(element);

  const economy = getEconomy(actor);
  const indicators = Object.entries(ECONOMY_TYPES).map(([type, config]) => createIndicator(economy, type, config));

  const positionKey = actor.type === "character" ? SETTINGS.playerPosition : SETTINGS.npcPosition;
  const position = game.settings.get(MODULE_ID, positionKey);
  if (position === TRACKER_POSITIONS.portrait) injectPortraitTrackers(app, element, actor, indicators);
  else injectHeaderTrackers(element, actor, indicators);
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
  game.settings.register(MODULE_ID, SETTINGS.enabled, {
    name: "SOGROM.ACTIONTRACKER.Settings.Enabled.Name",
    hint: "SOGROM.ACTIONTRACKER.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    requiresReload: true
  });

  const positionChoices = {
    [TRACKER_POSITIONS.header]: "SOGROM.ACTIONTRACKER.Settings.TrackerPosition.Header",
    [TRACKER_POSITIONS.portrait]: "SOGROM.ACTIONTRACKER.Settings.TrackerPosition.Portrait"
  };

  game.settings.register(MODULE_ID, SETTINGS.playerPosition, {
    name: "SOGROM.ACTIONTRACKER.Settings.PlayerPosition.Name",
    hint: "SOGROM.ACTIONTRACKER.Settings.PlayerPosition.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: positionChoices,
    default: TRACKER_POSITIONS.portrait,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, SETTINGS.npcPosition, {
    name: "SOGROM.ACTIONTRACKER.Settings.NPCPosition.Name",
    hint: "SOGROM.ACTIONTRACKER.Settings.NPCPosition.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: positionChoices,
    default: TRACKER_POSITIONS.header,
    requiresReload: true
  });
});

Hooks.on("renderCharacterActorSheet", onRenderActorSheet);
Hooks.on("renderNPCActorSheet", onRenderActorSheet);
Hooks.on("combatTurnChange", onCombatTurnChange);
Hooks.on("deleteCombat", onDeleteCombat);
Hooks.on("dnd5e.postUseActivity", onPostUseActivity);
