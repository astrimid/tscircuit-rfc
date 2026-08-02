# RFC: Context-Driven Power Domains and Semantic Decoupling Architecture

## 1. Summary

This RFC proposes a standard architecture for defining power delivery and component decoupling in `tscircuit`. By introducing a two-tier React Context pattern (`<PowerTree>` and `<PowerDomain>`) alongside semantic components (`<DecouplingNode>`), we can eliminate manual prop drilling, automate voltage-based Design Rule Checks (DRC), and enforce physical layout constraints without hardcoding manual `schX`/`schY` coordinates.

## 2. Motivation

Currently, designing robust circuits in code-first EDA often devolves into mirroring the worst aspects of visual EDA—manually calculating coordinates and endlessly repeating target references, pin names, and voltage parameters.

**Pain Points:**

* **Verbosity:** Placing a simple decoupling capacitor requires redeclaring the target IC, pin, capacitance, footprint, and voltage rating.
* **Fragility:** Changing a rail voltage (e.g., 1.2V to 1.8V) requires manually finding and updating the `maxVoltageRating` of every connected capacitor.
* **Layout Disconnect:** Intent is lost. A capacitor is placed near a pin manually rather than constrained programmatically, making the layout brittle during refactors.

## 3. Detailed Design

We propose a shift from **Component-Driven** placement to **Interface-Driven** domain modeling using React Context.

### 3.1. The Global Registry (`<PowerTree>`)

A top-level context provider that acts as the single source of truth for the board's power rails.

```tsx
type RailRegistry = Record<string, number>;
const BoardPowerContext = createContext<RailRegistry | null>(null);

export const PowerTree = ({ rails, children }: { rails: RailRegistry, children: React.ReactNode }) => (
  <BoardPowerContext.Provider value={rails}>
    {children}
  </BoardPowerContext.Provider>
);

```

### 3.2. The Local Domain (`<PowerDomain>`)

A wrapper placed around (or near) an IC that subscribes to the global tree and establishes a local context. Any semantic component placed inside it automatically knows which IC it belongs to and which rail it operates on.

```tsx
interface LocalDomainContext {
  targetRef: string;
  activeRail: string;
}
const TargetDomainContext = createContext<LocalDomainContext | null>(null);

export const PowerDomain = ({ targetRef, rail, children }) => (
  <TargetDomainContext.Provider value={{ targetRef, activeRail: rail }}>
    <group>{children}</group>
  </TargetDomainContext.Provider>
);

```

### 3.3. Semantic Nodes (`<DecouplingNode>`)

Instead of raw `<capacitor>` primitives, we introduce semantic wrappers that consume the context and apply standard hardware design rules.

```tsx
export const DecouplingNode = ({ name, targetPin, role, cap }) => {
  const board = useContext(BoardPowerContext);
  const domain = useContext(TargetDomainContext);

  if (!board || !domain) throw new Error("Must be inside <PowerTree> and <PowerDomain>");

  const { targetRef, activeRail } = domain;
  const railVoltage = board[activeRail];

  // Automated Layout & Electrical Constraints
  const minV = railVoltage * 2; // 2x voltage rating rule
  const maxTraceLength = role === "local" ? 2 : 10; // Strict loop constraints
  const footprint = role === "local" ? "0402" : "1206";

  return (
    <capacitor
      name={name}
      capacitance={cap}
      footprint={footprint}
      maxVoltageRating={minV}
      decouplingFor={`${targetRef}.pin.${targetPin}`}
      decouplingTo="GND" // Future: Contextual Ground Net
      maxDecouplingTraceLength={maxTraceLength}
    />
  );
};

```

## 4. Developer Experience (DX) Comparison

**Status Quo (Raw Primitives):**

```tsx
<capacitor name="C1" capacitance="100nF" footprint="0402" maxVoltageRating={6.6} decouplingFor="U1.pin.VDD_IO" maxDecouplingTraceLength={2} schX={-3} schY={0} />
<capacitor name="C2" capacitance="10uF" footprint="1206" maxVoltageRating={6.6} decouplingFor="U1.pin.VDD_IO" maxDecouplingTraceLength={10} schX={-3} schY={-2} />

```

**Proposed Architecture:**

```tsx
<PowerTree rails={{ "3V3": 3.3 }}>
  <chip name="U1" footprint="bga256" />

  <PowerDomain targetRef="U1" rail="3V3">
    <DecouplingNode name="C1" targetPin="VDD_IO" role="local" cap="100nF" />
    <DecouplingNode name="C2" targetPin="VDD_IO" role="bulk" cap="10uF" />
  </PowerDomain>
</PowerTree>

```

## 5. Benefits

1. **Hardware Dependency Injection:** Subcircuits can be instantiated without hardcoding power logic. A CPU module only needs to declare its `<PowerDomain>` requirements, and the parent motherboard satisfies them via `<PowerTree>`.
2. **Instant Refactoring:** Changing `"3V3": 3.3` to `"3V3": 5.0` instantly recalculates the `maxVoltageRating` (and subsequently, the valid BOM footprint) for every downstream capacitor in that domain.
3. **Built-in Verification:** The compiler enforces constraints. You cannot place a `local` bypass capacitor without it automatically constraining the trace routing to `2mm`.

## 6. Unresolved Questions

* **Net Generation:** Should the `<PowerDomain>` also automatically generate the `<trace>` or `<net>` connections for the power and ground pins, or should this context solely drive properties?
* **Ground Domains:** How should we handle split analog/digital grounds (e.g., `GNDA` vs `GND`) within the `<PowerDomain>` API?
* **Complex Filters:** Should this API be expanded to natively support `Pi` and `T` filters (e.g., injecting ferrite beads) based on IC datasheet guidelines?

---
