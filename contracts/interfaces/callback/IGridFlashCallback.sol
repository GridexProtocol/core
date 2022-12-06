// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

/// @title Callback for IGrid#flash
/// @notice Any contract that calls IGrid#flash must implement this interface
interface IGridFlashCallback {
    /// @notice Called to `msg.sender` after executing a flash via IGrid#flash
    /// @dev In this implementation, you are required to repay the grid the tokens owed for the flash,
    /// plus the calculated fee. The caller of the method must be a grid deployed by the canonical GridFactory.
    /// @param fee0 The fee denominated in token0 owed to the grid once the flash ends
    /// @param fee1 The fee denominated in token1 owed to the grid once the flash ends
    /// @param data Any data passed through by the caller via the IGrid@flash call
    function gridexFlashCallback(uint128 fee0, uint128 fee1, bytes calldata data) external;
}
