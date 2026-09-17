TODO for the human:

- [ ] Add better information about how to setup environments
- [ ] Add better information about the core commands
- [x] Remove redundant exports of wolder, wolder should come from core only
- [x] Some kind of boundary protection so that scopes don't collide.
- [x] Does the manifest really need the expectations in it? (Expectations are gone entirely.)
- [x] The sample has gitignores for gen files... (Samples now ignore exactly the agents'
      regions, and nothing else; the programs themselves are tracked.)
- [x] Move the webpage pieces into an example library that uses wolder core.
      (`@wolder/browser` was deleted with the expectation API; whatever replaces it arrives
      with the future expect-and-test pattern.)
- [x] Base cache keys off of the entire builder chain

Left open from the v2 plan (`PLAN.md` §8), decided but worth revisiting with evidence:

- [ ] Negotiation currently shows both sides everything. Narrower framings are an
      optimisation for once there is evidence about what contracts get wrong.
- [ ] Contract files are not rolled back if the provider's main run later fails. They are
      the agreement, already recorded — the next attempt should build on them.
- [ ] The expect-and-test pattern. Deliberately out of scope for v2; it should arrive as a
      plugin on top of a working v2, not as a constraint on its design.
- [ ] `@wolder/core` is the repository root rather than a workspace member, so packages
      depend on it with `file:../..`. Moving it to `packages/core/` would make plain `*`
      work everywhere.
