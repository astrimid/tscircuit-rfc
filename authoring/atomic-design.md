Here is the Request for Comments (RFC) outlining the architecture, problem space, and proposed solution for the `circuit-atoms` library built on top of `tscircuit`.

```markdown
# RFC: circuit-atoms - A Declarative Semantic Layer for tscircuit

**Status:** Proposed  
**Author:** Hardware Architecture Team  
**Target Framework:** `@tscircuit/core`  
**Tags:** Architecture, Domain-Driven Design, PCB Routing, DRC, Schema  

---

## Summary
This RFC proposes the creation of `circuit-atoms`, a semantic, multi-domain abstraction library built on top of `@tscircuit/core`. It introduces a strict three-tier architecture (Atoms, Organisms, Subsystems) to decouple logical connectivity (schematic) from physical realization (PCB) and procurement (BOM). It solves the "RefDes Shifting" problem, enforces composition over configuration, and introduces mathematical Design Rule Checking (DRC) for hardware topologies.

---

## 1. Motivation and Problem Statement

As hardware design moves toward software-defined, declarative paradigms (JSX/TSX), traditional Electronic Design Automation (EDA) methodologies reveal several architectural friction points when applied to code-based generation:

### 1.1 The "RefDes Shifting" Problem
In standard EDA software, components are numbered incrementally (R1, R2, C1). In a declarative tree, inserting a new `<capacitor>` at the top of a file shifts the index of all subsequent capacitors. Because PCB layout engines map physical coordinates to RefDes identifiers, shifting `C2` to `C3` completely destroys existing PCB layouts.

### 1.2 Domain Conflation
Standard hardware primitives (`<capacitor>`, `<resistor>`) conflate three domains:
*   **Schematic:** Logical nets and symbols.
*   **PCB:** Footprints, physical placement, trace widths.
*   **BOM:** Manufacturer part numbers and tolerances.

When these are entangled, developers cannot change a filter's routing strategy without touching its logical netlist, making high-level components rigid and hard to reuse across different projects (e.g., prototype vs. mass production).

### 1.3 Lack of Reusable, Verifiable Topologies
A decoupling capacitor or an isolated gate-driver supply is not just a netlist—it is a physical topology with strict math (e.g., placement within $1.0mm$, isolated return paths, $\Delta V = I \cdot R$ voltage drop limits). Raw `tscircuit` provides primitives, but lacks semantic wrappers to enforce these engineering rules at compile time.

---

## 2. Discussion & Trade-offs

During the design phase, several approaches to composing complex ICs and their auxiliary passives were evaluated.

*   **Approach A: Configuration Objects (Rejected)**
    *   *Concept:* Pass configurations into chips: `<IC decaps={[{pin: "VDD", val: "1uF"}]} />`
    *   *Flaw:* This creates "black boxes." The IC component assumes ownership of its auxiliary passives, obscuring the netlist from the global DRC engine and limiting physical placement overrides.
*   **Approach B: Semantic Composition (Accepted)**
    *   *Concept:* Declare auxiliary passives as flat siblings using CSS-like selectors: `<Decap target=".U1.VDD" />`.
    *   *Benefit:* Complete decoupling. The chip knows nothing about its decaps. The board-level designer retains full control over the BOM and physical placement without altering the IC's internal code.

Furthermore, we must address **naming stability**. To solve RefDes shifting, we propose a Deterministic Path-Based Hashing mechanism backed by a `schematic.lock.json` file. A local ID (`<capacitor id="in_cap" />`) resolves to an absolute path (`board.vcore.power_filter.in_cap`), which is securely mapped to a stable RefDes (`C102`) across incremental builds.

---

## 3. Proposed Solution: The 3-Tier Architecture

We propose implementing `circuit-atoms` as a layered library over `@tscircuit/core`, strictly dividing hardware into three tiers.

### Layer 1: Atoms (Semantic Primitives)
Atoms are thin wrappers over base primitives. They automate net derivation and handle single-component roles without hiding the physical part.

**Example: `<Decap>`**
Instead of manually declaring nets and traces for every bypass capacitor, the Atom handles it via selectors.
```tsx
import { capacitor, trace, group } from "@tscircuit/core";

export const Decap = ({ name, target, to = "net.GND", value, pcbPlacement }) => (
  <group name={name}>
    <capacitor name={`${name}_C`} capacitance={value} net1={target} net2={to} {...pcbPlacement} />
  </group>
);

```

### Layer 2: Organisms (Topological Modules)

Organisms encapsulate multi-component, multi-node topologies. They are allowed to create *internal* intermediate nets that do not leak into the global scope. They enforce physical routing relationships (Vector Line-Topology).

**Example: `<DriverSupplyFilter>` (Isolated Reservoir)**
Splits a noisy driver pin from a clean LDO pin using a series resistor and local capacitor tank.

```tsx
export const DriverSupplyFilter = ({ name, cleanSource, isolatedTarget, resistorValue, capValue }) => {
  const isolatedNet = `net.${name}_DRV_ISO`; // Encapsulated internal net
  return (
    <group name={name}>
      {/* The narrow pipe: limits high-frequency transient draw from the clean rail */}
      <resistor name={`${name}_R`} resistance={resistorValue} net1={cleanSource} net2={isolatedNet} />
      {/* The local tank: provides instantaneous switching current */}
      <capacitor name={`${name}_C`} capacitance={capValue} net1={isolatedNet} net2="net.GND" />
      {/* Zero-impedance trace to the load */}
      <trace from={isolatedNet} to={isolatedTarget} />
    </group>
  );
};

```

### Layer 3: Subsystems (Intent & Verification)

Layer 3 introduces declarative abstractions for system-level routing, such as Power Trees. This decouples logical rail presence from physical manifestations (like copper pours).

**Example: `<Rail>` and `<RailConnection>**`

```tsx
<board>
  {/* Logical Rail Definition */}
  <Rail maxCurrent="10.0A" name="VSYS" nominal="12.6V" role="power"/>
  
  {/* Physical layout hint - decoupled from logic */}
  <Rail.PcbHint as="pour" layer="top" rail="VSYS"/>

  {/* DRC-verifiable component connection */}
  <RailConnection pin=".U_CHARGER" rail="VSYS"> .VSYS" role="power-in" maxCurrent="5.0A" />
</board>

```

---

## 4. Implementation Strategy

1. **Phase 1: Core Atoms & Lockfile mechanism**
* Implement `<Decap>`, `<PullUp>`, `<PullDown>`.
* Develop the `NamingProvider` and `schematic.lock.json` reconciler to ensure RefDes stability for `tscircuit` layouts.


2. **Phase 2: Standard Organisms**
* Implement `<DriverSupplyFilter>`, `<VoltageSenseDivider>`, `<PiFilter>`.
* Integrate mathematical DRC checks (e.g., throwing a compile error if $I_{max}^2 \cdot R$ exceeds the selected footprint's wattage).


3. **Phase 3: Subsystem & Rails**
* Implement the `Rail` registry to enable global power-tree analysis.



---

## 5. Open Questions & Unresolved Issues

1. **Selector Syntax:** `@tscircuit/core` is expanding its selector API. We need to ensure that querying pins by name (e.g., `.U1 > .VDD`) remains performant when deeply nested inside Organisms.
2. **BOM Context Propagation:** Designing the Context Provider (`<BomProvider>`) to allow deep shallow-merging of component specs (e.g., overriding all `0402` capacitors to `0603` for a specific `<BuckChannel>` instance) without breaking TypeScript prop types.

```

```
