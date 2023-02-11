// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.9;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IGridFactory.sol";
import "./GridDeployer.sol";
import "./PriceOracle.sol";

/// @title The implementation of a Gridex grid factory
contract GridFactory is IGridFactory, Context, GridDeployer, Ownable {
    address public immutable override priceOracle;
    address public immutable weth9;
    mapping(int24 => int24) public override resolutions;
    /// @notice The first key and the second key are token addresses, and the third key is the resolution,
    /// and the value is the grid address
    /// @dev For tokenA/tokenB and the specified resolution, both the combination of tokenA/tokenB
    /// and the combination of tokenB/tokenA with resolution will be stored in the mapping
    mapping(address => mapping(address => mapping(int24 => address))) public override grids;

    constructor(address _weth9, bytes memory _gridPrefixCreationCode) {
        // GF_NC: not contract
        require(Address.isContract(_weth9), "GF_NC");

        priceOracle = address(new PriceOracle());
        weth9 = _weth9;

        _enableResolutions();

        _setGridPrefixCreationCode(_gridPrefixCreationCode);
    }

    function _enableResolutions() internal {
        resolutions[1] = 100;
        emit ResolutionEnabled(1, 100);

        resolutions[5] = 500;
        emit ResolutionEnabled(5, 500);

        resolutions[30] = 3000;
        emit ResolutionEnabled(30, 3000);
    }

    /// @inheritdoc IGridFactory
    function concatGridSuffixCreationCode(bytes memory gridSuffixCreationCode) external override onlyOwner {
        _concatGridSuffixCreationCode(gridSuffixCreationCode);
        renounceOwnership();
    }

    /// @inheritdoc IGridFactory
    function createGrid(address tokenA, address tokenB, int24 resolution) external override returns (address grid) {
        // GF_NI: not initialized
        require(owner() == address(0), "GF_NI");

        // GF_NC: not contract
        require(Address.isContract(tokenA), "GF_NC");
        require(Address.isContract(tokenB), "GF_NC");

        // GF_TAD: token address must be different
        require(tokenA != tokenB, "GF_TAD");
        // GF_PAE: grid already exists
        require(grids[tokenA][tokenB][resolution] == address(0), "GF_PAE");

        int24 takerFee = resolutions[resolution];
        // GF_RNE: resolution not enabled
        require(takerFee > 0, "GF_RNE");

        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        grid = deploy(token0, token1, resolution, takerFee, priceOracle, weth9);
        grids[tokenA][tokenB][resolution] = grid;
        grids[tokenB][tokenA][resolution] = grid;
        emit GridCreated(token0, token1, resolution, grid);
    }
}
