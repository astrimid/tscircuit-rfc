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
