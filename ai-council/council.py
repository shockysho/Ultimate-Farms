"""AI Council Orchestrator - The Main Engine.

This is the core loop that runs the AI Advisory Council:
1. Problem Discovery - Claude identifies the next problem to explore
2. Angle Assignment - Claude creates specialized prompts for each advisor
3. Council Deliberation - All advisors respond in parallel
4. Synthesis - Claude synthesizes all perspectives
5. Stress Testing - Claude creates challenges, advisors respond
6. Bible Update - Claude updates the master document
7. Next Problem - Claude identifies what to explore next
8. Repeat forever
"""

import asyncio
import json
import logging
import random
from datetime import datetime, timezone

from config import (
    COUNCIL_SIZE,
    CYCLE_INTERVAL,
    MAX_CYCLES,
    ProviderConfig,
    get_available_providers,
    get_chairman_config,
)
from providers import AdvisorResponse, query_advisor, query_claude
from roles import ADVISOR_ROLES, CHAIRMAN_SYSTEM
from bible import (
    load_bible,
    load_project_context,
    save_bible,
    save_session_log,
)

logger = logging.getLogger("council")


class CouncilOrchestrator:
    """Manages the autonomous AI Council deliberation loop."""

    def __init__(self):
        self.chairman_config = get_chairman_config()
        self.advisor_providers = get_available_providers()
        self.project_context = load_project_context()
        self.bible = load_bible()
        self.cycle_count = 0
        self.problems_explored = []
        self.open_questions = []

        if not self.advisor_providers:
            raise ValueError(
                "No advisor AI providers configured. "
                "Set at least one of: OPENAI_API_KEY, GOOGLE_API_KEY, "
                "MOONSHOT_API_KEY, OPENROUTER_API_KEY in your .env file."
            )

        logger.info(
            f"Council initialized: Chairman=Claude, "
            f"Advisors={[p.name for p in self.advisor_providers]}"
        )

    async def run(self):
        """Main loop - runs the council indefinitely."""
        logger.info("=" * 70)
        logger.info("AI COUNCIL ACTIVATED")
        logger.info(f"  Chairman: Claude ({self.chairman_config.model})")
        logger.info(f"  Advisors: {[p.name for p in self.advisor_providers]}")
        logger.info(f"  Cycle interval: {CYCLE_INTERVAL}s")
        logger.info(f"  Max cycles: {'infinite' if MAX_CYCLES == 0 else MAX_CYCLES}")
        logger.info("=" * 70)

        while True:
            self.cycle_count += 1

            if MAX_CYCLES > 0 and self.cycle_count > MAX_CYCLES:
                logger.info(f"Reached max cycles ({MAX_CYCLES}). Stopping.")
                break

            logger.info(f"\n{'=' * 70}")
            logger.info(f"COUNCIL CYCLE #{self.cycle_count}")
            logger.info(f"{'=' * 70}")

            try:
                await self._run_cycle()
            except Exception as e:
                logger.error(f"Cycle #{self.cycle_count} failed: {e}", exc_info=True)

            if MAX_CYCLES > 0 and self.cycle_count >= MAX_CYCLES:
                break

            logger.info(f"\nSleeping {CYCLE_INTERVAL}s until next cycle...")
            await asyncio.sleep(CYCLE_INTERVAL)

    async def _run_cycle(self):
        """Execute a single council deliberation cycle."""
        session_log = []
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        session_log.append(f"# Council Cycle #{self.cycle_count}\n")
        session_log.append(f"**Timestamp:** {timestamp}\n")

        # ── Phase 1: Problem Discovery ──────────────────────────────────
        logger.info("\n── Phase 1: Problem Discovery ──")
        problem = await self._discover_problem()
        logger.info(f"Problem identified: {problem[:100]}...")
        session_log.append(f"\n## Problem Identified\n\n{problem}\n")

        # ── Phase 2: Assign Angles & Query Advisors ─────────────────────
        logger.info("\n── Phase 2: Assigning Angles ──")
        assignments = await self._assign_angles(problem)
        session_log.append(f"\n## Advisor Assignments\n\n{assignments}\n")

        # ── Phase 3: Council Deliberation ───────────────────────────────
        logger.info("\n── Phase 3: Council Deliberation ──")
        responses = await self._deliberate(problem, assignments)
        for r in responses:
            status = "OK" if r.success else f"FAILED: {r.error}"
            session_log.append(
                f"\n### {r.provider_name} as {r.role} [{status}]\n\n"
                f"{r.response[:3000] if r.response else 'No response'}\n"
            )

        # ── Phase 4: Synthesis ──────────────────────────────────────────
        logger.info("\n── Phase 4: Synthesis ──")
        synthesis = await self._synthesize(problem, responses)
        logger.info(f"Synthesis complete ({len(synthesis)} chars)")
        session_log.append(f"\n## Chairman's Synthesis\n\n{synthesis}\n")

        # ── Phase 5: Stress Testing ─────────────────────────────────────
        logger.info("\n── Phase 5: Stress Testing ──")
        stress_challenges = await self._create_stress_tests(problem, synthesis)
        session_log.append(f"\n## Stress Test Challenges\n\n{stress_challenges}\n")

        stress_responses = await self._run_stress_tests(stress_challenges)
        for r in stress_responses:
            status = "OK" if r.success else f"FAILED: {r.error}"
            session_log.append(
                f"\n### Stress Response: {r.provider_name} [{status}]\n\n"
                f"{r.response[:3000] if r.response else 'No response'}\n"
            )

        # ── Phase 6: Final Synthesis & Bible Update ─────────────────────
        logger.info("\n── Phase 6: Bible Update ──")
        updated_bible = await self._update_bible(
            problem, synthesis, stress_responses
        )
        self.bible = updated_bible
        save_bible(updated_bible)
        session_log.append(f"\n## Bible Updated\n\nBible has been updated.\n")

        # Save session log
        save_session_log(self.cycle_count, "\n".join(session_log))

        self.problems_explored.append(problem[:200])
        logger.info(f"Cycle #{self.cycle_count} complete.")

    async def _discover_problem(self) -> str:
        """Phase 1: Claude identifies the next problem to explore."""
        explored = "\n".join(
            f"- {p}" for p in self.problems_explored[-20:]
        ) or "None yet - this is the first cycle."

        prompt = f"""Review the current state of the Ultimate Farms project and the Project Bible.

PROJECT CONTEXT (documentation, schemas, architecture):
{self.project_context[:8000]}

CURRENT PROJECT BIBLE:
{self.bible[:6000]}

PREVIOUSLY EXPLORED PROBLEMS:
{explored}

YOUR TASK:
Identify the single most important problem, question, or area that the council should explore next. This should be:
1. Something NOT already thoroughly addressed in the Bible
2. Something that would significantly impact the project's success
3. Something that benefits from multiple expert perspectives

Output ONLY the problem statement (2-4 sentences). Be specific and concrete. Frame it as a question or challenge the council needs to solve."""

        return await query_claude(self.chairman_config, CHAIRMAN_SYSTEM, prompt)

    async def _assign_angles(self, problem: str) -> str:
        """Phase 2: Claude assigns specific angles to each advisor."""
        available_roles = list(ADVISOR_ROLES.keys())
        advisors = [p.name for p in self.advisor_providers[:COUNCIL_SIZE]]

        prompt = f"""You need to assign advisor roles for this problem:

PROBLEM: {problem}

AVAILABLE AI ADVISORS: {json.dumps(advisors)}

AVAILABLE ROLES (pick the most relevant for THIS specific problem):
{json.dumps({name: role['angle'] for name, role in ADVISOR_ROLES.items()}, indent=2)}

Assign exactly one role to each advisor. Pick roles that will create the most productive tension and diverse perspectives for THIS specific problem.

Output as JSON only:
{{"assignments": [{{"advisor": "name", "role": "role_name", "specific_prompt": "A 2-3 sentence prompt tailored to this specific problem and this advisor's role. Be specific about what angle to explore."}}]}}"""

        response = await query_claude(self.chairman_config, CHAIRMAN_SYSTEM, prompt)

        # Store for later use
        self._current_assignments = response
        return response

    async def _deliberate(
        self, problem: str, assignments_raw: str
    ) -> list[AdvisorResponse]:
        """Phase 3: Send prompts to all advisors in parallel."""
        # Parse assignments
        try:
            # Find JSON in the response
            start = assignments_raw.find("{")
            end = assignments_raw.rfind("}") + 1
            assignments = json.loads(assignments_raw[start:end])["assignments"]
        except (json.JSONDecodeError, KeyError, ValueError) as e:
            logger.warning(f"Failed to parse assignments, using fallback: {e}")
            assignments = self._fallback_assignments()

        tasks = []
        for assignment in assignments[: COUNCIL_SIZE]:
            # Find the matching provider
            provider = next(
                (p for p in self.advisor_providers if p.name == assignment["advisor"]),
                None,
            )
            if not provider:
                # Use first available provider
                provider = self.advisor_providers[
                    len(tasks) % len(self.advisor_providers)
                ]

            role_name = assignment.get("role", "General Advisor")
            role_data = ADVISOR_ROLES.get(role_name, {})
            system_prompt = role_data.get("system", f"You are a {role_name}.")
            specific_prompt = assignment.get("specific_prompt", "")

            full_prompt = f"""PROBLEM FOR THE COUNCIL:
{problem}

PROJECT CONTEXT (key details):
{self.project_context[:4000]}

YOUR SPECIFIC ASSIGNMENT:
{specific_prompt}

Provide a thorough analysis from your perspective. Be specific, cite concrete examples, and don't hold back on criticism or unconventional ideas. End with 2-3 specific recommendations and any new questions this raises."""

            tasks.append(
                query_advisor(provider, role_name, system_prompt, full_prompt)
            )

        return await asyncio.gather(*tasks)

    async def _synthesize(
        self, problem: str, responses: list[AdvisorResponse]
    ) -> str:
        """Phase 4: Claude synthesizes all advisor perspectives."""
        advisor_inputs = "\n\n---\n\n".join(
            f"### {r.provider_name} (as {r.role}):\n{r.response}"
            for r in responses
            if r.success
        )

        prompt = f"""You are synthesizing the AI Council's deliberation.

PROBLEM EXPLORED:
{problem}

ADVISOR RESPONSES:
{advisor_inputs}

YOUR TASK - Synthesize these perspectives into:

1. **Key Insights** - The 3-5 most important insights that emerged across perspectives
2. **Points of Agreement** - Where advisors converge
3. **Points of Tension** - Where advisors disagree, and why both sides have merit
4. **Blind Spots Identified** - What no one addressed but should be considered
5. **Preliminary Recommendations** - Concrete next steps, ranked by impact
6. **Questions to Stress-Test** - 3 specific challenges to throw back at the council

Be ruthlessly honest. Don't smooth over real disagreements. The value is in the tension between perspectives."""

        return await query_claude(self.chairman_config, CHAIRMAN_SYSTEM, prompt)

    async def _create_stress_tests(self, problem: str, synthesis: str) -> str:
        """Phase 5: Claude creates stress-test challenges."""
        prompt = f"""Based on this synthesis, create targeted stress tests.

ORIGINAL PROBLEM: {problem}

SYNTHESIS:
{synthesis}

Create exactly 3 stress-test scenarios that would break, challenge, or reveal weaknesses in the recommendations. Each should be:
- A specific, concrete scenario (not abstract)
- Designed to expose a hidden assumption or failure mode
- Something that could realistically happen

Format each as a numbered challenge that can be sent to an advisor."""

        return await query_claude(self.chairman_config, CHAIRMAN_SYSTEM, prompt)

    async def _run_stress_tests(self, challenges: str) -> list[AdvisorResponse]:
        """Phase 5b: Send stress tests to advisors."""
        # Pick a subset of advisors for stress testing
        providers = self.advisor_providers[:min(3, len(self.advisor_providers))]
        roles = list(ADVISOR_ROLES.keys())

        tasks = []
        for i, provider in enumerate(providers):
            role_name = random.choice(roles)
            role_data = ADVISOR_ROLES[role_name]

            prompt = f"""STRESS TEST for the AI Council:

The council has been exploring Ultimate Farms / FarmOS and reached preliminary conclusions. Your job is to BREAK these conclusions by responding to these stress-test challenges:

{challenges}

Respond to ALL challenges. For each:
1. Explain how this scenario breaks or weakens the current approach
2. Propose how to handle it
3. Rate severity (Critical / High / Medium / Low)

Be aggressive in your analysis. Find the weak points."""

            tasks.append(
                query_advisor(provider, role_name, role_data["system"], prompt)
            )

        return await asyncio.gather(*tasks)

    async def _update_bible(
        self,
        problem: str,
        synthesis: str,
        stress_responses: list[AdvisorResponse],
    ) -> str:
        """Phase 6: Claude updates the Project Bible."""
        stress_input = "\n\n---\n\n".join(
            f"### {r.provider_name} stress response:\n{r.response}"
            for r in stress_responses
            if r.success
        )

        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

        prompt = f"""Update the Project Bible with insights from this council cycle.

CURRENT BIBLE:
{self.bible}

THIS CYCLE'S PROBLEM:
{problem}

SYNTHESIS OF ADVISOR PERSPECTIVES:
{synthesis}

STRESS TEST RESULTS:
{stress_input}

CYCLE NUMBER: {self.cycle_count}
TIMESTAMP: {timestamp}

YOUR TASK:
Return the COMPLETE updated Bible document. You must:
1. Update the "Last updated" timestamp
2. Update the Executive Summary if this cycle produced significant insights
3. Add any new architecture decisions to "Core Architecture Decisions"
4. Move fully resolved problems to "Solved Problems" with their solutions
5. Update "Active Investigations" with current explorations
6. Add new entries to "Risk Register" if risks were identified
7. Update "Open Questions" (add new ones, remove answered ones)
8. Add stress test results to "Stress Test Results"
9. Add rejected approaches to "Rejected Approaches" with reasoning
10. Update "Implementation Priorities" if priorities shifted
11. Add a brief entry to "Session Log" for this cycle

IMPORTANT: Return the FULL document, not just changes. Maintain all existing content that is still valid. The document should grow richer with each cycle."""

        return await query_claude(self.chairman_config, CHAIRMAN_SYSTEM, prompt)

    def _fallback_assignments(self) -> list[dict]:
        """Generate fallback assignments if parsing fails."""
        roles = list(ADVISOR_ROLES.keys())
        random.shuffle(roles)
        return [
            {
                "advisor": p.name,
                "role": roles[i % len(roles)],
                "specific_prompt": (
                    "Analyze this problem from your unique perspective. "
                    "Be specific, practical, and don't hold back on criticism."
                ),
            }
            for i, p in enumerate(self.advisor_providers[:COUNCIL_SIZE])
        ]
