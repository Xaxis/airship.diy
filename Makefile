# airship.diy: one entry point for everything.
#
# Every target here is also run by CI, so what a contributor runs locally and
# what the build runs cannot drift apart. If you add a check, add it to `check`
# and to .github/workflows/ci.yml in the same commit.
#
#   make            list targets
#   make check      everything CI runs
#   make validate   the model against every rigid airship that ever flew

SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help install build type-check lint test validate report uncertainty \
        prose check check-fast clean web web-build web-lint web-type-check \
        web-responsive-check operations \
        web-check deploy deploy-check citations og

help: ## List available targets
	@grep -hE '^[a-z][a-z-]*:.*?## ' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[1m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies exactly as the lockfile pins them
	# ci, never install. `npm install` may resolve a different tree than the
	# lockfile intends, and a physics model whose answer depends on when you
	# installed it is not a physics model.
	npm ci

# --- the model ---------------------------------------------------------------

build: ## Build every package
	# The solution file is named explicitly. A bare `tsc --build` resolves
	# tsconfig.json, which is the noEmit lint config, so it silently emits
	# NOTHING and exits 0. On a workstation that looks fine because dist/ is
	# already there from an earlier build; on a clean checkout the next step
	# cannot find what it just "built".
	@npx tsc --build tsconfig.build.json

type-check: ## TypeScript across the whole monorepo, forced
	@npx tsc --build tsconfig.build.json --force

lint: ## ESLint, including the three rules that enforce the project's premises
	# no-uncited-constant  a number without a source is a defect
	# no-duplicated-constant  and a sourced number still has to be read, not retyped
	# no-unqualified-hybrid  "hybrid" alone means hybrid LIFT and this ship is not that
	# no-cross-tier-import  the physics may not depend on a design point
	@npx eslint .

test: ## Unit and property tests
	@npx vitest run

validate: ## The model against published figures for ships that actually flew
	# This is the target that means something. Unit tests catch regressions;
	# this catches being wrong.
	@npx vitest run -t 'validation gate'

report: build ## Headless run of the physics. No browser, no bundler, no test runner.
	# The standing proof that packages/core has not acquired a dependency on
	# anything with a DOM. If this ever needs a shim, something has leaked in.
	@node tools/report-lift.mjs
	@node tools/report-loop.mjs
	@node tools/report-mission.mjs

og: build ## Regenerate the Open Graph card from the model's own figures
	# The card carries the hull length, the endurance and the gross weight. A
	# social card is the first thing anybody sees and the last thing anybody
	# thinks to regenerate, so it is generated rather than drawn.
	@node tools/generate-og.mjs

operations: build ## Regenerate docs/OPERATIONS.md from the model
	# An operating limit is a number the model computes, and a manual that
	# restates it by hand is a manual that will eventually disagree with the
	# vehicle. The prose lives in the generator; the numbers come from the same
	# functions the tests call.
	@node tools/generate-operations.mjs

uncertainty: build ## Every Uncertain value, sorted by how much it moves endurance
	# The project's research queue. A value here is one nobody has measured yet,
	# and the sort order says which one to go and measure first.
	@node tools/report-uncertainty.mjs

prose: ## No em dashes, and no bare "hybrid" in the documentation
	@node tools/check-prose.mjs

# --- the website -------------------------------------------------------------

web: build ## Run the site locally
	# `build` first: the site renders real model output at build time and
	# resolves the physics packages through their dist entry points.
	@npm run dev --workspace @airship/web

web-build: build ## Production build of the site
	@rm -rf apps/web/.next apps/web/out
	@npm run build --workspace @airship/web

web-lint: ## ESLint the site workspace
	@npm run lint --workspace @airship/web

# `build` first, like web-build. The site resolves @airship/* through the
# packages' published exports, which point at dist, so type-checking it on a
# clean checkout fails with "cannot find module" until the packages are built.
# This passed locally for a long time only because dist was already there from
# an earlier build, and CI caught it on a cold runner.
web-type-check: build ## TypeScript for the site
	@npm run type-check --workspace @airship/web

web-live-check: ## Load the DEPLOYED site in a real browser and assert it runs
	# The only check that catches a dead hydration. Every other check can pass
	# while the page is a corpse: correct HTML, a 200, a perfect screenshot, and
	# React threw on mount so nothing works. It also caught a WebGL failure
	# taking the whole page down rather than just one view.
	@node tools/check-web-live.mjs

web-responsive-check: ## Load every route at every width a phone actually has
	# A six-column table is correct HTML, correct CSS and correct data, and on a
	# 375 px screen it pushes the whole document sideways so every paragraph runs
	# off the edge. Nothing in a type check, a unit test or a desktop screenshot
	# sees it. This reports the OFFENDING ELEMENT, not just the overflow.
	@node tools/check-responsive.mjs

web-check: web-lint web-type-check web-build web-responsive-check ## Every website check

deploy: check web-build ## Build and ship to production
	# NOT `--prebuilt`. That flag ships `.vercel/output`, which only exists
	# after `vercel build`, and nothing here ever ran it: the target failed on
	# a clean tree and shipped stale output on a dirty one. Vercel builds from
	# vercel.json's own buildCommand instead, so what ships is what CI checked.
	@npx vercel deploy --prod --yes
	# VERIFY THE DEPLOY, because shipping is not the same as having shipped.
	# The site sat several commits stale for a day with every local check
	# green, and nothing in this file looked at what the public could read.
	@node tools/check-deployed.mjs
	@node tools/check-web-live.mjs $(LIVE_ORIGIN)

# Where production actually answers. NOT the apex domain: airship.diy is
# registered at Namecheap and its A record still points at the registrar's
# parking page, so it fails at the TLS handshake. Fixing that is a change to
# the DNS zone and nothing in this repository can do it.
LIVE_ORIGIN ?= https://airship-diy.vercel.app/

deploy-check: ## What is actually live, against what this tree would build
	@node tools/check-deployed.mjs

# --- aggregates --------------------------------------------------------------

clean: ## Remove build output
	rm -rf packages/*/dist apps/web/.next apps/web/out **/*.tsbuildinfo

check-fast: lint type-check test prose ## Everything except the slow suites

citations: build ## Citation integrity: every source id resolves. Fast.
	@node tools/report-uncertainty.mjs --fast

check: check-fast build validate report citations web-check ## Everything CI runs
	# IT NOW ACTUALLY IS, to the extent a single-threaded target can be. This
	# omitted citation integrity, which CI covers by running `make uncertainty`
	# in the validation job, and all four website checks, which CI runs in the
	# web job. A contributor whose `make check` was green could push a source id
	# that does not resolve and a site that does not build.
	#
	# What it runs is the FAST half of `uncertainty`: the integrity check, which
	# is instantaneous. The sensitivity sweep spawns two processes per uncertain
	# value and belongs in `make uncertainty`, which CI runs in full.
