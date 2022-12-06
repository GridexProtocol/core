// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../libraries/BoundaryMath.sol";
import "../libraries/BoundaryBitmap.sol";

contract BoundaryBitmapTest {
    using BoundaryBitmap for mapping(int16 => uint256);

    mapping(int16 => uint256) private boundaryBitmap;
    int24 private immutable resolution;

    constructor(int24 _resolution) {
        require(_resolution > 0);
        resolution = _resolution;
    }

    function position(int24 boundary) external pure returns (int16 wordPos, uint8 bitPos) {
        return BoundaryBitmap.position(boundary);
    }

    function getWord(int24 boundary) external view returns (uint256 word) {
        (int16 wordPos, ) = this.position(boundary);
        return boundaryBitmap[wordPos];
    }

    function flipBoundary(int24 boundary) external {
        require(BoundaryMath.isValidBoundary(boundary, resolution));
        boundaryBitmap.flipBoundary(boundary, resolution);
    }

    function nextInitializedBoundaryWithinOneWord(
        int24 boundary,
        bool lte
    ) external view returns (int24 next, bool initialized) {
        return boundaryBitmap.nextInitializedBoundaryWithinOneWord(boundary, resolution, lte);
    }

    function nextInitializedBoundary(
        int24 boundary,
        uint160 priceX96,
        bool currentBoundaryInitialized,
        int24 boundaryLower,
        bool lte
    )
        external
        view
        returns (
            int24 next,
            bool initialized,
            uint160 initializedBoundaryLowerPriceX96,
            uint160 initializedBoundaryUpperPriceX96
        )
    {
        return
            boundaryBitmap.nextInitializedBoundary(
                boundary,
                priceX96,
                currentBoundaryInitialized,
                resolution,
                boundaryLower,
                lte
            );
    }
}
