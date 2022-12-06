// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../libraries/Uint160Math.sol";

contract Uint160MathTest {
    function minUint160(uint160 a, uint160 b) external pure returns (uint160) {
        return Uint160Math.minUint160(a, b);
    }

    function maxUint160(uint160 a, uint160 b) external pure returns (uint160) {
        return Uint160Math.maxUint160(a, b);
    }
}
