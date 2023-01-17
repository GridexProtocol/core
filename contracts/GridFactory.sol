// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.8;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IGridFactory.sol";
import "./GridDeployer.sol";
import "./PriceOracle.sol";

/// @title The implementation of a Gridex grid factory
contract GridFactory is IGridFactory, Context, GridDeployer, Ownable {
    int24 constant ALLOW_MAX_FEE = 1e4;

    address public immutable override priceOracle;
    address public immutable weth9;
    mapping(int24 => ResolutionConfig) public override resolutions;
    mapping(address => mapping(address => mapping(int24 => address))) public override grids;

    constructor(address _weth9, bytes memory _gridCreationCode) {
        // GF_NC: not contract
        require(Address.isContract(_weth9), "GF_NC");

        priceOracle = address(new PriceOracle());
        weth9 = _weth9;

        _enableResolutions();

        _changeGridCreationCode(_gridCreationCode);
    }

    function _enableResolutions() internal {
        resolutions[1] = ResolutionConfig({takerFee: 100, makerFee: -80});
        emit ResolutionEnabled(1, 100, -80);

        resolutions[5] = ResolutionConfig({takerFee: 500, makerFee: -400});
        emit ResolutionEnabled(5, 500, -400);

        resolutions[30] = ResolutionConfig({takerFee: 3000, makerFee: -2400});
        emit ResolutionEnabled(30, 3000, -2400);
    }

    /// @inheritdoc IGridFactory
    function createGrid(address tokenA, address tokenB, int24 resolution) external override returns (address grid) {
        // GF_NC: not contract
        require(Address.isContract(tokenA), "GF_NC");
        require(Address.isContract(tokenB), "GF_NC");

        // GF_TAD: token address must be different
        require(tokenA != tokenB, "GF_TAD");
        // GF_PAE: grid already exists
        require(grids[tokenA][tokenB][resolution] == address(0), "GF_PAE");

        ResolutionConfig memory resolutionCfg = resolutions[resolution];
        // GF_RNE: resolution not enabled
        require(resolutionCfg.takerFee > 0, "GF_RNE");

        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        grid = deploy(token0, token1, resolution, resolutionCfg.takerFee, resolutionCfg.makerFee, priceOracle, weth9);
        grids[tokenA][tokenB][resolution] = grid;
        grids[tokenB][tokenA][resolution] = grid;
        emit GridCreated(token0, token1, resolution, grid);
    }

    /// @inheritdoc IGridFactory
    function concatGridCreationCode(bytes memory code) external override onlyOwner {
        _concatGridCreationCode(code);
    }
}
