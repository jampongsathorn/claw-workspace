# Model Overrides (empty at launch)

Per-model adaptations live here as `prompts/model/<model>.md`.

Rules:

- Create an override only when an evaluation shows a model-specific gap (release type T2 — model generation retune).
- An override may tune wording or emphasis; it must never weaken a frozen core section or the authorization / safety / verification / honesty contract.
- An override is assembled after the surface module and before the dynamic tail.
- A plain model swap (same family, T1) usually needs NO override — the environment block carries the model identity.
