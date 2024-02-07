---
date: 2024-02-06
author: rebelzach using ChatGPT for feedback and revision
---
# ADR Revision: Caching and State Tracking in Action Calls

## Context

Wolder aims to facilitate changes in generator plans through state caching optimization. It's assumed that Wolder implements caching during action dispatch, creating a consistent caching interface. This approach is influenced by Microsoft's durable task library. The challenge lies in selecting a dispatch and caching method that offers clarity and ease of use for developers.

## Decision Drivers

- **Clarity**
- **Ease of Use**

## Options Considered

1. **Middleware-Based Dispatch**: Utilizes a middleware interface by Wolder, akin to the durable task library, to intercept action calls.
2. **Dynamic Proxy Library**: Employs libraries like Castle.DynamicProxy for intercepting actions marked with a specific interface or attribute.

## Decision

**Chosen Option**: Middleware-Based Dispatch. 
Choosing middleware-based dispatch aligns with the priorities of clarity and ease of use. This option maintains explicitness in how actions are intercepted and processed. Additionally, it offers flexibility and a clean separation of concerns, essential for maintainable and scalable development. There is a risk that middleware could make it more difficult for new developers to understand the workflow. These risks are hopefully outweighed by the risks presented by dynamic proxies, such as debugging challenges and confusion over expected behavior. 

## Evaluation

### Middleware-Based Dispatch

- **Pros**:
  - **Customizability**: Facilitates easy modifications to dispatch behaviors via middleware components.
  - **Separation of Concerns**: Isolates cross-cutting concerns like caching from generator logic.

- **Cons**:
  - **Complexity**: Adds system complexity, which might be challenging for those unfamiliar with middleware patterns.

### Dynamic Proxy Library

- **Pros**:
  - **Convenience**: Allows for interception of actions with minimal code changes.
  - **Flexibility**: Allows for making underlying behavior changes without requiring updating or version APIs.

- **Cons**:
  - **Debugging Difficulty**: Might obscure the debugging process, complicating error resolution.
  - **Cognitive Overload**: Increases the learning curve and cognitive load for developers.
