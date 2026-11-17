import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { themeScript } from "./theme-script.ts";
for (const scenario of [
  {
    name: "first visit defaults to light despite dark OS",
    pref: null,
    system: true,
    expected: "light",
  },
  {
    name: "saved dark preference overrides light system",
    pref: "dark",
    system: false,
    expected: "dark",
  },
  {
    name: "saved light preference overrides dark system",
    pref: "light",
    system: true,
    expected: "light",
  },
  {
    name: "legacy system preference defaults to light",
    pref: "system",
    system: true,
    expected: "light",
  },
  {
    name: "invalid preference defaults to light",
    pref: "unknown",
    system: false,
    expected: "light",
  },
  {
    name: "blocked storage defaults to light without failing",
    pref: null,
    system: true,
    expected: "light",
    blocked: true,
  },
])
  test(scenario.name, () => {
    const root = { dataset: {}, style: {} };
    vm.runInNewContext(themeScript, {
      document: { documentElement: root },
      localStorage: {
        getItem() {
          if (scenario.blocked) throw Error("Blocked");
          return scenario.pref;
        },
      },
      matchMedia: () => ({ matches: scenario.system }),
    });
    assert.equal(root.dataset.theme, scenario.expected);
    assert.equal(root.style.colorScheme, scenario.expected);
  });
