// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "../libraries/BoundaryMath.sol";

contract BoundaryMathTest {
    function isValidBoundary(int24 boundary, int24 resolution) external pure returns (bool) {
        return BoundaryMath.isValidBoundary(boundary, resolution);
    }

    function isInRange(int24 boundary) external pure returns (bool) {
        return BoundaryMath.isInRange(boundary);
    }

    function isPriceX96InRange(uint160 priceX96) external pure returns (bool inRange) {
        return BoundaryMath.isPriceX96InRange(priceX96);
    }

    function getPriceX96AtBoundary(int24 boundary) external pure returns (uint256 priceX96) {
        return BoundaryMath.getPriceX96AtBoundary(boundary);
    }

    function getPriceX96AtBoundaryWithGasUsed(
        int24 boundary
    ) external view returns (uint256 priceX96, uint256 gasUsed) {
        uint256 gasBefore = gasleft();
        priceX96 = BoundaryMath.getPriceX96AtBoundary(boundary);
        gasUsed = gasBefore - gasleft();
    }

    function getBoundaryAtPriceX96(uint160 priceX96) external pure returns (int24 boundary) {
        return BoundaryMath.getBoundaryAtPriceX96(priceX96);
    }

    function getBoundaryAtPriceX96WithGasUsed(
        uint160 priceX96
    ) external view returns (int24 boundary, uint256 gasUsed) {
        uint256 gasBefore = gasleft();
        boundary = BoundaryMath.getBoundaryAtPriceX96(priceX96);
        gasUsed = gasBefore - gasleft();
    }

    function getBoundaryLowerAtBoundary(int24 boundary, int24 resolution) external pure returns (int24 boundaryLower) {
        return BoundaryMath.getBoundaryLowerAtBoundary(boundary, resolution);
    }

    function getBoundaryLowerAtBoundaryWithGasUsed(
        int24 boundary,
        int24 resolution
    ) external view returns (int24 boundaryLower, uint256 gasUsed) {
        uint256 gasBefore = gasleft();
        boundaryLower = BoundaryMath.getBoundaryLowerAtBoundary(boundary, resolution);
        gasUsed = gasBefore - gasleft();
    }

    function rewriteToValidBoundaryLower(
        int24 boundaryLower,
        int24 resolution
    ) external pure returns (int24 validBoundaryLower) {
        return BoundaryMath.rewriteToValidBoundaryLower(boundaryLower, resolution);
    }
}
