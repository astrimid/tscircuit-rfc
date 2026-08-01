# RFC: Multi-Unit-in-Package Components (`<chipShell>`)

**Status:** Proposed  
**Author:** astrimid & Core Contributors  
**Target Version:** tscircuit Next

---

## 1. Problem Statement

Some physical packages contain multiple independent electrical elements sharing one body (e.g., dual MOSFETs, dual diodes, quad logic gates, resistor arrays).

In code-based schematics, each element needs to be placed freely on the canvas—with unique `schX`, `schY`, `schRotation`, and `schSectionName` properties—often in completely different areas of a sheet. However, there must be a durable, explicit link from each symbol back to the physical package pins.

Without a declarative mapping container, designers are forced to rely on naming conventions or manual comment blocks to trace which logical gate maps to which physical footprint pin.

---

## 2. Design Goals

- **Independent Schematic Placement:** Units can be placed anywhere on the schematic sheet with distinct coordinate properties.
- **Explicit Physical Traceability:** Every internal terminal is mapped to a real physical pin identifier, ensuring netlists are reliable and auditable.
- **Unified Addressing:** Support both logical/functional naming (`Q203A.gate`) and physical pin tracing (`Q203.pin2`) seamlessly.
- **Zero-Config Behavioral Models:** No complex SPICE composition is required for the MVP; units use standard generic behavioral models.
- **Extensible Architecture:** Provide a clean path to layer on PCB footprint unification and package-level SPICE models in future revisions without breaking changes.

---

## 3. API Surface

### 3.1 The `<chipShell>` Container

The `<chipShell>` acts as a physical-part grouping element. It renders nothing on the visual schematic canvas. Its role is strictly logical: it holds part-level metadata and establishes a parent namespace.

```typescript
interface ChipShellProps {
  name: string;             // Package-level refdes (e.g., "Q203")
  mpn?: string;             // Manufacturer Part Number
  manufacturer?: string;    // Manufacturer Name
  pinCount?: number;        // Optional sanity-check constraint
  children: React.ReactNode;
}
```

### 3.2 Unit Children

Any standard schematic component (`<mosfet>`, `<diode>`, `<resistor>`, `<opamp>`) becomes an internal unit when nested inside a `<chipShell>` and assigned a `unitId`.

```jsx
<chipShell name="Q203" mpn="DMN65D8LDW" manufacturer="Diodes Inc.">
  <mosfet
    unitId="A"
    channelType="n"
    schSectionName="ac_disc_path"
    schX={2.3}
    schY={13}
    pinMapping={{ gate: "2", source: "1", drain: "6" }}
  />
  <mosfet
    unitId="B"
    channelType="n"
    schSectionName="power_regulation_path"
    schX={45}
    schY={-8}
    pinMapping={{ gate: "5", source: "4", drain: "3" }}
  />
</chipShell>
```

**Rules for Unit Children:**

- **Scope:** A component with a `unitId` must be a direct child of a `<chipShell>`. An isolated component with a `unitId` outside a shell will throw a compilation error.
- **The `pinMapping` Contract:** The component must map its internal logical terminals (e.g., `gate`, `source`, `drain`) to the physical pins/names of the parent shell.
- **Behavior:** Visual properties (`schX`, `schY`, etc.) apply directly to the individual unit's symbol on the schematic.

---

## 4. Addressing & Resolution Engine

### 4.1 Refdes Derivation

By default, the rendered visual reference designator (`refdes`) on the schematic sheet is derived by concatenating the shell's name and the child's `unitId`:

$$\text{Refdes} = \text{shellName} + \text{unitId}$$

**Example:** `Q203` + `A` → `Q203A`.

If a custom visual designator is required, an optional `refdesOverride` prop on the child unit will override this behavior (e.g., `<mosfet unitId="A" refdesOverride="Q203-1" />`).

### 4.2 Net & Trace Addressing

The compiler must treat the following two address forms as completely equivalent, resolving them to the same electrical node:

| **Logical / Functional Address (Primary)** | **Physical Pin Address** |
|--------------------------------------------|--------------------------|
| `<trace from=".Q203A.gate" to=".controller.pwm" />` | `<trace from=".Q203.pin2" to=".controller.pwm" />` |

```
[Logical Address: .Q203A.gate] -----\
                                     +---> [Electrical Node] ---> [Destination]
[Physical Address: .Q203.pin2] -----/
```

### 4.3 Resolving Ambiguities (The Compiler Pipeline)

When compiling the connectivity graph, tscircuit will run a mapping-resolution step:

1. Identify all `<chipShell>` components.
2. For each child unit inside a shell, register its logical terminals as aliases of the designated physical shell pins.
3. If two traces connect to different aliases of the same physical pin, merge them into a single net. Raise a compilation warning if conflicting net names are assigned.

---

## 5. Resolutions to Open Items

### Item 8.1: Package Pin Names vs. Numbers

**Resolution:** `pinMapping` values must accept arbitrary strings to handle both numeric pins (e.g., `"1"`, `"2"`) and non-numeric matrix coordinates (e.g., `"A1"`, `"B12"` for BGAs or specialized power packages).

**Syntax:** `pinMapping={{ gate: "G1", source: "S1", drain: "D1" }}`.

### Item 8.2: The `pinMap()` Diagnostic Helper

**Resolution:** The `<chipShell>` instance will export a read-only queryable method `pinMap()` or a static `.json` configuration during compile time. This is invaluable for generating automated pinout sheets, netlist debugging, and verifying designs during review.

**Output Format:**
```json
{
  "1": "Q203A.source",
  "2": "Q203A.gate",
  "3": "Q203B.drain",
  "4": "Q203B.source",
  "5": "Q203B.gate",
  "6": "Q203A.drain"
}
```

### Item 8.3: Heterogeneous Units

**Resolution:** Yes, the framework must natively support nesting different component types. A classic example is a dual-element chip containing an Op-Amp (Unit A) and a Voltage Reference (Unit B). The `<chipShell>` container does not enforce type uniformity among its children.

---

## 6. Future Expansion Paths (Non-Breaking)

```
                       +-------------------+
                       |    <chipShell>    |
                       +-------------------+
                                 |
         +-----------------------+-----------------------+
         |                                               |
         v                                               v
[Phase 1: Schematic-Only]                      [Phase 2: Full Integration]
- Independent visual units                     - Add physical 'footprint' prop
- Alias physical pin mapping                   - Collapse units to single PCB BOM
- Zero-config behavioral SPICE                  - Package-level multi-port SPICE
```

- **Footprint Consolidation:** In a future PCB-aware release, adding a `footprint` prop to the `<chipShell>` will signal the compiler to generate only one physical footprint's land pattern, automatically binding child traces to the footprint pads according to their `pinMapping`.
- **Package-Level SPICE:** A custom package-level SPICE `.subckt` can be defined on the `<chipShell>` wrapper, mapping internal logical units to a single simulation model with physical pin inputs.
