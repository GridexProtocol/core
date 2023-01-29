// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

/// @title A contract interface for deploying grids
/// @notice A grid constructor must use the interface to pass arguments to the grid
/// @dev This is necessary to ensure there are no constructor arguments in the grid contract.
/// This keeps the grid init code hash constant, allowing a CREATE2 address to be computed on-chain gas-efficiently.
interface IGridDeployer {
    struct Parameters {
        address token0;
        address token1;
        int24 resolution;
        int24 takerFee;
        address priceOracle;
        address weth9;
    }

    /// @notice Returns the grid creation code
    function gridCreationCode() external view returns (bytes memory);

    /// @notice Getter for the arguments used in constructing the grid. These are set locally during grid creation
    /// @dev Retrieves grid parameters, after being called by the grid constructor
    /// @return token0 The first token in the grid, after sorting by address
    /// @return token1 The second token in the grid, after sorting by address
    /// @return resolution The step size in initialized boundaries for a grid created with a given fee
    /// @return takerFee The taker fee, denominated in hundredths of a bip (i.e. 1e-6)
    /// @return priceOracle The address of the price oracle contract
    /// @return weth9 The address of the WETH9 contract
    function parameters()
        external
        view
        returns (
            address token0,
            address token1,
            int24 resolution,
            int24 takerFee,
            address priceOracle,
            address weth9
        );
}
