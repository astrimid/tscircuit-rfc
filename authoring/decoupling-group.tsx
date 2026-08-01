/**
 * Decoupling Capacitor Placement Strategy
 * 
 * @goal Position decoupling capacitor (C14) exactly 2mm from U3 Pin 8
 *       to minimize loop inductance and optimize signal integrity.
 * 
 * @failure Point 1: `<constraint />` tags with `edgeToEdge` properties
 *       failed at top-level board config - these tags are exclusively
 *       scoped for defining geometries inside individual custom footprint
 *       components, not for orchestrating placement between separate
 *       discrete board parts.
 * 
 * @failure Point 2: Manual hardcoding of absolute positions (`pcbX`/`pcbY`)
 *       caused unassigned components to clump at default (0,0) origin,
 *       breaking modularity.
 * 
 * @solution Isolated `<group />` container with flat flex-layout props:
 *       - `pcbFlex`
 *       - `pcbFlexDirection="row"`
 *       - `pcbFlexGap="2mm"`
 *       
 *       This creates a local, relative coordinate system, allowing the
 *       sub-circuit to autonomously maintain strict physical dimensions
 *       and trace routes without relying on brittle global board coordinates.
 * 
 * @architecture
 * - **Isolated Geometry**: Internal flex layout compiles to relative coords,
 *   doesn't leak to master board layout.
 * - **Configurable Constraints**: Pin relationships, footprints, and gap
 *   distance parameterised via standard TypeScript props.
 * - **Trace Encapsulation**: Trace routing handled inside local group scope,
 *   ensuring tight power/ground pin coupling across localized layout space.
 * 
 * @question Proceed with routing ground net connection for this group,
 *           or explore nesting multiple decoupled modules onto master board?
 */
import { group, chip, capacitor, trace } from "@tscircuit/core"

interface DecouplingGroupProps {
  icFootprint?: string
  capFootprint?: string
  capValue?: string
  gap?: string
}

/**
 * RFC Pattern: Reusable Decoupling Capacitor Group
 * Enforces strict, relative physical constraints without global coordinates.
 */
export const DecouplingGroup = ({
  icFootprint = "soic8",
  capFootprint = "0402",
  capValue = "1uF",
  gap = "2mm"
}: DecouplingGroupProps) => {
  return (
    <group
      name="rfc_decoupling_block"
      layoutMode="flex"
      pcbFlex
      pcbFlexDirection="row"
      pcbFlexGap={gap}
      pcbAlignItems="center"
    >
      {/* IC is the local anchor of the flex group */}
      <chip 
        name="U3" 
        footprint={icFootprint} 
      />
      
      {/* Component stays strictly bounded by the local gap constraint */}
      <capacitor 
        name="C14" 
        capacitance={capValue} 
        footprint={capFootprint} 
      />

      {/* Internal localized net routing */}
      <trace 
        from=".U3 > .pin8" 
        to=".C14 > .pin1" 
      />
    </group>
  )
}
