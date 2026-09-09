import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MYDRION_CTA_EVENT_NAMES,
  isMydrionCtaEvent,
  isMydrionLeadEvent,
} from "../src/lib/googleEventTaxonomy.ts";
import {
  DEFAULT_GA_HOSTNAMES,
  parseGaHostnames,
  withGaHostnameScope,
} from "../src/lib/googleAnalyticsScope.ts";

test("taxonomia aceita somente CTAs comerciais da Mydrion", () => {
  assert.deepEqual(MYDRION_CTA_EVENT_NAMES, [
    "mydrion_cta_click",
    "organic_cta_click",
    "blog_cta_click",
  ]);
  for (const event of MYDRION_CTA_EVENT_NAMES) assert.equal(isMydrionCtaEvent(event), true);
  for (const event of ["click", "blog_internal_link_click", "ostrack_acimon_cta", "diagnostico_link_click"]) {
    assert.equal(isMydrionCtaEvent(event), false, event);
  }
  assert.equal(isMydrionLeadEvent("generate_lead"), true);
  assert.equal(isMydrionLeadEvent("diagnostico_whatsapp_click"), false);
});

test("consultas GA4 ficam restritas aos hosts institucionais da Mydrion", () => {
  assert.deepEqual(DEFAULT_GA_HOSTNAMES, ["www.mydrion.com.br", "mydrion.com.br"]);
  assert.deepEqual(parseGaHostnames(" www.mydrion.com.br,MYDRION.com.br,www.mydrion.com.br "), [
    "www.mydrion.com.br",
    "mydrion.com.br",
  ]);
  assert.deepEqual(parseGaHostnames(""), DEFAULT_GA_HOSTNAMES);

  const scoped = withGaHostnameScope({ dimensions: [{ name: "eventName" }] });
  assert.deepEqual(scoped.dimensionFilter, {
    filter: {
      fieldName: "hostName",
      inListFilter: { values: DEFAULT_GA_HOSTNAMES, caseSensitive: false },
    },
  });
});

test("rota resumida usa a mesma taxonomia Mydrion sem diagnostico legado", () => {
  const route = readFileSync("src/app/api/google-analytics/route.ts", "utf8");
  assert.match(route, /isMydrionCtaEvent/);
  assert.match(route, /isMydrionLeadEvent/);
  assert.doesNotMatch(route, /ctaClicks:\s*\["diagnostico_link_click"\]/);
  assert.doesNotMatch(route, /leads:\s*\["diagnostico_whatsapp_click"/);
});
