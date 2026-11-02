import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const read = (path) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

const stable = read("src/components/mg/fireTvStableMode.js");
const row = read("src/components/mg/ContinueWatchingRow.jsx");
const start = stable.indexOf("const moveContinueWatchingAction =");
const end = stable.indexOf("\nconst moveCard =", start);
assert.ok(start >= 0 && end > start, "Continue Watching handler must precede generic card navigation");

class Element {
  constructor() {
    this.card = null;
    this.classList = { contains: () => false };
  }
}

const setup = () => {
  const card = new Element();
  card.card = card;
  card.classList = { contains: (name) => name === "mg-fire-tv-resume-card" };
  const actions = Object.fromEntries(
    ["resume", "sources", "reviews", "player-options", "download"].map((key) => {
      const control = new Element();
      control.card = card;
      return [key, control];
    })
  );
  const root = new Element();
  root.querySelector = (selector) => {
    const match = selector.match(/data-mg-continue-([a-z-]+)="true"/);
    return match ? actions[match[1]] || null : null;
  };
  card.querySelector = (selector) =>
    selector === '[data-mg-continue-actions="true"]' ? root : null;

  let focused = null;
  const scope = {
    HTMLElement: Element,
    visible: (element) => element instanceof Element,
    cardFor: (element) => element?.card || null,
    focusNow: (element) => { focused = element; return !!element; },
  };
  vm.createContext(scope);
  vm.runInContext(stable.slice(start, end) + "\nglobalThis.navigate = moveContinueWatchingAction;", scope);
  return {
    card,
    actions,
    move: (current, direction) => {
      focused = null;
      const handled = scope.navigate(current, direction);
      return { handled, focused };
    },
  };
};

test("Fire TV poster Down enters the Continue Watching action grid; poster sideways remains card navigation", () => {
  const { card, actions, move } = setup();
  assert.deepEqual(move(card, "down"), { handled: true, focused: actions.resume });
  assert.deepEqual(move(card, "right"), { handled: false, focused: null });
  assert.deepEqual(move(card, "left"), { handled: false, focused: null });
  assert.deepEqual(move(card, "up"), { handled: false, focused: null });
});

test("all five Continue Watching options are reachable using D-pad directions", () => {
  const { card, actions, move } = setup();
  assert.deepEqual(move(actions.resume, "right"), { handled: true, focused: actions.sources });
  assert.deepEqual(move(actions.resume, "down"), { handled: true, focused: actions.reviews });
  assert.deepEqual(move(actions.sources, "down"), { handled: true, focused: actions["player-options"] });
  assert.deepEqual(move(actions["player-options"], "left"), { handled: true, focused: actions.reviews });
  assert.deepEqual(move(actions.reviews, "down"), { handled: true, focused: actions.download });
  assert.deepEqual(move(actions["player-options"], "down"), { handled: true, focused: actions.download });
  assert.deepEqual(move(actions.download, "up"), { handled: true, focused: actions.reviews });
  assert.deepEqual(move(actions.reviews, "up"), { handled: true, focused: actions.resume });
  assert.deepEqual(move(actions.sources, "up"), { handled: true, focused: card });
});

test("edge presses keep focus on action instead of skipping to another title", () => {
  const { actions, move } = setup();
  for (const [name, direction] of [
    ["resume", "left"], ["sources", "right"],
    ["reviews", "left"], ["player-options", "right"],
    ["download", "down"], ["download", "left"], ["download", "right"],
  ]) {
    const current = actions[name];
    assert.deepEqual(move(current, direction), { handled: true, focused: current });
  }
});

test("the stable navigator prioritises action focus and keeps each button's existing click handler", () => {
  assert.match(stable, /if \(moveContinueWatchingAction\(current, direction\)\)/);
  assert.ok(stable.indexOf("if (moveContinueWatchingAction(current, direction))") < stable.lastIndexOf("moveCard(current, direction)"));
  for (const action of ["resume", "sources", "reviews", "player-options", "download"]) {
    assert.match(row, new RegExp('data-mg-continue-' + action + '="true"'));
  }
  for (const action of ["resume", "sources", "reviews", "web-player", "download"]) {
    assert.ok(row.includes('data-mg-focus-key={`continue:${identityFor(meta)}:' + action + '`}'));
  }
  assert.match(row, /onClick=\{\(event\) => \{ void openTorrentSources\(item, event\); \}\}/);
  assert.match(row, /onClick=\{\(event\) => \{ void openReviews\(item, event\); \}\}/);
  assert.match(row, /onClick=\{\(event\) => \{ void openPlayerOptions\(item, event\); \}\}/);
  assert.match(row, /setDownloadPicker\(\{ item, meta \}\)/);
});
