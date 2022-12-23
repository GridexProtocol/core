// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity ^0.8.0;

/// @title The interface for the price oracle
interface IPriceOracle {
    /// @notice Emitted when the capacity of the array in which the oracle can store prices has increased.
    /// @param grid The grid address whose capacity has been increased
    /// @param capacityOld Array capacity before the increase in capacity
    /// @param capacityNew Array capacity after the increase in capacity
    event IncreaseCapacity(address indexed grid, uint16 capacityOld, uint16 capacityNew);

    struct GridPriceData {
        /// @dev The block timestamp of the price data
        uint32 blockTimestamp;
        /// @dev The time-cumulative boundary
        int56 boundaryCumulative;
        /// @dev Whether or not the price data is initialized
        bool initialized;
    }

    struct GridOracleState {
        /// @dev The index of the last updated price
        uint16 index;
        /// @dev The array capacity used by the oracle
        uint16 capacity;
        /// @dev The capacity of the array that the oracle can use
        uint16 capacityNext;
    }

    /// @notice Returns the state of the oracle for a given grid
    /// @param grid The grid to retrieve the state of
    /// @return index The index of the last updated price
    /// @return capacity The array capacity used by the oracle
    /// @return capacityNext The capacity of the array that the oracle can use
    function gridOracleStates(address grid) external view returns (uint16 index, uint16 capacity, uint16 capacityNext);

    /// @notice Returns the price data of the oracle for a given grid and index
    /// @param grid The grid to get the price data of
    /// @param index The index of the price data to get
    /// @return blockTimestamp The block timestamp of the price data
    /// @return boundaryCumulative The time-cumulative boundary
    /// @return initialized Whether or not the price data is initialized
    function gridPriceData(
        address grid,
        uint256 index
    ) external view returns (uint32 blockTimestamp, int56 boundaryCumulative, bool initialized);

    /// @notice Register a grid to the oracle using a given token pair and resolution
    /// @param tokenA The contract address of either token0 or token1
    /// @param tokenB The contract address of the other token
    /// @param resolution The step size in initialized boundaries for a grid created with a given fee
    function register(address tokenA, address tokenB, int24 resolution) external;

    /// @notice Update the oracle price
    /// @param boundary The new boundary to write to the oracle
    /// @param blockTimestamp The timestamp of the oracle price to write
    function update(int24 boundary, uint32 blockTimestamp) external;

    /// @notice Increase the storage capacity of the oracle
    /// @param grid The grid whose capacity is to be increased
    /// @param capacityNext Array capacity after increase in capacity
    function increaseCapacity(address grid, uint16 capacityNext) external;

    /// @notice Get the time-cumulative price for a given time
    /// @param grid Get the price of a grid address
    /// @param secondsAgo The time elapsed (in seconds) to get the boundary for
    /// @return boundaryCumulative The time-cumulative boundary for the given time
    function getBoundaryCumulative(address grid, uint32 secondsAgo) external view returns (int56 boundaryCumulative);

    /// @notice Get a list of time-cumulative boundaries for given times
    /// @param grid The grid address to get the boundaries of
    /// @param secondsAgos A list of times elapsed (in seconds) to get the boundaries for
    /// @return boundaryCumulatives The list of time-cumulative boundaries for the given times
    function getBoundaryCumulatives(
        address grid,
        uint32[] calldata secondsAgos
    ) external view returns (int56[] memory boundaryCumulatives);
}
