// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

/// @title Callback for IGrid#placeMakerOrder
/// @notice Any contract that calls IGrid#placeMakerOrder must implement this interface
interface IGridPlaceMakerOrderCallback {
    /// @notice Called to `msg.sender` after executing a place maker order via IGrid#placeMakerOrder
    /// @dev In this implementation, you are required to pay the grid tokens owed for the maker order.
    /// The caller of the method must be a grid deployed by the canonical GridFactory.
    /// At most one of amount0 and amount1 is a positive number
    /// @param amount0 The grid will receive the amount of token0 upon placement of the maker order.
    /// In the receiving case, the callback must send this amount of token0 to the grid
    /// @param amount1 The grid will receive the amount of token1 upon placement of the maker order.
    /// In the receiving case, the callback must send this amount of token1 to the grid
    /// @param data Any data passed through by the caller via the IGrid#placeMakerOrder call
    function gridexPlaceMakerOrderCallback(uint256 amount0, uint256 amount1, bytes calldata data) external;
}
