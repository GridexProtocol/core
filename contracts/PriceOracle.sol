// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.9;

import "./interfaces/IGrid.sol";
import "./interfaces/IPriceOracle.sol";
import "./libraries/CallbackValidator.sol";
import "./libraries/GridAddress.sol";

contract PriceOracle is IPriceOracle {
    address public immutable gridFactory;

    mapping(address => GridOracleState) public override gridOracleStates;
    mapping(address => GridPriceData[65535]) public override gridPriceData;

    constructor() {
        gridFactory = msg.sender;
    }

    /// @inheritdoc IPriceOracle
    function register(address tokenA, address tokenB, int24 resolution) external override {
        address grid = GridAddress.computeAddress(gridFactory, GridAddress.gridKey(tokenA, tokenB, resolution));
        // PO_IC: invalid caller
        require(grid == msg.sender, "PO_IC");

        _register(grid);
    }

    function _register(address grid) internal {
        // PO_AR: already registered
        require(gridOracleStates[grid].capacity == 0, "PO_AR");

        gridOracleStates[grid].capacity = 1;
        gridOracleStates[grid].capacityNext = 1;
        gridPriceData[grid][0] = GridPriceData({
            blockTimestamp: uint32(block.timestamp),
            boundaryCumulative: 0,
            initialized: true
        });
    }

    /// @inheritdoc IPriceOracle
    function update(int24 boundary, uint32 blockTimestamp) external override {
        _update(msg.sender, boundary, blockTimestamp);
    }

    function _update(address grid, int24 boundary, uint32 blockTimestamp) internal {
        GridOracleState memory stateCache = gridOracleStates[grid];
        // PO_UR: unregistered grid
        require(stateCache.capacity >= 1, "PO_UR");

        GridPriceData storage lastData = gridPriceData[grid][stateCache.index];

        // safe for 0 or 1 overflows
        unchecked {
            uint32 delta = blockTimestamp - lastData.blockTimestamp;

            uint16 indexNext = (stateCache.index + 1) % stateCache.capacityNext;
            gridPriceData[grid][indexNext] = GridPriceData({
                blockTimestamp: blockTimestamp,
                boundaryCumulative: lastData.boundaryCumulative + int56(boundary) * int56(uint56(delta)),
                initialized: true
            });

            // In the interest of gas-efficiency, the capacity is set to be the same as capacityNext
            if (indexNext == stateCache.capacity) gridOracleStates[grid].capacity = stateCache.capacityNext;

            gridOracleStates[grid].index = indexNext;
        }
    }

    /// @inheritdoc IPriceOracle
    function increaseCapacity(address grid, uint16 capacityNext) external override {
        GridOracleState storage state = gridOracleStates[grid];
        // PO_UR: unregistered grid
        require(state.capacity >= 1, "PO_UR");

        uint16 capacityOld = state.capacityNext;
        if (capacityOld >= capacityNext) return;

        for (uint16 i = capacityOld; i < capacityNext; i++) {
            // In the interest of gas-efficiency the array is initialized at the specified index here
            // when updating the oracle price
            // Note: this data will not be used, because the initialized property is still false
            gridPriceData[grid][i].blockTimestamp = 1;
        }

        state.capacityNext = capacityNext;

        emit IncreaseCapacity(grid, capacityOld, capacityNext);
    }

    /// @inheritdoc IPriceOracle
    function getBoundaryCumulative(
        address grid,
        uint32 secondsAgo
    ) external view override returns (int56 boundaryCumulative) {
        GridOracleState memory state = gridOracleStates[grid];
        // PO_UR: unregistered grid
        require(state.capacity >= 1, "PO_UR");

        (, int24 boundary, , ) = IGrid(grid).slot0();

        return _getBoundaryCumulative(state, gridPriceData[grid], boundary, uint32(block.timestamp), secondsAgo);
    }

    /// @inheritdoc IPriceOracle
    function getBoundaryCumulatives(
        address grid,
        uint32[] calldata secondsAgos
    ) external view override returns (int56[] memory boundaryCumulatives) {
        GridOracleState memory state = gridOracleStates[grid];
        // PO_UR: unregistered grid
        require(state.capacity >= 1, "PO_UR");

        boundaryCumulatives = new int56[](secondsAgos.length);
        (, int24 boundary, , ) = IGrid(grid).slot0();
        uint32 blockTimestamp = uint32(block.timestamp);
        GridPriceData[65535] storage targetGridPriceData = gridPriceData[grid];
        for (uint256 i = 0; i < secondsAgos.length; i++) {
            boundaryCumulatives[i] = _getBoundaryCumulative(
                state,
                targetGridPriceData,
                boundary,
                blockTimestamp,
                secondsAgos[i]
            );
        }
    }

    /// @notice Get the time-cumulative boundary at a given time in the past
    /// @param blockTimestamp The timestamp of the current block
    /// @param secondsAgo The time elapsed (in seconds) in the past to get the price for
    /// @return boundaryCumulative The time-cumulative boundary at the given time
    function _getBoundaryCumulative(
        GridOracleState memory state,
        GridPriceData[65535] storage priceData,
        int24 boundary,
        uint32 blockTimestamp,
        uint32 secondsAgo
    ) internal view returns (int56 boundaryCumulative) {
        if (secondsAgo == 0) {
            GridPriceData memory last = priceData[state.index];
            if (last.blockTimestamp == blockTimestamp) return last.boundaryCumulative;

            unchecked {
                return last.boundaryCumulative + int56(boundary) * int56(uint56(blockTimestamp - last.blockTimestamp));
            }
        }

        uint32 targetTimestamp;
        unchecked {
            targetTimestamp = blockTimestamp - secondsAgo;
        }

        (GridPriceData memory beforePriceData, GridPriceData memory afterPriceData) = _getSurroundingPriceData(
            state,
            priceData,
            boundary,
            blockTimestamp,
            targetTimestamp
        );

        if (targetTimestamp == beforePriceData.blockTimestamp) {
            return beforePriceData.boundaryCumulative;
        } else if (targetTimestamp == afterPriceData.blockTimestamp) {
            return afterPriceData.boundaryCumulative;
        } else {
            // p = p_b + (p_a - p_b) / (t_a - t_b) * (t - t_b)
            unchecked {
                uint32 timestampDelta = targetTimestamp - beforePriceData.blockTimestamp;
                int88 boundaryCumulativeDelta = (int88(uint88(timestampDelta)) *
                    (afterPriceData.boundaryCumulative - beforePriceData.boundaryCumulative)) /
                    int32(afterPriceData.blockTimestamp - beforePriceData.blockTimestamp);
                return beforePriceData.boundaryCumulative + int56(boundaryCumulativeDelta);
            }
        }
    }

    /// @notice Get the surrounding price data for a given timestamp
    /// @param boundary The boundary of the grid at the current block
    /// @param blockTimestamp The timestamp of the current block
    /// @param targetTimestamp The timestamp to search for
    /// @return beforeOrAtPriceData The price data with the largest timestamp
    /// less than or equal to the target timestamp
    /// @return afterOrAtPriceData The price data with the smallest timestamp
    /// greater than or equal to the target timestamp
    function _getSurroundingPriceData(
        GridOracleState memory state,
        GridPriceData[65535] storage priceData,
        int24 boundary,
        uint32 blockTimestamp,
        uint32 targetTimestamp
    ) private view returns (GridPriceData memory beforeOrAtPriceData, GridPriceData memory afterOrAtPriceData) {
        beforeOrAtPriceData = priceData[state.index];

        if (_overflowSafeLTE(blockTimestamp, beforeOrAtPriceData.blockTimestamp, targetTimestamp)) {
            if (beforeOrAtPriceData.blockTimestamp != targetTimestamp) {
                // When the target time is greater than or equal to the last update time, it only needs to
                // calculate the time-cumulative price for the given time
                unchecked {
                    beforeOrAtPriceData = GridPriceData({
                        blockTimestamp: targetTimestamp,
                        boundaryCumulative: beforeOrAtPriceData.boundaryCumulative +
                            int56(boundary) *
                            (int56(uint56(targetTimestamp - beforeOrAtPriceData.blockTimestamp))),
                        initialized: false
                    });
                }
            }
            return (beforeOrAtPriceData, afterOrAtPriceData);
        }

        GridPriceData storage oldestPriceData = priceData[(state.index + 1) % state.capacity];
        if (!oldestPriceData.initialized) oldestPriceData = priceData[0];

        // PO_STL: secondsAgo is too large
        require(_overflowSafeLTE(blockTimestamp, oldestPriceData.blockTimestamp, targetTimestamp), "PO_STL");

        return _binarySearch(state, priceData, blockTimestamp, targetTimestamp);
    }

    /// @notice Binary search for the surrounding price data for a given timestamp
    /// @param blockTimestamp The timestamp of the current block
    /// @param targetTimestamp The timestamp to search for
    /// @return beforeOrAtPriceData The price data with the largest timestamp
    /// less than or equal to the target timestamp
    /// @return afterOrAtPriceData The price data with the smallest timestamp
    /// greater than or equal to the target timestamp
    function _binarySearch(
        GridOracleState memory state,
        GridPriceData[65535] storage priceData,
        uint32 blockTimestamp,
        uint32 targetTimestamp
    ) private view returns (GridPriceData memory beforeOrAtPriceData, GridPriceData memory afterOrAtPriceData) {
        uint256 left = (state.index + 1) % state.capacity;
        uint256 right = left + state.capacity - 1;
        uint256 mid;
        while (true) {
            mid = (left + right) / 2;

            beforeOrAtPriceData = priceData[mid % state.capacity];
            if (!beforeOrAtPriceData.initialized) {
                left = mid + 1;
                continue;
            }

            afterOrAtPriceData = priceData[(mid + 1) % state.capacity];

            bool targetAfterOrAt = _overflowSafeLTE(
                blockTimestamp,
                beforeOrAtPriceData.blockTimestamp,
                targetTimestamp
            );
            if (
                targetAfterOrAt && _overflowSafeLTE(blockTimestamp, targetTimestamp, afterOrAtPriceData.blockTimestamp)
            ) {
                return (beforeOrAtPriceData, afterOrAtPriceData);
            }

            if (!targetAfterOrAt) right = mid - 1;
            else left = mid + 1;
        }
    }

    /// @notice Compare the order of timestamps
    /// @dev blockTimestamp The timestamp of the current block
    /// @dev a First timestamp (in the past) to check
    /// @dev b Second timestamp (in the past) to check
    /// @return lte Result of a <= b
    function _overflowSafeLTE(uint32 blockTimestamp, uint32 a, uint32 b) private pure returns (bool lte) {
        if (a <= blockTimestamp && b <= blockTimestamp) return a <= b;
        unchecked {
            uint256 aAdjusted = a > blockTimestamp ? a : a + 2 ** 32;
            uint256 bAdjusted = b > blockTimestamp ? b : b + 2 ** 32;
            return aAdjusted <= bAdjusted;
        }
    }
}
