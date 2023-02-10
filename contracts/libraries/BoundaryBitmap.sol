// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

import "./BitMath.sol";
import "./BoundaryMath.sol";

library BoundaryBitmap {
    /// @notice Calculates the position of the bit in the bitmap for a given boundary
    /// @param boundary The boundary for calculating the bit position
    /// @return wordPos The key within the mapping that contains the word storing the bit
    /// @return bitPos The bit position in the word where the flag is stored
    function position(int24 boundary) internal pure returns (int16 wordPos, uint8 bitPos) {
        wordPos = int16(boundary >> 8);
        bitPos = uint8(uint24(boundary));
    }

    /// @notice Flips the boolean value of the initialization state of the given boundary
    /// @param self The mapping that stores the initial state of the boundary
    /// @param boundary The boundary to flip
    /// @param resolution The step size in initialized boundaries for a grid created with a given fee
    function flipBoundary(mapping(int16 => uint256) storage self, int24 boundary, int24 resolution) internal {
        require(boundary % resolution == 0);
        (int16 wordPos, uint8 bitPos) = position(boundary / resolution);
        uint256 mask = 1 << bitPos;
        self[wordPos] ^= mask;
    }

    /// @notice Returns the next initialized boundary as the left boundary (less than)
    /// or the right boundary (more than)
    /// @param self The mapping that stores the initial state of the boundary
    /// @param boundary The starting boundary
    /// @param priceX96 Price of the initial boundary, as a Q64.96
    /// @param currentBoundaryInitialized Whether the starting boundary is initialized or not
    /// @param resolution The step size in initialized boundaries for a grid created with a given fee
    /// @param boundaryLower The starting lower boundary of the grid
    /// @param lte Whether or not to search for the next initialized boundary
    /// to the left (less than or equal to the starting boundary)
    /// @return next The next boundary, regardless of initialization state
    /// @return initialized Whether or not the next boundary is initialized
    /// @return initializedBoundaryLowerPriceX96 If the current boundary has been initialized and can be swapped,
    /// return the current left boundary price, otherwise return 0, as a Q64.96
    /// @return initializedBoundaryUpperPriceX96 If the current boundary has been initialized and can be swapped,
    /// return the current right boundary price, otherwise return 0, as a Q64.96
    function nextInitializedBoundary(
        mapping(int16 => uint256) storage self,
        int24 boundary,
        uint160 priceX96,
        bool currentBoundaryInitialized,
        int24 resolution,
        int24 boundaryLower,
        bool lte
    )
        internal
        view
        returns (
            int24 next,
            bool initialized,
            uint160 initializedBoundaryLowerPriceX96,
            uint160 initializedBoundaryUpperPriceX96
        )
    {
        int24 boundaryUpper = boundaryLower + resolution;
        if (currentBoundaryInitialized) {
            if (lte) {
                uint160 boundaryLowerPriceX96 = BoundaryMath.getPriceX96AtBoundary(boundaryLower);
                if (boundaryLowerPriceX96 < priceX96) {
                    return (
                        boundaryLower,
                        true,
                        boundaryLowerPriceX96,
                        BoundaryMath.getPriceX96AtBoundary(boundaryUpper)
                    );
                }
            } else {
                uint160 boundaryUpperPriceX96 = BoundaryMath.getPriceX96AtBoundary(boundaryUpper);
                if (boundaryUpperPriceX96 > priceX96) {
                    return (
                        boundaryLower,
                        true,
                        BoundaryMath.getPriceX96AtBoundary(boundaryLower),
                        boundaryUpperPriceX96
                    );
                }
            }
        }

        // When the price is rising and the current boundary coincides with the upper boundary, start searching
        // from the lower boundary. Otherwise, start searching from the current boundary
        boundary = !lte && boundaryUpper == boundary ? boundaryLower : boundary;
        while (BoundaryMath.isInRange(boundary)) {
            (next, initialized) = nextInitializedBoundaryWithinOneWord(self, boundary, resolution, lte);
            if (initialized) {
                unchecked {
                    return (
                        next,
                        true,
                        BoundaryMath.getPriceX96AtBoundary(next),
                        BoundaryMath.getPriceX96AtBoundary(next + resolution)
                    );
                }
            }
            boundary = next;
        }
    }

    /// @notice Returns the next initialized boundary contained in the same (or adjacent) word
    /// as the boundary that is either to the left (less than) or right (greater than)
    /// of the given boundary
    /// @param self The mapping that stores the initial state of the boundary
    /// @param boundary The starting boundary
    /// @param resolution The step size in initialized boundaries for a grid created with a given fee
    /// @param lte Whether or not to search to the left (less than or equal to the start boundary)
    /// for the next initialization
    /// @return next The next boundary, regardless of initialization state
    /// @return initialized Whether or not the next boundary is initialized
    function nextInitializedBoundaryWithinOneWord(
        mapping(int16 => uint256) storage self,
        int24 boundary,
        int24 resolution,
        bool lte
    ) internal view returns (int24 next, bool initialized) {
        int24 compressed = boundary / resolution;

        if (lte) {
            // Begin from the word of the next boundary, since the current boundary state is immaterial
            (int16 wordPos, uint8 bitPos) = position(compressed - 1);
            // all the 1s at or to the right of the current bitPos
            uint256 mask = ~uint256(0) >> (type(uint8).max - bitPos);
            uint256 masked = self[wordPos] & mask;

            // If no initialized boundaries exist to the right of the current boundary,
            // return the rightmost boundary in the word
            initialized = masked != 0;
            // Overflow/underflow is possible. The resolution and the boundary should be limited
            // when calling externally to prevent this
            next = initialized
                ? (compressed - 1 - int24(uint24(bitPos - BitMath.mostSignificantBit(masked)))) * resolution
                : (compressed - 1 - int24(uint24(bitPos))) * resolution;
        } else {
            if (boundary < 0 && boundary % resolution != 0) {
                // round towards negative infinity
                --compressed;
            }

            // Begin from the word of the next boundary, since the current boundary state is immaterial
            (int16 wordPos, uint8 bitPos) = position(compressed + 1);
            // all the 1s at or to the left of the bitPos
            uint256 mask = ~uint256(0) << bitPos;
            uint256 masked = self[wordPos] & mask;

            // If no initialized boundaries exist to the left of the current boundary,
            // return the leftmost boundary in the word
            initialized = masked != 0;
            // Overflow/underflow is possible. The resolution and the boundary should be limited
            // when calling externally to prevent this
            next = initialized
                ? (compressed + 1 + int24(uint24(BitMath.leastSignificantBit(masked) - bitPos))) * resolution
                : (compressed + 1 + int24(uint24(type(uint8).max - bitPos))) * resolution;
        }
    }
}
