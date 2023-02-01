// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./IGridStructs.sol";

/// @title Events emitted by the grid contract
interface IGridEvents {
    /// @notice Emitted exactly once by a grid when #initialize is first called on the grid
    /// @param priceX96 The initial price of the grid, as a Q64.96
    /// @param boundary The initial boundary of the grid
    event Initialize(uint160 priceX96, int24 boundary);

    /// @notice Emitted when the maker places an order to add liquidity for token0 or token1
    /// @param orderId The unique identifier of the order
    /// @param recipient The address that received the order
    /// @param bundleId The unique identifier of the bundle -- represents which bundle this order belongs to
    /// @param zero When zero is true, it represents token0, otherwise it represents token1
    /// @param boundaryLower The lower boundary of the order
    /// @param amount The amount of token0 or token1 to add
    event PlaceMakerOrder(
        uint256 indexed orderId,
        address indexed recipient,
        uint64 indexed bundleId,
        bool zero,
        int24 boundaryLower,
        uint128 amount
    );

    /// @notice Emitted when settling a single range order
    /// @param orderId The unique identifier of the order
    /// @param makerAmountOut The amount of token0 or token1 that the maker has removed
    /// @param takerAmountOut The amount of token0 or token1 that the taker has submitted
    /// @param takerFeeAmountOut The amount of token0 or token1 fees that the taker has paid
    event SettleMakerOrder(
        uint256 indexed orderId,
        uint128 makerAmountOut,
        uint128 takerAmountOut,
        uint128 takerFeeAmountOut
    );

    /// @notice Emitted when a maker settles an order
    /// @dev When either of the bundle's total maker amount or the remaining maker amount becomes 0,
    /// the bundle is closed
    /// @param bundleId The unique identifier of the bundle
    /// @param makerAmountTotal The change in the total maker amount in the bundle
    /// @param makerAmountRemaining The change in the remaining maker amount in the bundle
    event ChangeBundleForSettleOrder(uint64 indexed bundleId, int256 makerAmountTotal, int256 makerAmountRemaining);

    /// @notice Emitted when a taker is swapping
    /// @dev When the bundle's remaining maker amount becomes 0, the bundle is closed
    /// @param bundleId The unique identifier of the bundle
    /// @param makerAmountRemaining The change in the remaining maker amount in the bundle
    /// @param amountIn The change in the remaining taker amount in the bundle
    /// @param takerFeeAmountIn The change in the remaining taker fee amount in the bundle
    event ChangeBundleForSwap(
        uint64 indexed bundleId,
        int256 makerAmountRemaining,
        uint256 amountIn,
        uint128 takerFeeAmountIn
    );

    /// @notice Emitted by the grid for any swaps between token0 and token1
    /// @param sender The address that initiated the swap call, and that received the callback
    /// @param recipient The address that received the output of the swap
    /// @param amount0 The delta of the token0 balance of the grid
    /// @param amount1 The delta of the token1 balance of the grid
    /// @param priceX96 The price of the grid after the swap, as a Q64.96
    /// @param boundary The log base 1.0001 of the price of the grid after the swap
    event Swap(
        address indexed sender,
        address indexed recipient,
        int256 amount0,
        int256 amount1,
        uint160 priceX96,
        int24 boundary
    );

    /// @notice Emitted by the grid for any flashes of token0/token1
    /// @param sender The address that initiated the flash call, and that received the callback
    /// @param recipient The address that received the tokens from the flash
    /// @param amount0 The amount of token0 that was flashed
    /// @param amount1 The amount of token1 that was flashed
    /// @param paid0 The amount of token0 paid for the flash, which can exceed the amount0 plus the fee
    /// @param paid1 The amount of token1 paid for the flash, which can exceed the amount1 plus the fee
    event Flash(
        address indexed sender,
        address indexed recipient,
        uint256 amount0,
        uint256 amount1,
        uint128 paid0,
        uint128 paid1
    );

    /// @notice Emitted when the collected owed fees are withdrawn by the sender
    /// @param sender The address that collects the fees
    /// @param recipient The address that receives the fees
    /// @param amount0 The amount of token0 fees that is withdrawn
    /// @param amount1 The amount of token1 fees that is withdrawn
    event Collect(address indexed sender, address indexed recipient, uint128 amount0, uint128 amount1);
}
