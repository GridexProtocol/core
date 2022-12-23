// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/utils/Context.sol";
import "./interfaces/IGridFactory.sol";
import "./interfaces/ITradingConfig.sol";
import "./GridDeployer.sol";
import "./PriceOracle.sol";

/// @title The implementation of a Gridex grid factory
contract GridFactory is IGridFactory, Context, GridDeployer {
    address public immutable override tradingConfig;
    address public immutable override priceOracle;
    address public immutable weth9;
    mapping(address => mapping(address => mapping(int24 => address))) public override grids;

    constructor(address _tradingConfig, address _weth9, bytes memory _gridCreationCode) {
        // GF_NC: not contract
        require(Address.isContract(_tradingConfig), "GF_NC");
        require(Address.isContract(_weth9), "GF_NC");

        tradingConfig = _tradingConfig;
        priceOracle = address(new PriceOracle());
        weth9 = _weth9;

        _changeGridCreationCode(_gridCreationCode);
    }

    /// @inheritdoc IGridFactory
    function createGrid(address tokenA, address tokenB, int24 resolution) external override returns (address grid) {
        // GF_NC: not contract
        require(Address.isContract(tokenA), "GF_NC");
        require(Address.isContract(tokenB), "GF_NC");

        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        // GF_TAD: token address must be different
        require(tokenA != tokenB, "GF_TAD");
        // GF_PAE: grid already exists
        require(grids[tokenA][tokenB][resolution] == address(0), "GF_PAE");
        (int24 takerFee, ) = ITradingConfig(tradingConfig).fees(resolution);
        // GF_RNE: resolution not enabled
        require(takerFee > 0, "GF_RNE");

        grid = deploy(token0, token1, resolution, tradingConfig, priceOracle, weth9);
        grids[tokenA][tokenB][resolution] = grid;
        grids[tokenB][tokenA][resolution] = grid;
        emit GridCreated(token0, token1, resolution, grid);
    }
}
