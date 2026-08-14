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
        web-check deploy

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

uncertainty: build ## Every Uncertain value, sorted by how much it moves endurance
	# The project's research queue. A value here is one nobody has measured yet,
	# and the sort order says which one to go and measure first.
	@node tools/report-uncertainty.mjs

prose: ## No em dashes, and no bare "hybrid" in the documentation
	@node tools/check-prose.mjs

# --- the website -------------------------------------------------------------

web: ## Run the site locally
	@npm run dev --workspace @airship/web

web-build: ## Production build of the site
	@rm -rf apps/web/.next apps/web/out
	@npm run build --workspace @airship/web

web-lint: ## ESLint the site workspace
	@npm run lint --workspace @airship/web

web-type-check: ## TypeScript for the site
	@npm run type-check --workspace @airship/web

web-check: web-lint web-type-check web-build ## Every website check

deploy: check ## Build and ship to airship.diy
	@npx vercel deploy --prebuilt --prod

# --- aggregates --------------------------------------------------------------

clean: ## Remove build output
	rm -rf packages/*/dist apps/web/.next apps/web/out **/*.tsbuildinfo

check-fast: lint type-check test prose ## Everything except the slow suites

check: check-fast build validate report ## Everything CI runs
