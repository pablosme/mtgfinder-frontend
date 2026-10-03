# Project Agent Instructions

These instructions apply to the entire Angular 21 frontend repository.

## Project Context

- This repository contains the Angular 21 frontend for MTGFinder.
- The backend API repository is located at `~/projects/mtg/mtgfinder-api`.
- Resolve `~` to the current user's home directory when accessing the API repository.
- When implementing API integrations, inspect the backend controllers, request and response models, validation rules, and authentication configuration as needed.
- Use the backend source to confirm endpoint paths, HTTP methods, payloads, and response formats. Do not invent API contracts.
- Changes to the backend must follow its own `AGENTS.md` instructions.

## Angular and TypeScript

- Use Angular 21 APIs and follow the conventions already established in the project.
- Prefer standalone components for new components.
- Use Angular's built-in control flow (`@if`, `@for`, and `@switch`).
- Use signals for synchronous reactive state and RxJS for asynchronous streams when appropriate.
- Keep TypeScript types explicit at component boundaries and API interfaces. Avoid `any`.
- Use Angular dependency injection and `HttpClient` for API integrations.
- Keep backend URLs in the project's existing configuration mechanism.
- Keep templates focused on presentation. Put business logic and data transformations in TypeScript.
- Reuse existing components, styles, and services before introducing alternatives.
- Preserve accessibility and responsive behavior.
- If SSR or prerendering is enabled, guard browser-only APIs such as `window`, `document`, and `localStorage`.

## Tests

- Do not create unit tests unless the user explicitly requests them.
- Existing tests may be inspected or run when useful for validation, but new unit test files or test cases must not be added without an explicit request.
- Use the existing build, type checking, and lint commands when appropriate for validation.

## Function Design

- Do not fragment a single action into multiple small functions when that would make the project harder to navigate.
- Keep the steps of an action together when they are only used as part of that action.
- Create a new function only when at least one of the following is true:
    - The logic will be reused.
    - The function isolates a fully self-contained responsibility with a clear boundary, such as executing a request, converting data, parsing input, or interacting with an external system.
- Do not extract functions solely to shorten another function or to give every individual step its own name.
- Apply the same principle when creating services: each service must have a clear responsibility.

## Model Organization

- Keep each independently meaningful API request, response, domain model, or projection in its own source file.
- Use TypeScript interfaces or types according to the project's existing conventions.
- A supporting type may remain in the same file only when it belongs exclusively to the enclosing model.
- Do not declare independently meaningful models inside components, services, or unrelated implementation files.
- Keep API transport models separate from view models when their structures or responsibilities differ.

## Complex Task Memory — Highest Priority

This is the highest-priority project-specific working rule.

- For every complex request, use the frontend repository-root `agent_task/` directory as temporary working memory.
- Before implementing a complex request, create a dedicated Markdown file at `agent_task/<task-name>.md` containing the detailed task instructions and execution plan.
- Break the task into executions. Each execution must represent a logical group of related work and contain a checklist of concrete steps.
- Mark each checklist step as it is completed so the file always reflects the current state of the task and clearly identifies the next step.
- Keep the task file updated when discoveries, constraints, decisions, or changes to the plan affect the remaining work.
- For work involving the API, record the relevant backend files, confirmed contracts, and any required backend changes.
- At the end of each execution, give the user a compact, short briefing that states:
    - What was completed in the execution.
    - What the next execution will cover.
- After sending the briefing, continue with the next execution unless user input or approval is required.
- Treat files under `agent_task/` as temporary local coordination files. They must not be committed.

A task is complex when it involves multiple logical phases, broad or cross-cutting changes, significant investigation, or enough steps that progress could become difficult to track reliably without a written plan.

Use this structure for task memory files:

    # Task: <name>

    ## Instructions

    <Detailed task requirements, constraints, and relevant context.>

    ## Execution 1: <logical group>

    - [ ] Step 1
    - [ ] Step 2

    ## Execution 2: <logical group>

    - [ ] Step 1
    - [ ] Step 2

    ## Notes and Decisions

    - <Important discovery, constraint, or decision.>
