// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Create2.sol";

library GridAddress {
    bytes32 internal constant GRID_BYTES_CODE_HASH = 0x8d683fc379ae6e45b446089f4abbc25afac339e31a26e29a94a6992c3439f5b3;

    struct GridKey {
        address token0;
        address token1;
        int24 resolution;
    }

    /// @notice Constructs the grid key for the given parameters
    /// @dev tokenA and tokenB may be passed in, in the order of either token0/token1 or token1/token0
    /// @param tokenA The contract address of either token0 or token1
    /// @param tokenB The contract address of the other token
    /// @param resolution The step size in initialized boundaries for a grid created with a given fee
    /// @return key The grid key to compute the canonical address for the grid
    function gridKey(address tokenA, address tokenB, int24 resolution) internal pure returns (GridKey memory key) {
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);

        return GridKey(tokenA, tokenB, resolution);
    }

    /// @dev Computes the CREATE2 address for a grid with the given parameters
    /// @param gridFactory The address of the grid factory
    /// @param key The grid key to compute the canonical address for the grid
    /// @return grid The computed address
    function computeAddress(address gridFactory, GridKey memory key) internal pure returns (address grid) {
        require(key.token0 < key.token1);
        return
            Create2.computeAddress(
                keccak256(abi.encode(key.token0, key.token1, key.resolution)),
                GRID_BYTES_CODE_HASH,
                gridFactory
            );
    }
}
