
## TODO

Rough notes for initial development

- [ ] Move to durable task model
    - [I] Install package in core (emulator storage for now)
    - [ ] Create orchestrator subclass
    - [ ] Create action subclass
    - [ ] Implement command line action (to create a test project)
    - [ ] Exercize in fizz buzz sample.
- [ ] Implement local state persistence in hub
- [ ] Implement file layering in hub

## Later

- [ ] Expectations and context symbols
    - [ ] Include connected code in context
- [ ] Context
    - [ ] Vector search
    - [ ] This would also really benefit from vector search of code blocks.
    - [ ] Context information that store prompts for how the code in the project should be written.
        - i.e. Any time a Blazor component is requested. Assume the file ends with .razor
- [ ] Better path semantics for Blazor sample
