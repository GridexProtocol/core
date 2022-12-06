// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

library FixedPointX128 {
    uint160 internal constant RESOLUTION = 1 << 128;
    uint160 internal constant Q = 0x100000000000000000000000000000000;
}
