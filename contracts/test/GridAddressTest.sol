// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../libraries/GridAddress.sol";

contract GridAddressTest {
    function GRID_BYTES_CODE_HASH() external pure returns (bytes32) {
        return GridAddress.GRID_BYTES_CODE_HASH;
    }

    function gridKey(
        address tokenA,
        address tokenB,
        int24 resolution
    ) external view returns (GridAddress.GridKey memory key, uint256 gasUsed) {
        uint256 gasBefore = gasleft();
        key = GridAddress.gridKey(tokenA, tokenB, resolution);
        gasUsed = gasBefore - gasleft();
    }

    function computeAddress(address gridFactory, GridAddress.GridKey memory key) external pure returns (address) {
        return GridAddress.computeAddress(gridFactory, key);
    }
}
