
// ============================================================================
// circuit-atoms — public API surface
//
// https://github.com/astrimid/circuit-atoms
//
// Layer 1  Atoms       — thin functional wrappers over a single primitive
// Layer 2  Organisms   — encapsulated multi-component reference topologies
// Layer 3  Rail system — power/ground identity, DRC intent, physical hints
// ============================================================================

// Layer 1: Atoms
export { Decap } from "./atoms/Decap"
export type { DecapProps } from "./atoms/Decap"

// Layer 2: Organisms
export {
  IsolatedSupplyReservoir,
  DriverSupplyFilter,
} from "./organisms/IsolatedSupplyReservoir"
export type { IsolatedSupplyReservoirProps } from "./organisms/IsolatedSupplyReservoir"

export { VoltageSenseDivider } from "./organisms/VoltageSenseDivider"
export type { VoltageSenseDividerProps } from "./organisms/VoltageSenseDivider"

export { SynchronousBuckStage } from "./organisms/SynchronousBuckStage"
export type { SynchronousBuckStageProps } from "./organisms/SynchronousBuckStage"

export { CurrentSenseNetwork } from "./organisms/CurrentSenseNetwork"
export type { CurrentSenseNetworkProps } from "./organisms/CurrentSenseNetwork"

export { FourSwitchBuckBoost } from "./organisms/FourSwitchBuckBoost"
export type { FourSwitchBuckBoostProps } from "./organisms/FourSwitchBuckBoost"

// Layer 3: Rail subsystem
export {
  Rail,
  RailConnection,
  railRegistry,
  railConnectionRegistry,
} from "./rails/Rail"
export type {
  RailProps,
  RailRole,
  RailMeta,
  RailConnectionProps,
  RailConnectionRole,
  RailConnectionEntry,
  RailPcbHintProps,
} from "./rails/Rail"
