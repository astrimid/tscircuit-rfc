# RFC: Pluggable & Enterprise-Secure Dependency Registry Architecture for `@tscircuit/runframe` (v2)

* **Status:** Proposed
* **Target Package:** `@tscircuit/runframe`
* **Authors:** Architecture Working Group (incorporating community feedback)

---

## 1. Context & Problem Statement

`@tscircuit/runframe` provides rich UI rendering and execution tools for circuit designs, which frequently require optional, heavy export converters (e.g., `circuit-json-to-lbrn`, `circuit-json-to-gerber`).

Currently, managing how these converters are fetched creates friction across three distinct operating environments:

1. **Online Web Playgrounds:** Require zero-install, always-up-to-date code fetched live over the network via a CDN.
2. **Standard Offline Apps:** Require deterministic, version-locked local builds (`node_modules`) using dynamic code splitting so users only load the converters they click on.
3. **Strict Enterprise Environments (Apple, Intel, etc.):** Trigger strict Supply Chain Security and Dependency Auditing. External packages must be explicitly white-listed.
* **The "All-or-Nothing" Bundle Problem:** If a registry hard-codes dependencies, and an enterprise rejects just *one* of them (e.g., LBRN), the entire registry gets blocked, breaking export functionality completely.
* **The Dynamic Import Security Flag:** Strict security scanners often flag dynamic imports (`import('y')`) as potential attack vectors for dependency confusion, preferring standard static imports (`import * as y from 'x'`) so the dependency graph is fully auditable.



Hardcoding network fetchers or bare dynamic imports inside the core `runframe` component creates architectural coupling, breaks bundlers (Vite/tsup), and fails strict corporate security audits.

---

## 2. Proposed Solution

We propose adopting a **Dependency Injection (DI) Registry Pattern**. `runframe` becomes entirely agnostic of *how* code is fetched. It only demands a tiny, shared TypeScript interface.

To support the three operating environments, the architecture defines a **3-Tier Registry Strategy**:

1. **CDN Registry (Provided):** Dynamically loaded via URLs for web apps.
2. **Dynamic Bundled Registry (Provided):** Statically bundled via Vite/tsup code-splitting, relying on `optionalDependencies` to allow enterprise consumers to explicitly `--omit` unvetted packages.
3. **Static Registry (Consumer-Authored):** Fully statically linked (`import * as`) by the enterprise consumer, passing the strictest security scanners.

---

## 3. Package Architecture & Dependencies

The system is split into multiple decoupled packages, ensuring core `runframe` carries zero converter dependencies.

```text
          ┌───────────────────────────────┐
          │  @tscircuit/converter-types   │ (Base Interface)
          └───────┬───────────────┬───────┘
                  │               │
                  ▼               ▼
    ┌───────────────────────┐   ┌───────────────────────────────────┐
    │  @tscircuit/runframe  │   │ Dependency Registries (Provided)  │
    └───────────────────────┘   │ - cdnDependencyRegistry           │
                                │ - bundledDependencyRegistry       │
                                └───────────────────────────────────┘

```

### 3.1. `@tscircuit/converter-types` (Base Primitive)

Defines the universal contract. Zero dependencies.

```json
{
  "name": "@tscircuit/converter-types",
  "version": "1.0.0",
  "dependencies": {}
}

```

### 3.2. `@tscircuit/runframe` (Core UI Component)

Accepts a registry via props. Has no knowledge of CDNs, local file systems, or converters.

```json
{
  "name": "@tscircuit/runframe",
  "version": "1.0.0",
  "dependencies": {
    "@tscircuit/converter-types": "^1.0.0"
  },
  "peerDependencies": {
    "react": "^18.0.0 || ^19.0.0"
  }
}

```

### 3.3. `@tscircuit/cdnDependencyRegistry`

Fetches converters live at runtime from the network CDN.

```json
{
  "name": "@tscircuit/cdnDependencyRegistry",
  "version": "1.0.0",
  "dependencies": {
    "@tscircuit/converter-types": "^1.0.0",
    "@tscircuit/internal-dynamic-import": "^1.0.0"
  }
}

```

### 3.4. `@tscircuit/bundledDependencyRegistry` (Offline with Opt-Outs)

Uses static literal strings for bundler chunks, but lists converters as **`optionalDependencies`**. This allows enterprise users to run `npm install --omit=optional` or explicitly exclude unapproved packages.

```json
{
  "name": "@tscircuit/bundledDependencyRegistry",
  "version": "1.0.0",
  "dependencies": {
    "@tscircuit/converter-types": "^1.0.0"
  },
  "optionalDependencies": {
    "circuit-json-to-gerber": "^1.0.0",
    "circuit-json-to-lbrn": "^1.0.0"
  }
}

```

---

## 4. Implementation Details

### The Shared Interface (`@tscircuit/converter-types`)

```typescript
export type ConverterName = "circuit-json-to-lbrn" | "circuit-json-to-gerber";

export interface ConverterRegistry {
  load(name: ConverterName): Promise<any>;
}

```

### The Bundled Implementation (`@tscircuit/bundledDependencyRegistry`)

Uses explicit switch-cases with literal strings for bundlers (tsup/Vite) and catches `MODULE_NOT_FOUND` errors if an enterprise user omitted the package.

```typescript
import { ConverterRegistry, ConverterName } from "@tscircuit/converter-types";

export class BundledDependencyRegistry implements ConverterRegistry {
  async load(name: ConverterName) {
    try {
      switch (name) {
        case "circuit-json-to-gerber":
          return await import("circuit-json-to-gerber");
        case "circuit-json-to-lbrn":
          return await import("circuit-json-to-lbrn");
        default:
          throw new Error(`Unsupported converter: ${name}`);
      }
    } catch (error: any) {
      // Gracefully handle if --omit was specified for security policies
      if (error.code === "MODULE_NOT_FOUND") {
        throw new Error(
          `The converter "${name}" is not installed in this environment. ` +
          `It may have been omitted due to corporate security policies.`
        );
      }
      throw error;
    }
  }
}

```

---

## 5. Consumer Usage (The 3 Tiers)

Consumers inject the appropriate registry class based on their environment's constraints.

### Tier 1: Online Web Playground (Zero-Config)

```tsx
import { RunFrame } from "@tscircuit/runframe";
import { CdnDependencyRegistry } from "@tscircuit/cdnDependencyRegistry";

export function WebPlayground() {
  return <RunFrame registry={new CdnDependencyRegistry()} />;
}

```

### Tier 2: Standard Offline / Desktop App

Uses dynamic chunks. Consumer can choose to omit unapproved packages during install.

```tsx
import { RunFrame } from "@tscircuit/runframe";
import { BundledDependencyRegistry } from "@tscircuit/bundledDependencyRegistry";

export function StandardDesktopApp() {
  return <RunFrame registry={new BundledDependencyRegistry()} />;
}

```

### Tier 3: Strict Enterprise Environment (Consumer-Authored Static Registry)

For hardware companies requiring 100% auditable dependency trees without dynamic `import()` execution. The consumer writes a 15-line custom registry in their own codebase, manually mapping vetted static imports.

```tsx
import { RunFrame } from "@tscircuit/runframe";
import { ConverterRegistry, ConverterName } from "@tscircuit/converter-types";

// Standard static imports pass corporate security scanners.
// LBRN is omitted entirely because the security team hasn't approved it.
import * as gerberConverter from "circuit-json-to-gerber";

export class StaticDependencyRegistry implements ConverterRegistry {
  async load(name: ConverterName) {
    switch (name) {
      case "circuit-json-to-gerber":
        return gerberConverter; // Returns statically linked code directly
      case "circuit-json-to-lbrn":
        throw new Error("Export to LBRN is disabled per enterprise security policy.");
      default:
        throw new Error(`Unsupported converter: ${name}`);
    }
  }
}

export function SecureHardwareDesktopApp() {
  return <RunFrame registry={new StaticDependencyRegistry()} />;
}

```

---

## 6. Benefits

1. **Enterprise Supply Chain Security:** By providing an interface rather than a rigid bundle, enterprises can explicitly opt-in to plugins using static imports, passing strict code scanners.
2. **Bundler Compliance:** Solves static analysis limits in Vite and `tsup` through literal-string switch routing and `optionalDependencies`.
3. **True Separation of Concerns:** Core `runframe` logic is decoupled from networking, build infrastructure, and heavy converter dependencies.
