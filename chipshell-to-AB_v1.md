# RFC: Non-1:1 Logical/Physical Relationships in tscircuit

## Status
Draft for discussion. Not yet implemented. Synthesizes three rounds of design
discussion into one proposal.

## 1. Problem Statement

tscircuit models a design as a single React component tree that simultaneously
drives schematic, PCB, BOM, and (optionally) simulation views. This works
because tscircuit assumes each component in the tree corresponds to exactly
one logical function, one physical device, and one BOM line.

That assumption breaks in real hardware:

- **Multiple-element parts**: one physical package contains multiple
  independent logical functions (dual/quad op-amps, multi-gate logic ICs,
  multiple MOSFETs in one package). Cardinality: N logical → 1 physical.
- **Distributed implementations**: one logical function is realized by
  multiple physical parts (parallel resistors, distributed decoupling
  capacitance). Cardinality: 1 logical → N physical.
- **Simulation-only or schematic-only elements**: a SPICE macromodel may not
  map 1:1 to a schematic symbol (coupled inductors, shared parasitics); some
  schematic groupings (a named filter stage) have no physical presence at
  all.
- **Analysis without mutation**: building a simulation testbench around a
  real device (parameter sweeps, corner-case tolerance testing) must not be
  able to alter the canonical design the PCB and BOM are generated from.

tscircuit currently has no first-class way to express these relationships
while preserving its central principle: one authored tree, multiple derived
views, all traceable to a single underlying data model.

This proposal treats that underlying data model — circuit-JSON — as the
actual source of truth, and the React tree as an authoring surface over it.
Two consumer-facing halves follow from that: a **synthesis API** (writing
circuit-JSON, ergonomic component authoring) and an **analysis API**
(read-only querying with local, non-destructive overrides). Sections 3 and 5
below cover each.

## 2. Terminology (aligned to ASME Y14.44 / IEEE 315)

Rather than invent new vocabulary, this proposal borrows from existing
reference-designation and schematic-symbol standards, since they already
define most of the concepts needed here.

| Term | Source | Definition | Role in this proposal |
|---|---|---|---|
| **Reference designator (refdes)** | ASME Y14.44 | Identifier for a physical device on the board, e.g. `U1`, `R1` | The `<chip>`'s `name`, composed with element suffixes |
| **Multiple-element part** | ASME Y14.44-2008 §2.1.4 | A single physical part containing more than one portion that must be distinguished on diagrams (e.g. a dual electron tube, a multi-gate IC) | What a `<chip>` with more than one child in `<internalcircuit>` represents |
| **Element** | ASME Y14.44-2008 §2.1.4 | A portion of a multiple-element part, identified by a suffix letter (A, B, C… skipping I and O) appended to the base refdes, e.g. `V2A`/`V2B`, `U1A`/`U1B` | An internal component declared inside `<internalcircuit>` |
| **Symbol** | IEEE 315 | The schematic graphic for an element or device | A schematic-view element (`schX`/`schY`/`schDisplay`) |
| **Device / Part** | Common EDA + IPC-2612 usage | The orderable physical item | The `<chip>` itself: footprint + MPN + manufacturer |
| **Footprint** | IPC-7351 | The physical land pattern for a device | `<chip>`'s `footprint` attribute |

Note on "unit": Y14.44 reserves "unit" for a different concept — a major
building block of a set or system (e.g. a power supply, a receiver),
numbered rather than lettered (e.g. the "3" in "3A1"). It is not the correct
term for the A/B/C sub-parts of a single part, so this proposal avoids it in
that sense. "Section," used in an earlier draft of this document, is not a
Y14.44 component term at all — it refers only to divisions of the standard's
own text (e.g. its own Section 2, Section 5) — and is reserved below for
divisions of *this* document, to avoid the same ambiguity.

Key standards alignment: ASME Y14.44-2008 §2.1.4 (Suffix Letter, part of the
Unit Numbering Method) prescribes that a multiple-element part's elements
share **one refdes with lettered suffixes** (`U1A`, `U1B`), and that elements
sharing a refdes must be portions of the *same physical part*. §3.2 below
satisfies this constraint structurally via containment (see §4.3), which is
a meaningfully stronger guarantee than enforcing it by convention.

## 3. Synthesis: Authoring via Containment

### 3.1 Core primitive: `<chip>` / `<internalcircuit>`

A `<chip>` represents a physical package. It always owns exactly one PCB
footprint and one BOM line. An optional `<internalcircuit>` child describes
the chip's schematic-level internal structure — content that renders **only**
on the schematic, never as a separate PCB entity.

```tsx
<chip name="U1" footprint="soic8" mpn="LM358" manufacturer="TI" />
```

For the common 1:1 case, this is the entire API — no `<internalcircuit>`
needed, and existing single-device tscircuit components require no changes.

### 3.2 Multiple-element parts

```tsx
<chip name="Q203" footprint="sot363" mpn="DMN65D8LDW" manufacturer="Diodes Inc.">
  <internalcircuit>
    <mosfet
      name="A"                 // composes to refdes "Q203A"
      channelType="n"
      schX={-20} schY={15}
      pinMapping={{ gate: "pin2", source: "pin1", drain: "pin6" }}
    />
    <mosfet
      name="B"                 // composes to refdes "Q203B"
      channelType="n"
      schX={35} schY={-10} schRotation={180}
      pinMapping={{ gate: "pin5", source: "pin4", drain: "pin3" }}
    />
  </internalcircuit>
</chip>
```

The PCB gets one SOT-363 footprint. The schematic gets two independently
positioned MOSFET symbols, each its own element of the multiple-element part
`Q203`, with a derived refdes suffix. `pinMapping` links each element's
terminal to a physical pin number on the chip.

Because both elements are declared as children of the same `<chip>`, Y14.44
§2.1.4's same-refdes-same-part constraint holds by construction — there is
no way to author two elements that disagree about which physical part they
belong to, since there is only one `<chip>` node they could be nested under.
This is a stronger guarantee than reference-based identity (an earlier draft
of this proposal used a shared device object reference for this purpose;
containment makes that object unnecessary for the N-logical-to-1-physical
case).

### 3.3 Distributed implementations (1 logical → N physical)

Containment does not naturally extend to the inverse case: a single logical
function realized by multiple co-equal physical instances (parallel
resistors, split decoupling capacitance). A logical resistor is not a box
containing sub-parts the way a chip is; it is one function with multiple
physical realizations. This proposal does not yet have a mechanism for this
case — flagged as an open question in §6, likely resolved via an explicit
`physicalInstances` prop rather than nesting.

### 3.4 View-specific single components: `schOnly` / `pcbOnly`

For components with no counterpart in another view (test points, mounting
holes), boolean flags extend tscircuit's existing `sch*`/`pcb*` prop-prefix
convention rather than introducing a new wrapper primitive:

```tsx
<testpoint name="TP1" schOnly={true} />
<mountinghole name="H1" pcbOnly={true} />
```

`pcbOnly` is valid only at the top level of a design, not inside
`<internalcircuit>` — a physical thing nested inside a package that is not
itself part of that package's footprint is not physically meaningful, so
this is a compile-time restriction rather than a documentation note.

For view-specific *groups* of elements (larger than a single flagged
component — e.g. schematic-only frame/annotation blocks), a `<View
target="schematic" | "pcb">` wrapper remains available as a secondary
mechanism, but is not the primary API for the common single-element case.

### 3.5 Visibility control: `schDisplay`

```tsx
<chip name="U1" footprint="qfn32" schDisplay="collapsed">
  <internalcircuit>...</internalcircuit>
</chip>
```

`"expanded"` (default when `<internalcircuit>` present) shows internal
elements individually; `"collapsed"` shows one block symbol with pins;
`"hidden"` omits the chip from the schematic entirely (rare; for
PCB-only mechanical parts).

### 3.6 Escape hatch: raw circuit-JSON injection

For synthesis cases the higher-level API doesn't yet cover, a component can
inject circuit-JSON directly and layer schematic-only rendering on top,
using the parent's coordinate space:

```tsx
const DualMosfet = ({ name, q1Layout, q2Layout }) => {
  const pcbId = `part_${name}`;
  return (
    <>
      <circuitjson payload={[{ type: "pcb_component", id: pcbId, footprint: "soic8" }]} />
      <group {...q1Layout}>
        <schematic_unit part={pcbId} symbol="mosfet" schX={0} schY={0} />
      </group>
      <group {...q2Layout}>
        <schematic_unit part={pcbId} symbol="mosfet" schX={0} schY={0} />
      </group>
    </>
  );
};
```

This is the lowest layer: `<chip>`/`<internalcircuit>` (§3.1–3.2) is sugar
that writes exactly this shape of circuit-JSON (a `pcb_component` plus
linked `schematic_component` entries). Library authors needing structures
the sugar doesn't yet support can drop to this layer directly; ordinary
component authors should not need to.

## 4. Reconciliation

Reconciliation verifies that an authored design's schematic and physical
content describe a coherent device set. Three distinct failure modes:

### 4.1 Undersubscription (structural, cheap)

An internal element with a `pinMapping` referencing a pin number that
doesn't exist on the chip's footprint, or — for the escape-hatch layer — a
`schematic_component` with no linked `pcb_component`. Detected by walking
declared elements and verifying each pin reference resolves against the
parent chip's footprint definition.

### 4.2 Oversubscription / pin conflicts (structural, cheap)

Two internal elements map different terminals to the same physical pin
number unintentionally. Detected by checking injectivity of the combined
`pinMapping` across all elements of one chip: each physical pin claimed by
at most one `(element, terminal)` pair, unless explicitly declared as a
shared/common pin (e.g., a shared source pin across elements — legitimate
for some multiple-element parts, so this check needs an explicit
allow-shared-pin escape rather than a flat prohibition).

### 4.3 Semantic drift (solved structurally by containment)

Y14.44 §2.1.4 requires elements sharing a refdes to be portions of the same
physical part. Because elements are authored as children of one `<chip>`
rather than independently self-declaring a refdes string, this constraint
cannot be violated by construction — there is no authoring path that
produces two elements disagreeing about their parent part. (An earlier
draft of this proposal solved this via shared object-reference identity
across independently-declared components; nesting makes that unnecessary
for this case and is preferred where containment is natural.)

### 4.4 Auto-suffix stability

If element refdes suffixes (`A`, `B`, `C`...) are auto-assigned from
`<internalcircuit>` child order rather than explicit `name` props, reordering
children in an unrelated refactor silently reassigns suffixes project-wide.
Explicit `name="A"` should be the recommended and lint-encouraged path;
auto-suffix is a convenience default for quick authoring, not something
published/shared library components should rely on.

## 5. Analysis: Non-Destructive Query API

### 5.1 Why analysis cannot be a mutation

Simulation and testbench workflows routinely need to explore a design under
conditions that must never reach manufacturing output — parameter tolerance
sweeps, thermal corner cases, worst-case component variation. If these
overrides were applied to the same circuit-JSON the PCB/BOM are generated
from, there is a direct risk of silent drift: a testbench author lowers a
threshold voltage to probe a corner case, and if that value is not strictly
isolated from the canonical graph, the BOM or PCB could reflect a component
that was never actually intended for the board. This is treated as a hard
architectural boundary, not a convention: **analysis reads; only synthesis
writes.**

### 5.2 `useExtractedDevice`

```tsx
import { useExtractedDevice } from "tscircuit";

const CornerCaseTestbench = () => {
  const { units, nets } = useExtractedDevice({
    physicalId: "U1",
    baseModel: "IRF7313",
    simulationOverrides: {
      "Q1.vto": 1.2,      // lower threshold voltage — worst-case tolerance
      "Q2.rdson": 0.08,   // raise on-resistance — thermal stress test
    },
  });

  return (
    <group>
      <group schX={0} schY={0}>{units.Q1}</group>
      <group schX={20} schY={0}>{units.Q2}</group>
      <voltage_source from="GND" to={nets.gate1} waveform="pulse" />
      <voltage_source from="GND" to={nets.gate2} waveform="pulse" delay="5us" />
      <scope target={nets.drain1} label="High-Side Output" />
    </group>
  );
};
```

`useExtractedDevice` queries the circuit-JSON graph by `physicalId`, applies
`simulationOverrides` as an in-memory shadow layer, and returns schematic
units and nets scoped to the testbench. The canonical graph — and therefore
PCB and BOM output — is never touched. Multiple testbenches can query the
same physical `U1` with different override sets, in separate files, with no
risk of cross-contamination.

Because `useExtractedDevice` reads elements that were written by
`<internalcircuit>` (§3.2) or the raw injection layer (§3.6), the two halves
of this proposal are not independent: `<internalcircuit>` exists in part to
populate the exact circuit-JSON shape (`schematic_component` entries with
`parent_component_id` linking to the chip) that `useExtractedDevice` later
reads back out under a query.

### 5.3 Open questions specific to the query layer

- **Override validation.** If an override key (e.g. `"Q1.vto"`) doesn't
  correspond to a parameter the resolved `baseModel` actually exposes (for
  instance, if `baseModel` resolves to a behavioral/ideal model rather than a
  full SPICE subckt), this must fail at query time, not silently no-op. A
  testbench that appears to test a corner case but is quietly running the
  unmodified nominal model is a more dangerous failure than an explicit
  error, since it produces false confidence in a safety margin that was
  never tested.
- **Net extraction scope.** `nets.gate1` in the example reads as an isolated,
  fresh net local to the testbench. On the real board, that pin is likely
  embedded in a larger net with real loading (a driver IC, pull-down
  resistor, connector trace). Does extraction return only the device's own
  pins as disconnected stubs (safe, but not representative of real loading —
  weakens the claim that this is testing "the exact physical component"), or
  does it pull in surrounding net topology (more representative, but then
  testbench signal injection needs an explicit rule for how it's allowed to
  override or interrupt a net that already has a real driver on it)? This is
  the least-resolved question in this proposal and should be settled before
  implementation — it changes what a testbench built on this API is actually
  allowed to claim about board behavior.

## 6. Open Questions (project-wide)

- **1-logical-to-N-physical mechanism** (§3.3) is unresolved. Likely shape:
  an explicit `physicalInstances={2}`-style prop on a logical component,
  paired with a BOM-aggregation policy (one line with quantity vs. one line
  per instance) — open whether that policy is global, per-component, or
  inferred from shared MPN.
- **Undersubscription severity**: hard error vs. lint warning vs. silently
  valid. Leaning toward warn-by-default with explicit suppression, since a
  schematic-only electrical element with no physical realization is usually
  a mistake but occasionally intentional.
- **Versioning for published multiple-element parts**: a change to a
  chip's `pinMapping` is a breaking change by definition (different board).
  Should probably be enforced by publish tooling rather than left to author
  discipline in semver bumps.
- **Simulation-depends-on-physical-layout** (parasitic-aware simulation of
  distributed implementations, once §3.3 is resolved) implies the view
  pipeline is a DAG with real ordering dependencies, not a flat fan-out from
  one tree. Out of scope for this RFC; noted as a consequence requiring its
  own design pass.
- **Net extraction scope** (§5.3) — the sharpest unresolved question in the
  analysis half of this proposal.

## 7. Summary

This proposal treats circuit-JSON as the actual source of truth, with two
consumer-facing halves built on top of it:

- **Synthesis** (§3): `<chip>` containing `<internalcircuit>` handles the
  common N-logical-to-1-physical case by construction, satisfying Y14.44's
  same-refdes-same-part constraint structurally rather than by convention.
  A raw circuit-JSON injection escape hatch (§3.6) exists underneath it for
  cases the sugar doesn't cover, including the still-unresolved
  1-logical-to-N-physical case (§3.3).
- **Analysis** (§5): `useExtractedDevice` provides read-only, query-time
  parameter overrides for simulation and testbenches, structurally
  prevented from mutating the canonical design — because simulation
  overrides that could leak into manufacturing output are a correctness risk
  specific to hardware, not just an API nicety.

Terminology throughout is aligned to ASME Y14.44 and IEEE 315 so that refdes
and section semantics match existing hardware design practice rather than
inventing parallel conventions. The existing `sch*`/`pcb*` prop-prefix
convention is extended, not replaced, for view-specific single elements.
