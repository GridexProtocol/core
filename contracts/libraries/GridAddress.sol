// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/Create2.sol";

library GridAddress {
    bytes32 internal constant GRID_BYTES_CODE_HASH = 0x990421cbbd7c362a860779017e102aa6086ba1d63e91360bfc27e95467f2a435;

    struct GridKey {
        address token0;
        address token1;
        int24 resolution;
    }

    function gridKey(address tokenA, address tokenB, int24 resolution) internal pure returns (GridKey memory) {
        if (tokenA > tokenB) (tokenA, tokenB) = (tokenB, tokenA);

        return GridKey(tokenA, tokenB, resolution);
    }

    function computeAddress(address gridFactory, GridKey memory key) internal pure returns (address) {
        require(key.token0 < key.token1);
        return
            Create2.computeAddress(
                keccak256(abi.encode(key.token0, key.token1, key.resolution)),
                GRID_BYTES_CODE_HASH,
                gridFactory
            );
    }
}
