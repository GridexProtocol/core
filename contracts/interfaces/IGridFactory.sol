// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

/// @title The interface for Gridex grid factory
interface IGridFactory {
    /// @notice Emitted upon grid creation
    /// @param token0 The first token in the grid, after sorting by address
    /// @param token1 The first token in the grid, after sorting by address
    /// @param resolution The step size in initialized boundaries for a grid created with a given fee
    /// @param grid The address of the deployed grid
    event GridCreated(address indexed token0, address indexed token1, int24 indexed resolution, address grid);

    /// @notice The implementation address of the trading config
    function tradingConfig() external view returns (address);

    /// @notice The implementation address of the price oracle
    function priceOracle() external view returns (address);

    /// @notice Returns the grid address for a given token pair and a resolution. Returns 0 if the pair does not exist.
    /// @dev tokenA and tokenB may be passed in, in the order of either token0/token1 or token1/token0
    /// @param tokenA The contract address of either token0 or token1
    /// @param tokenB The contract address of the other token
    /// @param resolution The step size in initialized boundaries for a grid created with a given fee
    /// @return grid The grid address
    function grids(address tokenA, address tokenB, int24 resolution) external view returns (address grid);

    /// @notice Creates a grid for a given pair of tokens and resolution
    /// @dev tokenA and tokenB may be passed in either order: token0/token1 or token1/token0.
    /// @param tokenA One token of the grid token pair
    /// @param tokenB The other token of the grid token pair
    /// @param resolution The step size in initialized boundaries for a grid created with a given fee
    /// @return grid The address of the deployed grid
    function createGrid(address tokenA, address tokenB, int24 resolution) external returns (address grid);
}
