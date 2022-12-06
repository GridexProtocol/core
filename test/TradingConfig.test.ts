import {loadFixture} from "@nomicfoundation/hardhat-network-helpers";
import {expect} from "chai";
import {ethers} from "hardhat";
import {deployTradingConfig} from "./shared/deployer";

describe("TradingConfig", () => {
    async function deployFixture() {
        const [signer, otherAccount] = await ethers.getSigners();
        const tradingConfig = await deployTradingConfig();
        expect(tradingConfig.address).to.be.a.properAddress;
        expect(await tradingConfig.owner()).to.equal(signer.address);
        return {tradingConfig, signer, otherAccount};
    }

    describe("#fees", () => {
        describe("should return the fee", () => {
            const tests = [
                {
                    name: "resolution for 1",
                    resolution: 1,
                    expectTakerFee: 0.0001,
                    expectMakerFee: -0.00008,
                },
                {
                    name: "resolution for 5",
                    resolution: 5,
                    expectTakerFee: 0.0005,
                    expectMakerFee: -0.0004,
                },
                {
                    name: "resolution for 30",
                    resolution: 30,
                    expectTakerFee: 0.003,
                    expectMakerFee: -0.0024,
                },
                {
                    name: "resolution for 100",
                    resolution: 100,
                    expectTakerFee: 0,
                    expectMakerFee: 0,
                },
            ];
            tests.forEach(async (test) => {
                it(test.name, async () => {
                    const {tradingConfig} = await loadFixture(deployFixture);
                    const {takerFee, makerFee} = await tradingConfig.fees(test.resolution);
                    expect(takerFee / 1e6).to.equal(test.expectTakerFee);
                    expect(makerFee / 1e6).to.equal(test.expectMakerFee);
                });
            });
        });

        describe("#enableResolution", () => {
            it("should revert with the right error if called from another account", async () => {
                const {tradingConfig, otherAccount} = await loadFixture(deployFixture);
                await expect(tradingConfig.connect(otherAccount).enableResolution(20, 100, -100)).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                );
            });

            it("should revert with the right error if resolution is zero", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await expect(tradingConfig.enableResolution(0, 100, -100)).to.be.revertedWith("TC_RGZ");
            });

            it("should revert with the right error if resolution already enabled", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await expect(tradingConfig.enableResolution(1, 0, 0)).to.be.revertedWith("TC_RAE");
            });

            it("should revert with the right error if taker fee is zero", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await expect(tradingConfig.enableResolution(20, 0, 0)).to.be.revertedWith("TC_TFZ");
            });

            it("should revert with the right error if taker fee is less than zero", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await expect(tradingConfig.enableResolution(20, -100, 0)).to.be.revertedWith("TC_TFZ");
            });

            it("should revert with the right error if taker fee too large", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await expect(tradingConfig.enableResolution(20, 1e4 + 1, 0)).to.be.revertedWith("TC_TFL");
            });

            it("should revert with the right error if maker fee is greater than zero", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await expect(tradingConfig.enableResolution(20, 100, 1)).to.be.revertedWith("TC_IMF");
            });

            it("should revert with the right error if abs(maker fee) over than taker fee", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await expect(tradingConfig.enableResolution(20, 100, -200)).to.be.revertedWith("TC_IMF");
            });

            it("should enable resolution", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await expect(tradingConfig.enableResolution(20, 1e4, -1e4))
                    .to.emit(tradingConfig, "ResolutionEnabled")
                    .withArgs(20, 1e4, -1e4);

                const {takerFee, makerFee} = await tradingConfig.fees(20);
                expect(takerFee).to.equal(1e4);
                expect(makerFee).to.equal(-1e4);
            });
        });

        describe("#updateResolution", () => {
            it("should revert with the right error if called from another account", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await tradingConfig.enableResolution(20, 100, -100);
                const signers = await ethers.getSigners();
                await expect(tradingConfig.connect(signers[1]).updateResolution(20, 100, -100)).to.be.revertedWith(
                    "Ownable: caller is not the owner"
                );
            });

            it("should revert with the right error if resolution disabled", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await expect(tradingConfig.updateResolution(2, 100, -100)).to.be.revertedWith("TC_RME");
            });

            it("should revert with the right error if taker fee is zero", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await tradingConfig.enableResolution(20, 100, -100);
                await expect(tradingConfig.updateResolution(20, 0, 0)).to.be.revertedWith("TC_TFZ");
            });

            it("should revert with the right error if taker fee is less than zero", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await tradingConfig.enableResolution(20, 100, -100);
                await expect(tradingConfig.updateResolution(20, -100, 0)).to.be.revertedWith("TC_TFZ");
            });

            it("should revert with the right error if taker fee too large", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await tradingConfig.enableResolution(20, 100, -100);
                await expect(tradingConfig.updateResolution(20, 1e4 + 1, 0)).to.be.revertedWith("TC_TFL");
            });

            it("should revert with the right error if maker fee is greater than zero", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await tradingConfig.enableResolution(20, 100, -100);
                await expect(tradingConfig.updateResolution(20, 100, 1)).to.be.revertedWith("TC_IMF");
            });

            it("should revert with the right error if abs(maker fee) over than taker fee", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await tradingConfig.enableResolution(20, 100, -100);
                await expect(tradingConfig.updateResolution(20, 100, -200)).to.be.revertedWith("TC_IMF");
            });

            it("should update resolution success", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await tradingConfig.enableResolution(20, 100, -100);
                await expect(tradingConfig.updateResolution(20, 1e4, -1e4))
                    .to.emit(tradingConfig, "ResolutionUpdated")
                    .withArgs(20, 1e4, -1e4);

                const {takerFee, makerFee} = await tradingConfig.fees(20);
                expect(takerFee).to.equal(1e4);
                expect(makerFee).to.equal(-1e4);
            });
        });

        describe("#transferProtocolFeeCollector", () => {
            it("should revert with the right error if called from another account", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                const signers = await ethers.getSigners();
                await expect(
                    tradingConfig.connect(signers[1]).transferProtocolFeeCollector(signers[0].address)
                ).to.be.revertedWith("Ownable: caller is not the owner");
            });

            it("should revert with the right error if new protocol fee collector is zero address", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                await expect(
                    tradingConfig.transferProtocolFeeCollector(ethers.constants.AddressZero)
                ).to.be.revertedWith("TC_PFCZ");
            });

            it("should transfer protocol fee collector success", async () => {
                const {tradingConfig} = await loadFixture(deployFixture);
                const signers = await ethers.getSigners();
                await expect(tradingConfig.transferProtocolFeeCollector(signers[1].address))
                    .to.emit(tradingConfig, "ProtocolFeeCollectorTransferred")
                    .withArgs(signers[0].address, signers[0].address, signers[1].address);

                expect(await tradingConfig.protocolFeeCollector()).to.equal(signers[1].address);
            });
        });
    });
});
