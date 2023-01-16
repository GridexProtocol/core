// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

/// @title Callback for IGrid#flash
/// @notice Any contract that calls IGrid#flash must implement this interface
interface IGridFlashCallback {
    /// @notice Called to `msg.sender` after executing a flash via IGrid#flash
    /// @dev In this implementation, you are required to repay the grid the tokens owed for the flash.
    /// The caller of the method must be a grid deployed by the canonical GridFactory.
    /// @param data Any data passed through by the caller via the IGrid@flash call
    function gridexFlashCallback(bytes calldata data) external;
}
