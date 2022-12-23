// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

/// @title The interface for the trading config
interface ITradingConfig {
    /// @notice Emitted when a new resolution is enabled for grid creation via the trading config
    /// @param resolution The step size in initialized boundaries for a grid created with a given fee
    /// @param takerFee The taker fee, denominated in hundredths of a bip (i.e. 1e-6)
    /// @param makerFee The maker fee, denominated in hundredths of a bip (i.e. 1e-6)
    event ResolutionEnabled(int24 indexed resolution, int24 indexed takerFee, int24 indexed makerFee);

    /// @notice Emitted when a resolution is updated via the trading config
    /// @param resolution The resolution to be updated
    /// @param newTakerFee The new taker fee, denominated in hundredths of a bip (i.e. 1e-6)
    /// @param newMakerFee The new maker fee, denominated in hundredths of a bip (i.e. 1e-6)
    event ResolutionUpdated(int24 indexed resolution, int24 indexed newTakerFee, int24 indexed newMakerFee);

    /// @notice Emitted when a new collector is set via the trading config
    /// @param sender The address of the sender
    /// @param oldCollector Address of the old protocol fee collector
    /// @param newCollector Address of the new protocol fee collector
    event ProtocolFeeCollectorTransferred(
        address indexed sender,
        address indexed oldCollector,
        address indexed newCollector
    );

    struct FeeConfig {
        /// @dev The taker fee, denominated in hundredths of a bip (i.e. 1e-6)
        int24 takerFee;
        /// @dev The maker fee, denominated in hundredths of a bip (i.e. 1e-6)
        int24 makerFee;
    }

    /// @notice Returns the taker fee and maker fee for the given resolution if enabled. Else, returns 0.
    /// @dev A resolution can never be removed, so this value should be hard coded or cached in the calling context
    /// @param resolution The enabled resolution
    /// @return takerFee The taker fee, denominated in hundredths of a bip (i.e. 1e-6)
    /// @return makerFee The maker fee, denominated in hundredths of a bip (i.e. 1e-6)
    function fees(int24 resolution) external view returns (int24 takerFee, int24 makerFee);

    /// @notice Enables a resolution with the given fee config
    /// @dev Resolution may never be removed once enabled
    /// @param resolution The step size in initialized boundaries for a grid created with a given fee
    /// @param takerFee The taker fee, denominated in hundredths of a bip (i.e. 1e-6)
    /// @param makerFee The maker fee, denominated in hundredths of a bip (i.e. 1e-6)
    function enableResolution(int24 resolution, int24 takerFee, int24 makerFee) external;

    /// @notice Update a resolution with the given fee config
    /// @dev Can only be called by the owner
    /// @param resolution The resolution to be updated
    /// @param newTakerFee The new taker fee, denominated in hundredths of a bip (i.e. 1e-6)
    /// @param newMakerFee The new maker fee, denominated in hundredths of a bip (i.e. 1e-6)
    function updateResolution(int24 resolution, int24 newTakerFee, int24 newMakerFee) external;

    /// @notice Returns the address of protocol fee collector
    /// @return collector The address of the protocol fee collector
    function protocolFeeCollector() external view returns (address collector);

    /// @notice Transfers protocol fee collector of the contract to a new account (`newCollector`)
    /// @dev Can only be called by the current owner
    /// @param newCollector Address of the new protocol fee collector
    function transferProtocolFeeCollector(address newCollector) external;
}
