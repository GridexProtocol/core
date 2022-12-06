// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

library Uint160Math {
    function minUint160(uint160 a, uint160 b) internal pure returns (uint160 min) {
        return a < b ? a : b;
    }

    function maxUint160(uint160 a, uint160 b) internal pure returns (uint160 max) {
        return a > b ? a : b;
    }
}
