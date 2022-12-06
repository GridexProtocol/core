// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../PriceOracle.sol";

contract PriceOracleTestHelper is PriceOracle {
    function register(address grid) external {
        super._register(grid);
    }

    function update(address grid, int24 boundary) external {
        super._update(grid, boundary, uint32(block.timestamp));
    }

    function update(address grid, int24 boundary, uint256 blockTimestamp) external {
        super._update(grid, boundary, uint32(blockTimestamp));
    }

    function getBoundaryCumulative(
        address grid,
        int24 boundary,
        uint256 blockTimestamp,
        uint32 secondsAgo
    ) external view returns (int56 boundaryCumulative) {
        GridOracleState memory state = gridOracleStates[grid];
        // PO_UR: unregistered grid
        require(state.capacity >= 1, "PO_UR");

        return super._getBoundaryCumulative(state, gridPriceData[grid], boundary, uint32(blockTimestamp), secondsAgo);
    }
}
